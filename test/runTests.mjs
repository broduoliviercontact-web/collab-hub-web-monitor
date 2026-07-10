// Tests unitaires des modules purs (Lot 1). Sans dépendance : node:test + node:assert.
// Lance avec : npm test   (-> node --test test/runTests.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeValue, routeControl, KNOWN_HEADERS } from '../src/collabHub/messageRouter.js';
import { createSoundState, DEFAULTS } from '../src/state/soundState.js';
import { renderField, isSafeHttpUrl } from '../src/ui/renderSoundInfo.js';
import { createObserveGuard, wireSocket } from '../src/collabHub/observeGuard.js';
import { resolveAuthMode, resolveAuth, buildSocketUrl } from '../src/collabHub/authMode.js';
import {
  loadSoundState, saveSoundState, clearSoundState,
  STORAGE_KEY, STORAGE_VERSION,
} from '../src/state/persist.js';
import {
  createFreshnessState, computePublicStatus,
  MAX_ACTIVE_THRESHOLD_MS, CONTENT_FRESH_THRESHOLD_MS, HEARTBEAT_HEADER,
} from '../src/state/freshness.js';
import { verifyMetadata, LICENSE_MARKERS, REQUIRED } from '../scripts/check-license.mjs';

// --- Faux storage (Map) pour les tests de persistance ---
function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    _has: (k) => store.has(k),
  };
}

// --- Fake DOM minimal (pas de jsdom) ---
function fakeEl() {
  const set = new Set();
  return {
    textContent: '',
    hidden: false,
    _attrs: {},
    classList: { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    offsetWidth: 0,
  };
}
function fakeEls() {
  return {
    title: fakeEl(), author: fakeEl(), subtitle: fakeEl(),
    description: fakeEl(), linkWrap: fakeEl(), link: fakeEl(),
  };
}

// 1. normalisation tableau 1 élément
test('normalizeValue : ["Premier morceau"] -> "Premier morceau"', () => {
  assert.equal(normalizeValue(['Premier morceau']), 'Premier morceau');
});

// 2. normalisation tableau plusieurs éléments
test('normalizeValue : ["Premier", "morceau"] -> "Premier morceau"', () => {
  assert.equal(normalizeValue(['Premier', 'morceau']), 'Premier morceau');
});

// 3. normalisation scalaire
test('normalizeValue : "Titre" -> "Titre" ; absent -> "" ; nombre -> chaîne', () => {
  assert.equal(normalizeValue('Titre'), 'Titre');
  assert.equal(normalizeValue(undefined), '');
  assert.equal(normalizeValue(null), '');
  assert.equal(normalizeValue(42), '42');
});

// 4. header inconnu ignoré
test('routeControl ignore les headers inconnus', () => {
  let called = false;
  const routed = routeControl({ header: 'unknown', values: ['x'] }, () => { called = true; });
  assert.equal(routed, false);
  assert.equal(called, false);
});

test('routeControl route les headers connus avec valeur normalisée', () => {
  let received = null;
  const routed = routeControl({ header: 'sound_title', values: ['Premier', 'morceau'] }, (h, v) => { received = { h, v }; });
  assert.equal(routed, true);
  assert.deepEqual(received, { h: 'sound_title', v: 'Premier morceau' });
});

// 5. URL https valide acceptée
test('isSafeHttpUrl accepte http/https', () => {
  assert.equal(isSafeHttpUrl('https://example.com'), true);
  assert.equal(isSafeHttpUrl('http://example.com/path?q=1'), true);
});

// 6. URL javascript refusée (+ data, vide)
test('isSafeHttpUrl refuse javascript:, data:, vide, non-URL', () => {
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,xxx'), false);
  assert.equal(isSafeHttpUrl(''), false);
  assert.equal(isSafeHttpUrl('   '), false);
  assert.equal(isSafeHttpUrl('not a url'), false);
});

// 7. sound_link vide masque le lien
test('renderField sound_link vide -> lien masqué', () => {
  const els = fakeEls();
  renderField('sound_link', '', els);
  assert.equal(els.linkWrap.hidden, true);
});

test('renderField sound_link valide -> lien visible + href', () => {
  const els = fakeEls();
  renderField('sound_link', 'https://example.com', els);
  assert.equal(els.linkWrap.hidden, false);
  assert.equal(els.link.getAttribute('href'), 'https://example.com');
});

test('renderField sound_link javascript: -> lien masqué', () => {
  const els = fakeEls();
  renderField('sound_link', 'javascript:alert(1)', els);
  assert.equal(els.linkWrap.hidden, true);
  assert.equal(els.link.getAttribute('href'), '#');
});

// 8. sound_title met à jour le bon élément
test('renderField sound_title met à jour le titre seulement', () => {
  const els = fakeEls();
  els.author.textContent = 'auteur';
  els.subtitle.textContent = 'sous';
  renderField('sound_title', 'Nouveau titre', els);
  assert.equal(els.title.textContent, 'Nouveau titre');
  // 9. les autres champs restent inchangés
  assert.equal(els.author.textContent, 'auteur');
  assert.equal(els.subtitle.textContent, 'sous');
  assert.equal(els.description.textContent, '');
});

// 9. état : un seul header reçu ne change que ce champ
test('soundState.set ne modifie que le header concerné', () => {
  const s = createSoundState(DEFAULTS);
  const before = s.snapshot();
  s.set('sound_title', 'Nouveau');
  const after = s.snapshot();
  assert.equal(after.sound_title, 'Nouveau');
  assert.equal(after.sound_author, before.sound_author);
  assert.equal(after.sound_subtitle, before.sound_subtitle);
  assert.equal(after.sound_description, before.sound_description);
  assert.equal(after.sound_link, before.sound_link);
});

test('soundState.set refuse un header inconnu', () => {
  const s = createSoundState(DEFAULTS);
  assert.equal(s.set('unknown', 'x'), false);
});

test('KNOWN_HEADERS contient exactement les 5 headers', () => {
  assert.deepEqual(KNOWN_HEADERS, ['sound_title', 'sound_author', 'sound_subtitle', 'sound_description', 'sound_link']);
});

// --- Lot 1.1 : observation idempotente (observeGuard / wireSocket) ---

// Fake socket minimal pour tester wireSocket (pas de socket.io-client réel).
function fakeSocket() {
  const handlers = {};
  return {
    on(evt, fn) { (handlers[evt] ||= []).push(fn); },
    emit() {},
    fire(evt, ...args) { (handlers[evt] || []).forEach((fn) => fn(...args)); },
    listenerCount(evt) { return (handlers[evt] || []).length; },
  };
}

// 10. un header observé deux fois -> émis une seule fois
test('observeGuard : header observé 2x n émet qu une fois', () => {
  const emitted = [];
  const g = createObserveGuard({ emit: (h) => emitted.push(h) });
  g.setConnected(true);
  assert.equal(g.observeHeaderOnce('sound_title'), true);
  assert.equal(g.observeHeaderOnce('sound_title'), false);
  assert.deepEqual(emitted, ['sound_title']);
});

// 11. cinq headers observés deux fois -> exactement 5 émissions
test('observeGuard : 5 headers x2 -> 5 émissions, tous marqués observés', () => {
  const emitted = [];
  const g = createObserveGuard({ emit: (h) => emitted.push(h) });
  g.setConnected(true);
  g.observeKnownHeadersOnce();
  g.observeKnownHeadersOnce();
  assert.equal(emitted.length, 5);
  assert.deepEqual(emitted.sort(), [...KNOWN_HEADERS].sort());
  assert.equal(KNOWN_HEADERS.every((h) => g.isObserved(h)), true);
  assert.equal(g.observedCount(), 5);
});

// 12. après reset (disconnect), on peut réobserver
test('observeGuard : disconnect vide le suivi, reconnect permet de réobserver', () => {
  const emitted = [];
  const g = createObserveGuard({ emit: (h) => emitted.push(h) });
  g.setConnected(true);
  g.observeHeaderOnce('sound_title');
  g.setConnected(false); // vrai disconnect
  assert.equal(g.isObserved('sound_title'), false);
  g.setConnected(true);
  assert.equal(g.observeHeaderOnce('sound_title'), true); // réobservable
  assert.equal(emitted.filter((h) => h === 'sound_title').length, 2);
});

// 13. header inconnu non observé par observeKnownHeadersOnce
test('observeGuard : observeKnownHeadersOnce n observe pas un header inconnu', () => {
  const g = createObserveGuard({ emit: () => {} });
  g.setConnected(true);
  g.observeKnownHeadersOnce();
  assert.equal(g.isObserved('unknown'), false);
  assert.equal(g.observedCount(), 5);
});

// 14. changement de socket.id réinitialise l état (disconnect puis connect)
test('observeGuard : un header extra est oublié après disconnect', () => {
  const g = createObserveGuard({ emit: () => {} });
  g.setConnected(true);
  g.observeHeaderOnce('diag_custom');
  assert.equal(g.isObserved('diag_custom'), true);
  g.setConnected(false); // nouveau socket.id -> reset
  assert.equal(g.isObserved('diag_custom'), false);
});

// 15. wireSocket : un seul listener par événement + observation idempotente
test('wireSocket : un listener par event, réobservation idempotente sur reconnect', () => {
  const sock = fakeSocket();
  const emitted = [];
  const guard = createObserveGuard({ emit: (h) => emitted.push(h) });
  wireSocket(sock, guard, { onStatus: () => {}, onControl: () => {} });
  for (const e of ['connect', 'reconnect', 'reconnect_attempt', 'disconnect', 'connect_error', 'control']) {
    assert.equal(sock.listenerCount(e), 1, `listener unique pour ${e}`);
  }
  sock.fire('connect');            // connexion initiale -> 6 émissions (5 contenus + heartbeat)
  assert.equal(emitted.length, 6);
  sock.fire('reconnect');          // déclenche aussi connect ensuite -> déjà observé
  assert.equal(emitted.length, 6);
  sock.fire('disconnect');         // vide le guard
  sock.fire('connect');            // reconnect -> 6 nouvelles
  assert.equal(emitted.length, 12);
});

// 16. forget() permet de réobserver après un unobserve explicite
test('observeGuard : forget permet de réobserver après unobserve', () => {
  const emitted = [];
  const g = createObserveGuard({ emit: (h) => emitted.push(h) });
  g.setConnected(true);
  g.observeHeaderOnce('sound_title');
  g.forget('sound_title');
  assert.equal(g.observeHeaderOnce('sound_title'), true);
  assert.equal(emitted.filter((h) => h === 'sound_title').length, 2);
});

// --- Mode d'authentification (Lot 2C) ---

// 17. resolveAuth anonymous : AUCUNE requête vers /api/v1/auth/guest
test('resolveAuth anonymous : aucun fetch /api/v1/auth/guest', async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; return Promise.resolve({ ok: false, json: () => Promise.resolve({}) }); };
  const auth = await resolveAuth({ serverUrl: 'https://server.collab-hub.io', username: 'u', authMode: 'anonymous', fetchImpl });
  assert.equal(calls, 0, 'anonymous ne doit pas appeler fetch');
  assert.deepEqual(auth, {});
});

// 18. resolveAuth guest : tente /api/v1/auth/guest et utilise le token
test('resolveAuth guest : POST /api/v1/auth/guest + token utilisé', async () => {
  let calledWith = null;
  const fetchImpl = (url, opts) => {
    calledWith = { url, opts };
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ accessToken: 'tok-123' }) });
  };
  const auth = await resolveAuth({ serverUrl: 'https://server.collab-hub.io', username: 'u', authMode: 'guest', fetchImpl });
  assert.equal(calledWith.url, 'https://server.collab-hub.io/api/v1/auth/guest');
  assert.equal(calledWith.opts.method, 'POST');
  assert.deepEqual(auth, { token: 'tok-123' });
});

// 19. mode inconnu -> fallback anonyme (safe, pas de fetch)
test('resolveAuthMode : mode inconnu -> anonymous', async () => {
  assert.equal(resolveAuthMode('anonymous'), 'anonymous');
  assert.equal(resolveAuthMode('guest'), 'guest');
  assert.equal(resolveAuthMode('bogus'), 'anonymous');
  assert.equal(resolveAuthMode(undefined), 'anonymous');
  let calls = 0;
  const fetchImpl = () => { calls++; return Promise.resolve({ ok: false, json: () => Promise.resolve({}) }); };
  const auth = await resolveAuth({ serverUrl: 'https://server.collab-hub.io', username: 'u', authMode: 'bogus', fetchImpl });
  assert.equal(calls, 0);
  assert.deepEqual(auth, {});
});

// 20. buildSocketUrl conserve le namespace /hub (pas de slash initial)
test('buildSocketUrl : namespace /hub sans slash initial', () => {
  assert.equal(buildSocketUrl('https://server.collab-hub.io', 'hub'), 'https://server.collab-hub.io/hub');
  assert.equal(buildSocketUrl('https://server.collab-hub.io/', '/hub/'), 'https://server.collab-hub.io/hub');
  assert.equal(buildSocketUrl('https://server.collab-hub.io', ''), 'https://server.collab-hub.io');
});

// --- Persistance locale (Lot 3A) ---

const SNAP = {
  sound_title: 'Morceau A',
  sound_author: 'Auteur A',
  sound_subtitle: 'Sous-titre A',
  sound_description: 'Desc A',
  sound_link: 'https://example.com/a',
};
const FIXED_TS = '2026-07-10T14:00:00.000Z';
const fixedNow = () => FIXED_TS;

// 1. état valide restauré
test('persist : état valide restauré depuis localStorage', () => {
  const st = fakeStorage();
  saveSoundState(st, SNAP, fixedNow);
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_title, 'Morceau A');
  assert.equal(r.fields.sound_author, 'Auteur A');
  assert.equal(r.fields.sound_link, 'https://example.com/a');
  assert.equal(r.updatedAt, FIXED_TS);
});

// 2. JSON corrompu ignoré
test('persist : JSON corrompu ignoré (retour défauts)', () => {
  const st = fakeStorage();
  st.setItem(STORAGE_KEY, '{not valid json');
  assert.equal(loadSoundState(st), null);
});

// 3. version inconnue ignorée
test('persist : version inconnue ignorée', () => {
  const st = fakeStorage();
  st.setItem(STORAGE_KEY, JSON.stringify({ version: 99, updatedAt: FIXED_TS, fields: SNAP }));
  assert.equal(loadSoundState(st), null);
});

// 4. header inconnu ignoré, connus conservés
test('persist : header inconnu ignoré, connus conservés', () => {
  const st = fakeStorage();
  st.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, updatedAt: FIXED_TS, fields: { ...SNAP, unknown: 'x', evil: '<script>' } }));
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_title, 'Morceau A');
  assert.equal(r.fields.unknown, undefined);
  assert.equal(r.fields.evil, undefined);
});

// 5. type non string ignoré
test('persist : type non string ignoré', () => {
  const st = fakeStorage();
  const bad = { ...SNAP, sound_title: 123, sound_author: { x: 1 }, sound_subtitle: null };
  st.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, updatedAt: FIXED_TS, fields: bad }));
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_title, undefined);
  assert.equal(r.fields.sound_author, undefined);
  assert.equal(r.fields.sound_subtitle, undefined);
  assert.equal(r.fields.sound_link, 'https://example.com/a'); // valide conservé
});

// 6. sound_link invalide masqué après restauration (validation URL au rendu)
test('persist : sound_link invalide restauré puis masqué au rendu', () => {
  const st = fakeStorage();
  st.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, updatedAt: FIXED_TS, fields: { ...SNAP, sound_link: 'javascript:alert(1)' } }));
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_link, 'javascript:alert(1)'); // gardé brut en stockage
  // Au rendu, la validation URL existante masque le lien invalide.
  const els = fakeEls();
  renderField('sound_link', r.fields.sound_link, els);
  assert.equal(els.linkWrap.hidden, true);
  assert.equal(els.link.getAttribute('href'), '#');
});

// 7. sauvegarde après réception d'un contrôle (round-trip via routeControl)
test('persist : sauvegarde après réception d un contrôle', () => {
  const st = fakeStorage();
  const state = createSoundState(DEFAULTS);
  const routed = routeControl({ header: 'sound_title', values: ['Nouveau morceau'] }, (h, v) => state.set(h, v));
  assert.equal(routed, true);
  const saved = saveSoundState(st, state.snapshot(), fixedNow);
  assert.ok(saved, 'sauvegarde a écrit un payload');
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_title, 'Nouveau morceau');
});

// 8. timestamp sauvegardé
test('persist : timestamp sauvegardé', () => {
  const st = fakeStorage();
  const ts = '2026-07-10T14:05:33.000Z';
  saveSoundState(st, SNAP, () => ts);
  const r = loadSoundState(st);
  assert.equal(r.updatedAt, ts);
  // le payload brut contient bien updatedAt + version
  const raw = JSON.parse(st.getItem(STORAGE_KEY));
  assert.equal(raw.version, STORAGE_VERSION);
  assert.equal(raw.updatedAt, ts);
});

// 9. effacement du stockage
test('persist : clearSoundState efface la clé', () => {
  const st = fakeStorage();
  saveSoundState(st, SNAP, fixedNow);
  assert.equal(st._has(STORAGE_KEY), true);
  assert.equal(clearSoundState(st), true);
  assert.equal(st._has(STORAGE_KEY), false);
  assert.equal(loadSoundState(st), null);
});

// 10. absence de localStorage ne casse pas l'application
test('persist : storage nul/manquant ne lève jamais', () => {
  assert.equal(loadSoundState(null), null);
  assert.equal(loadSoundState(undefined), null);
  assert.equal(saveSoundState(null, SNAP, fixedNow), false);
  assert.equal(clearSoundState(null), false);
  // storage sans les méthodes attendues
  assert.equal(loadSoundState({}), null);
  assert.equal(saveSoundState({}, SNAP, fixedNow), false);
});

// --- Fraîcheur / heartbeat Max (Lot 3B) ---
// Horloge injectable pour des tests déterministes (avance manuelle du temps).
function makeClock(start) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

// 1. heartbeat met à jour maxLastSeenAt (pas le contenu)
test('freshness : heartbeat met à jour maxLastSeenAt, pas le contenu', () => {
  const c = makeClock(1000);
  const f = createFreshnessState({ now: c.now });
  f.onHeartbeat();
  assert.equal(f.getMaxLastSeenAt(), 1000);
  assert.equal(f.getContentLastUpdatedAt(), null); // contenu non touché
});

// 2. heartbeat ne modifie aucun champ de contenu
test('freshness : heartbeat n altère pas contentLastUpdatedAt', () => {
  const c = makeClock(5000);
  const f = createFreshnessState({ now: c.now });
  f.onContentUpdate(); // contenu daté
  assert.equal(f.getContentLastUpdatedAt(), 5000);
  f.onHeartbeat();     // heartbeat arrive
  assert.equal(f.getContentLastUpdatedAt(), 5000); // contenu inchangé
  assert.equal(f.getMaxLastSeenAt(), 5000);
});

// 3. heartbeat n est pas persisté (loadSoundState ne contient jamais sound_heartbeat)
test('freshness : sound_heartbeat absent de l état persisté', () => {
  const st = fakeStorage();
  // On simule une sauvegarde après réception d un heartbeat + contenu.
  const state = createSoundState(DEFAULTS);
  state.set('sound_title', 'Titre');
  // Le heartbeat n entre jamais dans state (header technique) -> snapshot ne le contient pas.
  const snap = state.snapshot();
  assert.equal(snap.sound_heartbeat, undefined);
  assert.equal(snap.sound_title, 'Titre');
  saveSoundState(st, snap, fixedNow);
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_heartbeat, undefined);
  assert.equal(r.fields.sound_title, 'Titre');
});

// 4. Max actif sous le seuil
test('freshness : Max actif si heartbeat < MAX_ACTIVE_THRESHOLD_MS', () => {
  const c = makeClock(0);
  const f = createFreshnessState({ now: c.now });
  assert.equal(f.isMaxActive(), false); // jamais de heartbeat
  f.onHeartbeat();
  c.advance(MAX_ACTIVE_THRESHOLD_MS - 1);
  assert.equal(f.isMaxActive(), true);
});

// 5. Max silencieux au-dessus du seuil
test('freshness : Max silencieux si heartbeat > MAX_ACTIVE_THRESHOLD_MS', () => {
  const c = makeClock(0);
  const f = createFreshnessState({ now: c.now });
  f.onHeartbeat();
  c.advance(MAX_ACTIVE_THRESHOLD_MS + 1);
  assert.equal(f.isMaxActive(), false);
});

// 6. contenu récent sous le seuil
test('freshness : contenu récent si màj < CONTENT_FRESH_THRESHOLD_MS', () => {
  const c = makeClock(0);
  const f = createFreshnessState({ now: c.now });
  f.onContentUpdate();
  c.advance(CONTENT_FRESH_THRESHOLD_MS - 1);
  assert.equal(f.isContentFresh(), true);
});

// 7. contenu ancien au-dessus du seuil
test('freshness : contenu ancien si màj > CONTENT_FRESH_THRESHOLD_MS', () => {
  const c = makeClock(0);
  const f = createFreshnessState({ now: c.now });
  f.onContentUpdate();
  c.advance(CONTENT_FRESH_THRESHOLD_MS + 1);
  assert.equal(f.isContentFresh(), false);
});

// 8. contenu restauré ancien correctement détecté
test('freshness : contenu restauré ancien détecté via restoreContent', () => {
  const c = makeClock(10_000_000); // now lointain
  const f = createFreshnessState({ now: c.now });
  f.restoreContent(c.now() - (CONTENT_FRESH_THRESHOLD_MS + 5000)); // restauré vieux
  assert.equal(f.isContentFresh(), false);
  f.restoreContent(c.now() - 1000); // restauré récent
  assert.equal(f.isContentFresh(), true);
});

// 9. server disconnect prioritaire sur Max actif
test('freshness : computePublicStatus priorise le serveur sur Max actif', () => {
  const f = createFreshnessState();
  f.setServerStatus('connected');
  f.onHeartbeat();
  assert.equal(computePublicStatus('connected', true), 'max_active');
  assert.equal(computePublicStatus('connected', false), 'max_silent');
  // serveur down : on ne montre jamais max_active/silent
  assert.equal(computePublicStatus('disconnected', true), 'disconnected');
  assert.equal(computePublicStatus('error', true), 'disconnected');
  assert.equal(computePublicStatus('reconnecting', true), 'reconnecting');
});

// 10. aucun listener/timer dupliqué : wireSocket attache un listener unique
test('freshness : un seul listener par event (pas de doublon wireSocket)', () => {
  const sock = fakeSocket();
  const guard = createObserveGuard({ emit: () => {} });
  wireSocket(sock, guard, { onStatus: () => {}, onControl: () => {} });
  for (const e of ['connect', 'reconnect', 'reconnect_attempt', 'disconnect', 'connect_error', 'control']) {
    assert.equal(sock.listenerCount(e), 1, `listener unique pour ${e}`);
  }
});

// 11. setServerStatus reflète la connexion
test('freshness : setServerStatus reflète connecté/déconnecté', () => {
  const f = createFreshnessState();
  assert.equal(f.isServerConnected(), false);
  f.setServerStatus('connected');
  assert.equal(f.isServerConnected(), true);
  f.setServerStatus('disconnected');
  assert.equal(f.isServerConnected(), false);
  f.setServerStatus('error');
  assert.equal(f.isServerConnected(), false);
});

// 12. âges retournent null quand jamais reçu
test('freshness : ages null tant qu aucun heartbeat/màj', () => {
  const f = createFreshnessState();
  assert.equal(f.maxAgeMs(), null);
  assert.equal(f.contentAgeMs(), null);
  f.onHeartbeat();
  assert.ok(f.maxAgeMs() >= 0);
  assert.equal(f.contentAgeMs(), null);
});

// 13. header technique sound_heartbeat défini
test('freshness : HEARTBEAT_HEADER = sound_heartbeat', () => {
  assert.equal(HEARTBEAT_HEADER, 'sound_heartbeat');
  assert.equal(MAX_ACTIVE_THRESHOLD_MS, 25000);
  assert.equal(CONTENT_FRESH_THRESHOLD_MS, 300000);
});

// --- check-license.mjs : fonctions pures (Lot 3F) ---
// Données valides de référence (ne touche pas aux vrais fichiers).
const VALID_LICENSE = ['GNU GENERAL PUBLIC LICENSE', 'Version 3, 29 June 2007',
  'END OF TERMS AND CONDITIONS', '...corps...'].join('\n');
const VALID_PKG = { name: REQUIRED.name, version: REQUIRED.version, license: REQUIRED.license };
const VALID_README = `# ...\nLicence : ${REQUIRED.license}\n...`;

// 14. métadonnées valides -> ok
test('check-license : métadonnées valides -> ok', () => {
  const r = verifyMetadata({ license: VALID_LICENSE, pkg: VALID_PKG, readme: VALID_README, lock: null });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

// 15. marqueurs manquants -> échec
test('check-license : marqueur GPL manquant -> échec', () => {
  const bad = VALID_LICENSE.replace('GNU GENERAL PUBLIC LICENSE', 'xxx');
  const r = verifyMetadata({ license: bad, pkg: VALID_PKG, readme: VALID_README, lock: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('GNU GENERAL PUBLIC LICENSE')));
});

// 16. mauvais nom de package -> échec
test('check-license : mauvais name -> échec', () => {
  const r = verifyMetadata({ license: VALID_LICENSE, pkg: { ...VALID_PKG, name: 'old-spike' }, readme: VALID_README, lock: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('name')));
});

// 17. mauvaise version -> échec
test('check-license : mauvaise version -> échec', () => {
  const r = verifyMetadata({ license: VALID_LICENSE, pkg: { ...VALID_PKG, version: '0.0.0' }, readme: VALID_README, lock: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('version')));
});

// 18. licence SPDX or-later -> échec (package + texte)
test('check-license : GPL-3.0-or-later rejeté (pkg + LICENSE)', () => {
  const r1 = verifyMetadata({ license: VALID_LICENSE, pkg: { ...VALID_PKG, license: 'GPL-3.0-or-later' }, readme: VALID_README, lock: null });
  assert.equal(r1.ok, false);
  const r2 = verifyMetadata({ license: VALID_LICENSE + '\nGPL-3.0-or-later', pkg: VALID_PKG, readme: VALID_README, lock: null });
  assert.equal(r2.ok, false);
});

// 19. README sans GPL-3.0-only -> échec
test('check-license : README sans mention GPL-3.0-only -> échec', () => {
  const r = verifyMetadata({ license: VALID_LICENSE, pkg: VALID_PKG, readme: '# pas de licence', lock: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('README')));
});

// 20. package-lock incohérent -> échec
test('check-license : package-lock incohérent -> échec', () => {
  const lock = { name: 'autre-chose', version: '9.9.9', packages: { '': { name: 'autre', version: '0.0.1', license: 'MIT' } } };
  const r = verifyMetadata({ license: VALID_LICENSE, pkg: VALID_PKG, readme: VALID_README, lock });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('package-lock')));
});

// 21. LICENSE absente -> échec
test('check-license : LICENSE absente -> échec', () => {
  const r = verifyMetadata({ license: null, pkg: VALID_PKG, readme: VALID_README, lock: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('LICENSE absent')));
});

// 22. constantes exportées stables
test('check-license : constantes stables', () => {
  assert.deepEqual(LICENSE_MARKERS, ['GNU GENERAL PUBLIC LICENSE', 'Version 3, 29 June 2007', 'END OF TERMS AND CONDITIONS']);
  assert.equal(REQUIRED.license, 'GPL-3.0-only');
  assert.equal(REQUIRED.name, 'collab-hub-web-monitor');
  assert.equal(REQUIRED.version, '1.0.1');
});

// ============================================================
// Lot 4B — moteur audio local (src/audio/*)
// ============================================================
import { buildAudioConstraints, captureAudio } from '../src/audio/audioCapture.js';
import { computeMeterLevel, createAudioMeter } from '../src/audio/audioMeter.js';
import { createAudioGraph, clampGain } from '../src/audio/audioGraph.js';
import {
  isVirtualDevice, normalizeDevice, listAudioInputDevices,
  findPreferredAudioDevice, requestAudioPermission,
} from '../src/audio/audioDevices.js';
import { normalizeCaptureError, isPermissionError } from '../src/audio/audioErrors.js';
import { createAudioEngine } from '../src/audio/audioEngine.js';
import { ERROR_CODES } from '../src/audio/constants.js';

// --- Fakes moteur audio (pas de navigateur, pas de device réel) ---
function makeFakeTrack({ label = 'fake', settings = {} } = {}) {
  const listeners = {};
  return {
    kind: 'audio',
    label,
    readyState: 'live',
    _stopped: false,
    getSettings() { return { ...settings, label }; },
    addEventListener(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); },
    removeEventListener() {},
    stop() { this._stopped = true; this.readyState = 'ended'; },
    _emit(ev) { (listeners[ev] || []).forEach((cb) => cb()); },
  };
}
function makeFakeStream(tracks) {
  return {
    _tracks: tracks,
    getTracks() { return tracks; },
    getAudioTracks() { return tracks; },
  };
}
function makeFakeMediaDevices(opts = {}) {
  const {
    audioInputs = [{ deviceId: 'default', label: 'Default - Built-in Microphone', kind: 'audioinput', groupId: 'g0' }],
    deny = false,
    overconstrainFirst = false,
    throwOnChannelCount = false,
    trackLabel,
  } = opts;
  const handlers = [];
  const md = {
    _calls: [],
    _handlers: handlers,
    _lastStream: null,
    audioInputs,
    addEventListener(ev, cb) { handlers.push({ ev, cb }); },
    removeEventListener(ev, cb) {
      const i = handlers.findIndex((h) => h.ev === ev && h.cb === cb);
      if (i >= 0) handlers.splice(i, 1);
    },
    _emit(ev) { handlers.filter((h) => h.ev === ev).forEach((h) => h.cb()); },
    async enumerateDevices() { return audioInputs.slice(); },
    async getUserMedia(constraints) {
      md._calls.push(constraints);
      if (deny) { const e = new Error('Permission denied'); e.name = 'NotAllowedError'; throw e; }
      if (overconstrainFirst && md._calls.length === 1) {
        const e = new Error('Overconstrained'); e.name = 'OverconstrainedError'; throw e;
      }
      if (throwOnChannelCount && constraints.audio && constraints.audio.channelCount) {
        const e = new Error('Overconstrained'); e.name = 'OverconstrainedError'; throw e;
      }
      const t = makeFakeTrack({ label: trackLabel || (audioInputs[0] && audioInputs[0].label) || 'fake' });
      const s = makeFakeStream([t]);
      md._lastStream = s;
      return s;
    },
  };
  return md;
}
function makeFakeAnalyser(fill = null) {
  const base = new Uint8Array(1024); base.fill(128);
  return {
    fftSize: 1024,
    getByteTimeDomainData(arr) {
      if (fill) { for (let i = 0; i < arr.length; i++) arr[i] = fill[i % fill.length]; }
      else { for (let i = 0; i < arr.length; i++) arr[i] = base[i]; }
    },
  };
}
function makeNode() {
  const conns = [];
  return { _conns: conns, connect(t) { conns.push(t); }, disconnect() { conns.length = 0; } };
}
class FakeAudioContext {
  constructor() { this._closed = false; this._resumeCalls = 0; this.destination = makeNode(); }
  createMediaStreamSource() { return makeNode(); }
  createGain() { const n = makeNode(); n.gain = { value: 1 }; return n; }
  createAnalyser() { return makeFakeAnalyser(); }
  createMediaStreamDestination() { const n = makeNode(); n.stream = makeFakeStream([makeFakeTrack({ label: 'out' })]); return n; }
  async resume() { this._resumeCalls++; }
  close() { this._closed = true; }
}

// 1. permission accordée
test('audio : permission accordée -> permission_granted + devices', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await eng.requestPermission();
  assert.equal(eng.getState(), 'permission_granted');
  assert.ok(eng.getSnapshot().devices.length > 0);
  eng.destroy();
});

// 2. permission refusée
test('audio : permission refusée -> erreur permission_denied', async () => {
  const md = makeFakeMediaDevices({ deny: true });
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await assert.rejects(() => eng.requestPermission(), (e) => e.code === ERROR_CODES.PERMISSION_DENIED);
  assert.equal(eng.getState(), 'error');
  assert.equal(eng.getSnapshot().error.code, ERROR_CODES.PERMISSION_DENIED);
  eng.destroy();
});

// 3. piste de permission arrêtée
test('audio : la piste jetable de permission est stoppée', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await eng.requestPermission();
  const track = md._lastStream.getTracks()[0];
  assert.equal(track._stopped, true);
  eng.destroy();
});

// 4. enumeration uniquement audioinput
test('audio : listAudioInputDevices ne garde que audioinput', async () => {
  const md = makeFakeMediaDevices({
    audioInputs: [
      { deviceId: 'a', label: 'In', kind: 'audioinput', groupId: 'g1' },
      { deviceId: 'v', label: 'Cam', kind: 'videoinput', groupId: 'g2' },
      { deviceId: 'o', label: 'Out', kind: 'audiooutput', groupId: 'g3' },
    ],
  });
  const list = await listAudioInputDevices(md);
  assert.equal(list.length, 1);
  assert.equal(list[0].deviceId, 'a');
});

// 5. préférence BlackHole
test('audio : findPreferredAudioDevice privilégie BlackHole', () => {
  const devs = [
    { deviceId: 'd1', label: 'Default - Built-in', isDefault: true, isVirtual: false },
    { deviceId: 'bh', label: 'BlackHole 2ch', isDefault: false, isVirtual: true },
  ];
  const pref = findPreferredAudioDevice(devs, null);
  assert.equal(pref.deviceId, 'bh');
});

// 6. préférence deviceId existant
test('audio : findPreferredAudioDevice respecte le deviceId précédent', () => {
  const devs = [
    { deviceId: 'bh', label: 'BlackHole 2ch', isDefault: false, isVirtual: true },
    { deviceId: 'd1', label: 'Default', isDefault: true, isVirtual: false },
  ];
  const pref = findPreferredAudioDevice(devs, 'd1');
  assert.equal(pref.deviceId, 'd1');
});

// 7. fallback périphérique par défaut
test('audio : findPreferredAudioDevice retombe sur le défaut sans virtuel', () => {
  const devs = [
    { deviceId: 'x', label: 'Mic', isDefault: false, isVirtual: false },
    { deviceId: 'd1', label: 'Default', isDefault: true, isVirtual: false },
  ];
  const pref = findPreferredAudioDevice(devs, null);
  assert.equal(pref.deviceId, 'd1');
});

// 8. contraintes désactivant les traitements voix
test('audio : buildAudioConstraints désactive EC/NS/AGC + channelCount idéal 2', () => {
  const c = buildAudioConstraints('dev1');
  assert.equal(c.audio.echoCancellation, false);
  assert.equal(c.audio.noiseSuppression, false);
  assert.equal(c.audio.autoGainControl, false);
  assert.deepEqual(c.audio.deviceId, { exact: 'dev1' });
  assert.deepEqual(c.audio.channelCount, { ideal: 2 });
  assert.equal(c.video, false);
});

// 9. fallback sans channelCount
test('audio : captureAudio retire channelCount au 2e tentative (Overconstrained)', async () => {
  const md = makeFakeMediaDevices({ overconstrainFirst: true });
  await captureAudio(md, 'dev1');
  assert.ok(md._calls[0].audio.channelCount !== undefined);
  assert.equal(md._calls[1].audio.channelCount, undefined);
});

// 10. erreur PermissionDenied non masquée (pas de fallback)
test('audio : captureAudio ne tente pas de fallback sur PermissionDenied', async () => {
  const md = makeFakeMediaDevices({ deny: true });
  await assert.rejects(() => captureAudio(md, 'dev1'), (e) => e.code === ERROR_CODES.PERMISSION_DENIED);
  assert.equal(md._calls.length, 1);
});

// 11. capture démarre
test('audio : startCapture -> état capturing', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await eng.startCapture();
  assert.equal(eng.getState(), 'capturing');
  eng.destroy();
});

// 12. settings exposés
test('audio : snapshot expose les settings réels après capture', async () => {
  const md = makeFakeMediaDevices({ trackLabel: 'BlackHole 2ch' });
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await eng.startCapture();
  assert.equal(eng.getSnapshot().settings.label, 'BlackHole 2ch');
  eng.destroy();
});

// 13. double start ne crée pas deux captures
test('audio : double startCapture ne crée pas un second stream', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await eng.startCapture();
  await eng.startCapture();
  assert.equal(md._calls.length, 1);
  eng.destroy();
});

// 14. stop arrête toutes les pistes
test('audio : stopCapture arrête les pistes', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await eng.startCapture();
  const track = md._lastStream.getTracks()[0];
  await eng.stopCapture();
  assert.equal(track._stopped, true);
  eng.destroy();
});

// 15. stop ferme AudioContext
test('audio : stopCapture ferme l AudioContext', async () => {
  const md = makeFakeMediaDevices();
  const ctxRef = [];
  class Ctx extends FakeAudioContext { constructor() { super(); ctxRef.push(this); } }
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: Ctx });
  await eng.startCapture();
  await eng.stopCapture();
  assert.equal(ctxRef[0]._closed, true);
  eng.destroy();
});

// 16. stop idempotent
test('audio : stopCapture est idempotent', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await eng.startCapture();
  await eng.stopCapture();
  await eng.stopCapture();
  assert.equal(eng.getState(), 'stopped');
  eng.destroy();
});

// 17. gain borné à 0
test('audio : setMasterGain borne à 0', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  assert.equal(eng.setMasterGain(-1), 0);
  assert.equal(eng.getSnapshot().gain, 0);
  eng.destroy();
});

// 18. gain borné à 1
test('audio : setMasterGain borne à 1', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  assert.equal(eng.setMasterGain(2), 1);
  assert.equal(eng.getSnapshot().gain, 1);
  eng.destroy();
});

// 19. outputStream exposé
test('audio : getOutputStream exposé après capture', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await eng.startCapture();
  assert.ok(eng.getOutputStream(), 'outputStream doit être non null');
  assert.equal(eng.getSnapshot().hasOutputStream, true);
  eng.destroy();
});

// 20. pas de monitoring vers context.destination
test('audio : le graphe ne connecte rien à context.destination', () => {
  const stream = makeFakeStream([makeFakeTrack()]);
  const graph = createAudioGraph({ stream, AudioContextClass: FakeAudioContext });
  const dest = graph.context.destination;
  const connectedToDest = [graph.sourceNode, graph.gainNode, graph.analyserNode, graph.destinationNode]
    .some((n) => n && Array.isArray(n._conns) && n._conns.includes(dest));
  assert.equal(connectedToDest, false);
  graph.close();
});

// 21. calcul RMS
test('audio : computeMeterLevel calcule le RMS', () => {
  const buf = new Uint8Array([255, 1, 255, 1]);
  const lvl = computeMeterLevel(buf);
  assert.ok(lvl.rms > 0.98 && lvl.rms <= 1);
});

// 22. calcul peak
test('audio : computeMeterLevel calcule le peak', () => {
  const buf = new Uint8Array([200, 128, 128]);
  const lvl = computeMeterLevel(buf);
  assert.ok(Math.abs(lvl.peak - (200 - 128) / 128) < 1e-6);
});

// 23. calcul dBFS
test('audio : computeMeterLevel calcule le dBFS', () => {
  const buf = new Uint8Array([255, 1]);
  const lvl = computeMeterLevel(buf);
  assert.ok(lvl.db > -1 && lvl.db <= 0);
});

// 24. détection clipping
test('audio : computeMeterLevel détecte le clipping (peak > 0.99)', () => {
  const buf = new Uint8Array([255, 1]);
  assert.equal(computeMeterLevel(buf).clipping, true);
});

// 25. silence correctement représenté
test('audio : silence -> rms 0, peak 0, db -Infinity, pas de clipping', () => {
  const buf = new Uint8Array(8).fill(128);
  const lvl = computeMeterLevel(buf);
  assert.equal(lvl.rms, 0);
  assert.equal(lvl.peak, 0);
  assert.equal(lvl.db, -Infinity);
  assert.equal(lvl.clipping, false);
});

// 26. track ended déclenche l'état erreur
test('audio : fin de piste inattendue -> état error track_ended', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await eng.startCapture();
  const track = md._lastStream.getTracks()[0];
  track._emit('ended');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(eng.getState(), 'error');
  assert.equal(eng.getSnapshot().error.code, ERROR_CODES.TRACK_ENDED);
  eng.destroy();
});

// 27. devicechange rafraîchit les devices
test('audio : devicechange rafraîchit la liste des devices', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await eng.requestPermission();
  const before = eng.getSnapshot().devices.length;
  md.audioInputs.push({ deviceId: 'new', label: 'New Device', kind: 'audioinput', groupId: 'g9' });
  md._emit('devicechange');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(eng.getSnapshot().devices.length, before + 1);
  eng.destroy();
});

// 28. listener devicechange non dupliqué
test('audio : un seul listener devicechange, retiré au destroy', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  assert.equal(md._handlers.length, 1);
  await eng.destroy();
  assert.equal(md._handlers.length, 0);
});

// 29. destroy libère tout
test('audio : destroy libère capture, graphe, listeners, devicechange', async () => {
  const md = makeFakeMediaDevices();
  const ctxRef = [];
  class Ctx extends FakeAudioContext { constructor() { super(); ctxRef.push(this); } }
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: Ctx });
  await eng.startCapture();
  const track = md._lastStream.getTracks()[0];
  let notified = 0;
  eng.subscribe(() => notified++);
  await eng.destroy();
  assert.equal(track._stopped, true);
  assert.equal(ctxRef[0]._closed, true);
  assert.equal(md._handlers.length, 0);
  assert.equal(eng.getState(), 'stopped');
});

// 30. getSnapshot ne divulgue aucun objet sensible ou interne inutile
test('audio : getSnapshot ne expose ni stream/track/graphe ni objet interne', async () => {
  const md = makeFakeMediaDevices();
  const eng = createAudioEngine({ mediaDevices: md, AudioContextClass: FakeAudioContext });
  await eng.startCapture();
  const snap = eng.getSnapshot();
  const keys = Object.keys(snap).sort();
  assert.deepEqual(keys, [
    'devices', 'error', 'gain', 'hasOutputStream', 'hasSourceStream',
    'meter', 'selectedDeviceId', 'selectedDeviceLabel', 'settings', 'state', 'updatedAt',
  ]);
  assert.equal(snap.stream, undefined);
  assert.equal(snap.track, undefined);
  assert.equal(snap.graph, undefined);
  assert.ok(snap.meter && typeof snap.meter === 'object');
  assert.deepEqual(Object.keys(snap.meter).sort(), ['clipping', 'db', 'peak', 'rms']);
  assert.ok(Array.isArray(snap.devices));
  assert.equal(typeof snap.devices[0], 'object');
  eng.destroy();
});

// ============================================================
// Lot 4C — endpoint token LiveKit + tokenClient + publisher
// ============================================================
import handler, {
  grantsFor, generateIdentity, validateConfig, safeEqualPassword,
  ROOM_NAME, TTL_SECONDS,
} from '../api/livekit/token.js';
import { requestLiveKitToken, TOKEN_ERRORS } from '../src/livekit/tokenClient.js';
import { createLiveKitPublisher, PUBLISHER_ERRORS } from '../src/audio/livekitPublisher.js';

const FAKE_ENV = {
  LIVEKIT_URL: 'wss://test.livekit.cloud',
  LIVEKIT_API_KEY: 'testkey',
  LIVEKIT_API_SECRET: 'testsecret',
  PERFORMER_PASSWORD: 'test-password-long',
};

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(s) { this.statusCode = s; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    json(o) { this.body = o; return this; },
    end(s) { this.body = s ? JSON.parse(s) : null; return this; },
  };
}
function fakeReq({ method = 'POST', body, headers = {} } = {}) {
  return { method, body, headers };
}
function decodeJwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}
async function callEndpoint({ method = 'POST', body, env = FAKE_ENV } = {}) {
  const req = fakeReq({ method, body });
  const res = fakeRes();
  await handler(req, res, env);
  return res;
}

// --- Endpoint (20) ---

// 1. GET -> 405 + Allow: POST
test('livekit/token : GET -> 405 + Allow POST', async () => {
  const res = await callEndpoint({ method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
});

// 2. POST body invalide -> 400
test('livekit/token : body non JSON -> 400', async () => {
  const res = await callEndpoint({ body: 'not-json{' });
  assert.equal(res.statusCode, 400);
});

// 3. rôle inconnu -> 400
test('livekit/token : rôle inconnu -> 400', async () => {
  const res = await callEndpoint({ body: { role: 'admin' } });
  assert.equal(res.statusCode, 400);
});

// 4. performer sans mot de passe -> 401
test('livekit/token : performer sans mot de passe -> 401', async () => {
  const res = await callEndpoint({ body: { role: 'performer' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

// 5. performer mot de passe incorrect -> 401
test('livekit/token : performer mauvais mot de passe -> 401', async () => {
  const res = await callEndpoint({ body: { role: 'performer', password: 'wrong' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

// 6. performer correct -> token
test('livekit/token : performer correct -> 200 + token', async () => {
  const res = await callEndpoint({ body: { role: 'performer', password: FAKE_ENV.PERFORMER_PASSWORD } });
  assert.equal(res.statusCode, 200);
  assert.ok(typeof res.body.token === 'string' && res.body.token.length > 0);
});

// 7. listener -> token
test('livekit/token : listener -> 200 + token', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.statusCode, 200);
  assert.ok(typeof res.body.token === 'string' && res.body.token.length > 0);
});

// 8. room forcée à main
test('livekit/token : room forcée à main', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.body.room, 'main');
  assert.equal(decodeJwtPayload(res.body.token).video.room, 'main');
});

// 9. identity générée serveur (le client n en fournit pas)
test('livekit/token : identity générée côté serveur', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.ok(typeof res.body.identity === 'string' && res.body.identity.length > 5);
  assert.equal(decodeJwtPayload(res.body.token).sub, res.body.identity);
});

// 10. identity performer préfixée
test('livekit/token : identity performer préfixée', async () => {
  const res = await callEndpoint({ body: { role: 'performer', password: FAKE_ENV.PERFORMER_PASSWORD } });
  assert.ok(res.body.identity.startsWith('performer-'));
});

// 11. identity listener préfixée
test('livekit/token : identity listener préfixée', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.ok(res.body.identity.startsWith('listener-'));
});

// 12. grants performer corrects
test('livekit/token : grants performer (canPublish true, canSubscribe false, canPublishData false)', async () => {
  const res = await callEndpoint({ body: { role: 'performer', password: FAKE_ENV.PERFORMER_PASSWORD } });
  const v = decodeJwtPayload(res.body.token).video;
  assert.equal(v.roomJoin, true);
  assert.equal(v.canPublish, true);
  assert.equal(v.canSubscribe, false);
  assert.equal(v.canPublishData, false);
});

// 13. grants listener corrects
test('livekit/token : grants listener (canPublish false, canSubscribe true)', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  const v = decodeJwtPayload(res.body.token).video;
  assert.equal(v.canPublish, false);
  assert.equal(v.canSubscribe, true);
  assert.equal(v.canPublishData, false);
});

// 14. TTL explicite 2h
test('livekit/token : TTL explicite 7200s', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.body.expiresIn, 7200);
  const p = decodeJwtPayload(res.body.token);
  assert.equal(p.exp - p.nbf, 7200);
});

// 15. config absente -> 503
test('livekit/token : config absente -> 503', async () => {
  const res = await callEndpoint({ body: { role: 'listener' }, env: {} });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'livekit_unavailable');
});

// 16. URL absente -> 503
test('livekit/token : URL absente -> 503', async () => {
  const res = await callEndpoint({ body: { role: 'listener' }, env: { ...FAKE_ENV, LIVEKIT_URL: '' } });
  assert.equal(res.statusCode, 503);
});

// 17. secret absent -> 503
test('livekit/token : API secret absent -> 503', async () => {
  const res = await callEndpoint({ body: { role: 'listener' }, env: { ...FAKE_ENV, LIVEKIT_API_SECRET: '' } });
  assert.equal(res.statusCode, 503);
});

// 18. aucune API key dans la réponse
test('livekit/token : réponse sans champ API key', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.body.apiKey, undefined);
  assert.equal(res.body.api_key, undefined);
  assert.equal(res.body.LIVEKIT_API_KEY, undefined);
});

// 19. aucun secret dans la réponse
test('livekit/token : réponse sans champ API secret', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.body.apiSecret, undefined);
  assert.equal(res.body.LIVEKIT_API_SECRET, undefined);
});

// 20. Cache-Control no-store
test('livekit/token : header Cache-Control no-store', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

// --- tokenClient (12) ---

function fakeFetch({ status = 200, body = {}, ok, throwErr = null } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    if (throwErr) throw throwErr;
    return { status, ok: ok !== undefined ? ok : (status >= 200 && status < 300), json: async () => body };
  };
  fn._calls = calls;
  return fn;
}
const GOOD_BODY = { token: 'jwt-abc', url: 'wss://test.livekit.cloud', room: 'main', identity: 'performer-1', role: 'performer', expiresIn: 7200 };

// 1. succès performer
test('tokenClient : succès performer', async () => {
  const f = fakeFetch({ body: GOOD_BODY });
  const r = await requestLiveKitToken({ role: 'performer', password: 'pw', fetchImpl: f });
  assert.equal(r.token, 'jwt-abc');
  assert.equal(r.identity, 'performer-1');
  assert.equal(f._calls[0].opts.method, 'POST');
});

// 2. succès listener
test('tokenClient : succès listener (pas de password envoyé)', async () => {
  const f = fakeFetch({ body: { ...GOOD_BODY, role: 'listener', identity: 'listener-1' } });
  const r = await requestLiveKitToken({ role: 'listener', fetchImpl: f });
  assert.equal(r.role, 'listener');
  const sent = JSON.parse(f._calls[0].opts.body);
  assert.equal(sent.password, undefined);
});

// 3. 401 -> token_unauthorized
test('tokenClient : 401 -> token_unauthorized', async () => {
  const f = fakeFetch({ status: 401, body: { error: 'unauthorized' } });
  await assert.rejects(() => requestLiveKitToken({ role: 'performer', password: 'pw', fetchImpl: f }), (e) => e.code === TOKEN_ERRORS.unauthorized);
});

// 4. 503 -> token_unavailable
test('tokenClient : 503 -> token_unavailable', async () => {
  const f = fakeFetch({ status: 503, body: { error: 'livekit_unavailable' } });
  await assert.rejects(() => requestLiveKitToken({ role: 'listener', fetchImpl: f }), (e) => e.code === TOKEN_ERRORS.unavailable);
});

// 5. réponse JSON invalide
test('tokenClient : JSON invalide -> token_invalid_response', async () => {
  const f = async () => ({ status: 200, ok: true, json: async () => { throw new Error('bad'); } });
  await assert.rejects(() => requestLiveKitToken({ role: 'listener', fetchImpl: f }), (e) => e.code === TOKEN_ERRORS.invalid_response);
});

// 6. token absent
test('tokenClient : token absent -> token_invalid_response', async () => {
  const f = fakeFetch({ body: { url: 'wss://x', room: 'main', identity: 'l-1', role: 'listener' } });
  await assert.rejects(() => requestLiveKitToken({ role: 'listener', fetchImpl: f }), (e) => e.code === TOKEN_ERRORS.invalid_response);
});

// 7. URL invalide (absente)
test('tokenClient : URL absente -> token_invalid_response', async () => {
  const f = fakeFetch({ body: { token: 't', room: 'main', identity: 'l-1', role: 'listener' } });
  await assert.rejects(() => requestLiveKitToken({ role: 'listener', fetchImpl: f }), (e) => e.code === TOKEN_ERRORS.invalid_response);
});

// 8. timeout
test('tokenClient : timeout -> token_timeout', async () => {
  const f = (url, opts) => new Promise((_, reject) => {
    if (opts && opts.signal) opts.signal.addEventListener('abort', () => { const e = new Error('ab'); e.name = 'AbortError'; reject(e); });
  });
  await assert.rejects(
    () => requestLiveKitToken({ role: 'listener', fetchImpl: f, timeoutMs: 30 }),
    (e) => e.code === TOKEN_ERRORS.timeout,
  );
});

// 9. erreur réseau
test('tokenClient : erreur réseau -> token_network_error', async () => {
  const f = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(() => requestLiveKitToken({ role: 'listener', fetchImpl: f }), (e) => e.code === TOKEN_ERRORS.network_error);
});

// 10. mot de passe non conservé (absent de la valeur renvoyée)
test('tokenClient : la valeur renvoyée ne contient pas le password', async () => {
  const f = fakeFetch({ body: GOOD_BODY });
  const r = await requestLiveKitToken({ role: 'performer', password: 'secret-pw', fetchImpl: f });
  assert.equal(r.password, undefined);
  assert.deepEqual(Object.keys(r).sort(), ['expiresIn', 'identity', 'role', 'room', 'token', 'url']);
});

// 11. aucun token loggué
test('tokenClient : le token n est pas loggué', async () => {
  const f = fakeFetch({ body: GOOD_BODY });
  const logs = [];
  const origLog = console.log; const origErr = console.error;
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  try {
    await requestLiveKitToken({ role: 'performer', password: 'pw', fetchImpl: f });
  } finally {
    console.log = origLog; console.error = origErr;
  }
  assert.ok(!logs.some((l) => l.includes('jwt-abc')), 'le token ne doit pas apparaître dans les logs');
});

// 12. role invalide rejeté avant fetch
test('tokenClient : role invalide rejeté avant fetch', async () => {
  const f = fakeFetch({ body: GOOD_BODY });
  await assert.rejects(() => requestLiveKitToken({ role: 'admin', fetchImpl: f }), (e) => e.code === TOKEN_ERRORS.failed);
  assert.equal(f._calls.length, 0);
});

// --- Publisher (22) ---

function makeFakeMediaTrack({ readyState = 'live' } = {}) {
  return { kind: 'audio', readyState, _stopped: false, stop() { this._stopped = true; this.readyState = 'ended'; }, getSettings() { return {}; } };
}
function makeFakeOutputStream(track) {
  return { getAudioTracks: () => (track ? [track] : []) };
}
function makeFakeTokenClient({ identity = 'performer-test', fail = false } = {}) {
  const calls = [];
  return {
    _calls: calls,
    async requestLiveKitToken({ role, password }) {
      calls.push({ role, password });
      if (fail) throw { code: 'token_unauthorized', message: 'no' };
      return { token: 'fake-jwt', url: 'wss://test.livekit.cloud', room: 'main', identity, role };
    },
  };
}
function makeFakeLocalAudioTrackClass() {
  return function FakeLocalAudioTrack(mediaTrack, opts) {
    return { _media: mediaTrack, _opts: opts, _stopped: false, sid: 'track-sid-1', stop() { this._stopped = true; } };
  };
}
function makeFakeRoomClass({ connectFail = false, publishFail = false } = {}) {
  class FakeRoom {
    constructor(opts) {
      this.opts = opts;
      this._connected = false;
      this._disconnected = false;
      this._listeners = {};
      this.localParticipant = {
        sid: 'part-1',
        _unpublished: [],
        _published: [],
        unpublishTrack(t, stop) { this._unpublished.push({ t, stop }); },
        async publishTrack(t, o) {
          if (publishFail) throw new Error('publish failed');
          const pub = { trackSid: 'pub-1', track: { sid: 'pub-1' } };
          this._published.push({ t, o, pub });
          return pub;
        },
      };
      FakeRoom.lastInstance = this;
    }
    on(ev, cb) { (this._listeners[ev] = this._listeners[ev] || []).push(cb); }
    off(ev) { delete this._listeners[ev]; }
    removeAllListeners() { this._listeners = {}; }
    _emit(ev, ...args) { (this._listeners[ev] || []).forEach((cb) => cb(...args)); }
    async connect() { if (connectFail) throw new Error('connect failed'); this._connected = true; }
    async disconnect() { this._disconnected = true; this._connected = false; }
  }
  FakeRoom.lastInstance = null;
  return FakeRoom;
}
function makePublisher({ tokenClient, RoomClass, track, connectFail, publishFail } = {}) {
  return createLiveKitPublisher({
    tokenClient: tokenClient || makeFakeTokenClient(),
    RoomClass: RoomClass || makeFakeRoomClass({ connectFail, publishFail }),
    LocalAudioTrackClass: makeFakeLocalAudioTrackClass(),
    now: () => 1000,
  });
}

// 1. outputStream absent
test('publisher : outputStream absent -> no_output_stream', async () => {
  const p = makePublisher();
  await assert.rejects(() => p.connect({ password: 'pw', outputStream: null }), (e) => e.code === PUBLISHER_ERRORS.no_output_stream);
  assert.equal(p.getState(), 'error');
});

// 2. aucune piste audio
test('publisher : aucune piste audio -> no_audio_track', async () => {
  const p = makePublisher();
  await assert.rejects(() => p.connect({ password: 'pw', outputStream: makeFakeOutputStream(null) }), (e) => e.code === PUBLISHER_ERRORS.no_audio_track);
});

// 3. piste ended
test('publisher : piste ended -> no_audio_track', async () => {
  const p = makePublisher();
  const track = makeFakeMediaTrack({ readyState: 'ended' });
  await assert.rejects(() => p.connect({ password: 'pw', outputStream: makeFakeOutputStream(track) }), (e) => e.code === PUBLISHER_ERRORS.no_audio_track);
});

// 4. token demandé
test('publisher : un token performer est demandé', async () => {
  const tc = makeFakeTokenClient();
  const p = makePublisher({ tokenClient: tc });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  assert.equal(tc._calls.length, 1);
  assert.equal(tc._calls[0].role, 'performer');
});

// 5. connexion Room
test('publisher : Room connectée après connect', async () => {
  const Room = makeFakeRoomClass();
  const p = makePublisher({ RoomClass: Room });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  assert.equal(Room.lastInstance._connected, true);
});

// 6. publication
test('publisher : piste publiée + trackSid', async () => {
  const Room = makeFakeRoomClass();
  const p = makePublisher({ RoomClass: Room });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  assert.equal(Room.lastInstance.localParticipant._published.length, 1);
  assert.equal(p.getSnapshot().trackSid, 'pub-1');
});

// 7. état live
test('publisher : état live après connect', async () => {
  const p = makePublisher();
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  assert.equal(p.getState(), 'live');
});

// 8. double connect bloqué
test('publisher : double connect bloqué (un seul token)', async () => {
  const tc = makeFakeTokenClient();
  const p = makePublisher({ tokenClient: tc });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  await assert.rejects(() => p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) }), (e) => e.code === PUBLISHER_ERRORS.busy);
  assert.equal(tc._calls.length, 1);
});

// 9. double publish bloqué
test('publisher : double publish bloqué', async () => {
  const p = makePublisher();
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  await assert.rejects(() => p.publish(), (e) => e.code === PUBLISHER_ERRORS.busy);
});

// 10. stop unpublish (stop=false -> préserve la piste source)
test('publisher : stop unpublish avec stop=false', async () => {
  const Room = makeFakeRoomClass();
  const p = makePublisher({ RoomClass: Room });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  await p.stop();
  assert.equal(Room.lastInstance.localParticipant._unpublished.length, 1);
  assert.equal(Room.lastInstance.localParticipant._unpublished[0].stop, false);
});

// 11. stop disconnect
test('publisher : stop disconnect la Room', async () => {
  const Room = makeFakeRoomClass();
  const p = makePublisher({ RoomClass: Room });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  await p.stop();
  assert.equal(Room.lastInstance._disconnected, true);
});

// 12. stop n arrête pas audioEngine (piste source préservée)
test('publisher : stop n arrête pas la piste source', async () => {
  const track = makeFakeMediaTrack();
  const p = makePublisher();
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(track) });
  await p.stop();
  assert.equal(track._stopped, false);
});

// 13. stop idempotent
test('publisher : stop idempotent', async () => {
  const p = makePublisher();
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  await p.stop();
  await p.stop();
  assert.equal(p.getState(), 'stopped');
});

// 14. erreur token nettoie
test('publisher : erreur token -> error, non connecté', async () => {
  const tc = makeFakeTokenClient({ fail: true });
  const p = makePublisher({ tokenClient: tc });
  await assert.rejects(() => p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) }), (e) => e.code === PUBLISHER_ERRORS.token);
  assert.equal(p.getState(), 'error');
  assert.equal(p.getSnapshot().connected, false);
  assert.equal(p.getSnapshot().identity, null);
});

// 15. erreur connect nettoie
test('publisher : erreur connect -> error + Room nettoyée', async () => {
  const Room = makeFakeRoomClass({ connectFail: true });
  const p = makePublisher({ RoomClass: Room });
  await assert.rejects(() => p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) }), (e) => e.code === PUBLISHER_ERRORS.connect);
  assert.equal(p.getState(), 'error');
  assert.equal(p.getSnapshot().connected, false);
});

// 16. erreur publish nettoie
test('publisher : erreur publish -> error + Room déconnectée', async () => {
  const Room = makeFakeRoomClass({ publishFail: true });
  const p = makePublisher({ RoomClass: Room });
  await assert.rejects(() => p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) }), (e) => e.code === PUBLISHER_ERRORS.publish);
  assert.equal(p.getState(), 'error');
  assert.equal(Room.lastInstance._disconnected, true);
});

// 17. reconnecting
test('publisher : Reconnecting -> état reconnecting + compteur', async () => {
  const Room = makeFakeRoomClass();
  const p = makePublisher({ RoomClass: Room });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  Room.lastInstance._emit('reconnecting');
  assert.equal(p.getState(), 'reconnecting');
  assert.equal(p.getSnapshot().reconnectCount, 1);
  await p.destroy();
});

// 18. reconnected -> live
test('publisher : Reconnected -> live (piste toujours publiée)', async () => {
  const Room = makeFakeRoomClass();
  const p = makePublisher({ RoomClass: Room });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  Room.lastInstance._emit('reconnecting');
  Room.lastInstance._emit('reconnected');
  assert.equal(p.getState(), 'live');
  await p.destroy();
});

// 19. disconnect involontaire -> error
test('publisher : Disconnected involontaire -> error', async () => {
  const Room = makeFakeRoomClass();
  const track = makeFakeMediaTrack();
  const p = makePublisher({ RoomClass: Room });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(track) });
  Room.lastInstance._emit('disconnected');
  assert.equal(p.getState(), 'error');
  assert.equal(p.getSnapshot().lastError.code, PUBLISHER_ERRORS.disconnected);
  assert.equal(track._stopped, false); // piste source préservée
  await p.destroy();
});

// 20. destroy retire les listeners
test('publisher : destroy retire les listeners Room', async () => {
  const Room = makeFakeRoomClass();
  const p = makePublisher({ RoomClass: Room });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  const inst = Room.lastInstance;
  await p.destroy();
  assert.equal(Object.keys(inst._listeners).length, 0);
});

// 21. snapshot sans token
test('publisher : snapshot sans token', async () => {
  const p = makePublisher();
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  assert.equal(p.getSnapshot().token, undefined);
  await p.destroy();
});

// 22. snapshot sans password
test('publisher : snapshot sans password', async () => {
  const p = makePublisher();
  await p.connect({ password: 'secret-pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  assert.equal(p.getSnapshot().password, undefined);
  await p.destroy();
});