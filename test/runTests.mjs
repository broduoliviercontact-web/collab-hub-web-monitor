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
  assert.equal(REQUIRED.version, '1.1.2');
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
import {
  createSessionValue, verifySessionValue, validateSessionConfig,
  setCookieString, clearCookieString, parseCookies, readSessionCookie,
  isSecureEnv, COOKIE_NAME, SESSION_TTL_SECONDS,
} from '../src/server/controlRoomSession.js';
import loginHandler from '../api/control-room/login.js';
import logoutHandler from '../api/control-room/logout.js';
import sessionHandler from '../api/control-room/session.js';

const FAKE_ENV = {
  LIVEKIT_URL: 'wss://test.livekit.cloud',
  LIVEKIT_API_KEY: 'testkey',
  LIVEKIT_API_SECRET: 'testsecret',
  PERFORMER_PASSWORD: 'test-password-long',
  CONTROL_ROOM_SESSION_SECRET: 'test-session-secret-long-1234567890',
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
function fakeReq({ method = 'POST', body, headers = {}, cookie = null } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  return { method, body, headers: h };
}
function decodeJwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}
// Minte un cookie de session valide pour les tests endpoint performer.
function mintSession(env = FAKE_ENV, { now = () => 1234567890000 } = {}) {
  return createSessionValue(env, { now }).value;
}
async function callEndpoint({ method = 'POST', body, env = FAKE_ENV, cookie = null, now = () => 1234567890000 } = {}) {
  const req = fakeReq({ method, body, cookie });
  const res = fakeRes();
  await handler(req, res, env, { now });
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

// 4. performer sans session -> 401 (Lot 4F.1 : auth par cookie, plus de password)
test('livekit/token : performer sans session -> 401', async () => {
  const res = await callEndpoint({ body: { role: 'performer' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

// 5. performer session invalide -> 401
test('livekit/token : performer session invalide -> 401', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=eyJbad.sigvalue` });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

// 6. performer avec session valide -> token
test('livekit/token : performer session valide -> 200 + token', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
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
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  assert.ok(res.body.identity.startsWith('performer-'));
});

// 11. identity listener préfixée
test('livekit/token : identity listener préfixée', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.ok(res.body.identity.startsWith('listener-'));
});

// 12. grants performer corrects
test('livekit/token : grants performer (canPublish true, canSubscribe false, canPublishData false)', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
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

// 1. succès performer (Lot 4F.1 : plus de password envoyé — auth via cookie)
test('tokenClient : succès performer (aucun password envoyé)', async () => {
  const f = fakeFetch({ body: GOOD_BODY });
  const r = await requestLiveKitToken({ role: 'performer', fetchImpl: f });
  assert.equal(r.token, 'jwt-abc');
  assert.equal(r.identity, 'performer-1');
  assert.equal(f._calls[0].opts.method, 'POST');
  const sent = JSON.parse(f._calls[0].opts.body);
  assert.equal(sent.role, 'performer');
  assert.equal(sent.password, undefined); // champ password ignoré côté client
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
// Lot 4D — moteur listener LiveKit + adaptateur audio + UI publique
// ============================================================
import { createLiveKitListener, LISTENER_ERRORS, DEFAULT_VOLUME, ATTENUATION_DB, ATTENUATION_GAIN, scanRemoteAudio, DEFAULT_RETRY_DELAYS } from '../src/livekit/livekitListener.js';
import { createListenerAudioElement } from '../src/listener/listenerAudioElement.js';
import {
  isLiveKitEnabled, STATUS_LABELS, buildListenerDOM,
  renderListenerState, wireListenerControls, createClickDiscriminator,
} from '../src/listener/listenerUI.js';
import { initDiagnostic } from '../src/diagnostic/diagnosticPanel.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

// --- Faux DOM riche (avec addEventListener) pour les tests UI ---
function fakeDomEl({ checked = false } = {}) {
  const handlers = {};
  return {
    textContent: '', hidden: false, checked, disabled: false,
    className: '', value: '', _attrs: {}, _parent: null,
    classList: { add(c) { this._c = c; }, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    appendChild(c) { if (c && typeof c === 'object') c._parent = this; return c; },
    append(...cs) { cs.forEach((c) => { if (c && typeof c === 'object') c._parent = this; }); },
    addEventListener(ev, cb) { (handlers[ev] = handlers[ev] || []).push(cb); },
    removeEventListener() {},
    _fire(ev, ...args) { (handlers[ev] || []).forEach((cb) => cb(...args)); },
    _handlers: handlers,
  };
}

// --- Faux document : querySelector('#id') renvoie un fakeDomEl mémorisé ---
function fakeDocument() {
  const cache = new Map();
  const created = [];
  const doc = {
    createElement(tag) {
      const e = fakeDomEl();
      e.tagName = tag.toUpperCase();
      e._tag = tag;
      created.push(e);
      return e;
    },
  };
  doc.querySelector = (sel) => {
    const id = sel.replace(/^#/, '');
    if (!cache.has(id)) cache.set(id, fakeDomEl());
    return cache.get(id);
  };
  doc._created = created;
  return doc;
}

// ================= Moteur listener (30) =================

function makeFakeRemoteTrack({ kind = 'audio', name = 'program-audio', sid = 'tr-1' } = {}) {
  return {
    kind, name, sid, source: 'microphone',
    _attached: [], _detached: [],
    attach(el) { this._attached.push(el); return el; },
    detach(el) { this._detached.push(el); return el; },
  };
}
function makeFakeAudioSink({ playMode = null } = {}) {
  const calls = { attach: [], detach: 0, play: 0, pause: 0, volume: [], muted: [] };
  let mode = playMode;
  let vol = DEFAULT_VOLUME, mut = false;
  return {
    _calls: calls,
    _vol: () => vol, _mut: () => mut,
    _setPlayMode(m) { mode = m; },
    attachTrack(t) { calls.attach.push(t); },
    detachTrack() { calls.detach++; },
    async play() {
      calls.play++;
      if (mode === 'NotAllowed') throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
      if (mode === 'other') throw new Error('play failed');
    },
    pause() { calls.pause++; },
    setVolume(v) { calls.volume.push(v); vol = v; },
    setMuted(b) { calls.muted.push(b); mut = b; },
  };
}
function makeFakeListenerRoomClass({ connectFail = false } = {}) {
  class FakeRoom {
    constructor(opts) {
      this.opts = opts; this._connected = false; this._disconnected = false;
      this._listeners = {};
      this.localParticipant = { _published: [], async publishTrack(t, o) { this._published.push({ t, o }); return { trackSid: 'no' }; } };
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

// Lot 4F.2 : faux Room simulant un performer DÉJÀ en train de publier quand un
// listener rejoint (room.remoteParticipants + trackPublications déjà peuplés).
// emitSubscribed=false : la piste est déjà là SANS TrackSubscribed (la race que
// le fix doit rattraper via attachExistingAudioTracks). emitSubscribed=true :
// un TrackSubscribed arrive en microtask APRÈS connect (isConnected déjà true)
// pour vérifier l'idempotence (pas de double attach).
function makeFakeListenerRoomWithExistingTrack({
  connectFail = false,
  emitSubscribed = false,
  trackName = 'program-audio',
  participantIdentity = 'performer-A',
  trackSid = 'tr-perf',
} = {}) {
  const track = { kind: 'audio', name: trackName, sid: trackSid, source: 'microphone' };
  class FakeRoom {
    constructor(opts) {
      this.opts = opts; this._connected = false; this._disconnected = false;
      this._listeners = {};
      const participant = {
        identity: participantIdentity,
        trackPublications: new Map([[trackSid, { kind: 'audio', name: trackName, trackSid, track }]]),
      };
      this.remoteParticipants = new Map([[participantIdentity, participant]]);
      FakeRoom.lastInstance = this;
    }
    on(ev, cb) { (this._listeners[ev] = this._listeners[ev] || []).push(cb); }
    off(ev) { delete this._listeners[ev]; }
    removeAllListeners() { this._listeners = {}; }
    _emit(ev, ...args) { (this._listeners[ev] || []).forEach((cb) => cb(...args)); }
    async connect() {
      if (connectFail) throw new Error('connect failed');
      this._connected = true;
      if (emitSubscribed) {
        const self = this;
        // microtask : l'événement arrive APRÈS connect (isConnected déjà true),
        // comme livekit-client peut le faire pour une piste déjà publiée.
        Promise.resolve().then(() => self._emit('trackSubscribed', track, { trackSid }, self.remoteParticipants.get(participantIdentity)));
      }
    }
    async disconnect() { this._disconnected = true; this._connected = false; }
  }
  FakeRoom.lastInstance = null;
  return FakeRoom;
}
function makeFakeListenerTokenClient({ identity = 'listener-test', fail = false } = {}) {
  const calls = [];
  return {
    _calls: calls,
    async requestLiveKitToken({ role, password }) {
      calls.push({ role, password });
      if (fail) throw { code: 'token_unavailable', message: 'no' };
      return { token: 'fake-jwt', url: 'wss://test.livekit.cloud', room: 'main', identity, role };
    },
  };
}
function makeListener({ tokenClient, RoomClass, audioSink, connectFail, ...rest } = {}) {
  return createLiveKitListener({
    tokenClient: tokenClient || makeFakeListenerTokenClient(),
    RoomClass: RoomClass || makeFakeListenerRoomClass({ connectFail }),
    audioSink: audioSink || makeFakeAudioSink(),
    now: () => 1000,
    ...rest,
  });
}

// 1. token listener demandé (rôle listener, pas de password)
test('listener : token listener demandé (rôle listener, sans password)', async () => {
  const tc = makeFakeListenerTokenClient();
  const l = makeListener({ tokenClient: tc });
  await l.connect();
  assert.equal(tc._calls.length, 1);
  assert.equal(tc._calls[0].role, 'listener');
  assert.equal(tc._calls[0].password, undefined);
  await l.destroy();
});

// 2. connexion Room
test('listener : Room connectée après connect', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  assert.equal(Room.lastInstance._connected, true);
  await l.destroy();
});

// 3. aucun publish appelé
test('listener : aucun publishTrack appelé', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack(), {}, { identity: 'p' });
  await flush();
  assert.equal(Room.lastInstance.localParticipant._published.length, 0);
  assert.equal(typeof l.publish, 'undefined');
  await l.destroy();
});

// 4. état connected (snapshot.connected)
test('listener : connected=true après connect', async () => {
  const l = makeListener();
  await l.connect();
  assert.equal(l.getSnapshot().connected, true);
  await l.destroy();
});

// 5. attente piste
test('listener : état waiting_for_track après connect (sans piste)', async () => {
  const l = makeListener();
  await l.connect();
  assert.equal(l.getState(), 'waiting_for_track');
  await l.destroy();
});

// 6. piste audio reçue -> playing
test('listener : piste audio reçue -> playing', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack({ sid: 'a' }), {}, { identity: 'p' });
  await flush();
  assert.equal(l.getState(), 'playing');
  assert.equal(l.getSnapshot().hasAudioTrack, true);
  await l.destroy();
});

// 7. piste vidéo ignorée
test('listener : piste vidéo ignorée', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack({ kind: 'video', sid: 'v' }), {}, { identity: 'p' });
  await flush();
  assert.equal(l.getSnapshot().hasAudioTrack, false);
  assert.equal(l.getState(), 'waiting_for_track');
  await l.destroy();
});

// 8. program-audio prioritaire
test('listener : piste program-audio prioritaire sur une autre piste', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack({ name: 'other', sid: 'a' }), {}, { identity: 'p' });
  await flush();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack({ name: 'program-audio', sid: 'b' }), {}, { identity: 'p' });
  await flush();
  assert.equal(l.getSnapshot().audioTrackSid, 'b');
  await l.destroy();
});

// 9. deuxième piste (non program) ignorée
test('listener : deuxième piste non-program ignorée', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack({ name: 'program-audio', sid: 'a' }), {}, { identity: 'p' });
  await flush();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack({ name: 'other', sid: 'b' }), {}, { identity: 'p' });
  await flush();
  assert.equal(l.getSnapshot().audioTrackSid, 'a');
  await l.destroy();
});

// 10. piste détachée à unsubscribe
test('listener : piste détachée à TrackUnsubscribed', async () => {
  const sink = makeFakeAudioSink();
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room, audioSink: sink });
  await l.connect();
  const t = makeFakeRemoteTrack({ sid: 'a' });
  Room.lastInstance._emit('trackSubscribed', t, {}, { identity: 'p' });
  await flush();
  Room.lastInstance._emit('trackUnsubscribed', t);
  await flush();
  assert.equal(l.getSnapshot().hasAudioTrack, false);
  assert.ok(sink._calls.detach >= 1);
  assert.equal(l.getState(), 'waiting_for_track');
  await l.destroy();
});

// 11. participant performer identifié
test('listener : performer identity identifié', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack(), {}, { identity: 'performer-x' });
  await flush();
  assert.equal(l.getSnapshot().performerIdentity, 'performer-x');
  await l.destroy();
});

// 12. autoplay bloqué -> waiting_for_user + autoplayBlocked
test('listener : autoplay bloqué -> waiting_for_user', async () => {
  const sink = makeFakeAudioSink({ playMode: 'NotAllowed' });
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room, audioSink: sink });
  await l.connect();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack(), {}, { identity: 'p' });
  await flush();
  assert.equal(l.getState(), 'waiting_for_user');
  assert.equal(l.getSnapshot().autoplayBlocked, true);
  await l.destroy();
});

// 13. waiting_for_user
test('listener : état waiting_for_user confirmé', async () => {
  const sink = makeFakeAudioSink({ playMode: 'NotAllowed' });
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room, audioSink: sink });
  await l.connect();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack(), {}, { identity: 'p' });
  await flush();
  assert.equal(l.getState(), 'waiting_for_user');
  await l.destroy();
});

// 14. startAudio succès
test('listener : startAudio succès -> playing', async () => {
  const sink = makeFakeAudioSink({ playMode: 'NotAllowed' });
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room, audioSink: sink });
  await l.connect();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack(), {}, { identity: 'p' });
  await flush();
  sink._setPlayMode(null); // l'utilisateur débloque -> play réussit
  await l.startAudio();
  assert.equal(l.getState(), 'playing');
  assert.equal(l.getSnapshot().autoplayBlocked, false);
  await l.destroy();
});

// 15. état playing
test('listener : état playing', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack(), {}, { identity: 'p' });
  await flush();
  assert.equal(l.getState(), 'playing');
  assert.ok(l.getSnapshot().playingSince != null);
  await l.destroy();
});

// 16. volume borné à 0
test('listener : volume borné à 0', () => {
  const l = makeListener();
  assert.equal(l.setVolume(-1), 0);
  assert.equal(l.getSnapshot().volume, 0);
});

// 17. volume borné à 1
test('listener : volume borné à 1', () => {
  const l = makeListener();
  assert.equal(l.setVolume(2), 1);
  assert.equal(l.getSnapshot().volume, 1);
});

// 18. mute
test('listener : mute', () => {
  const sink = makeFakeAudioSink();
  const l = makeListener({ audioSink: sink });
  l.setMuted(true);
  assert.equal(l.getSnapshot().muted, true);
  assert.equal(sink._calls.muted[sink._calls.muted.length - 1], true);
});

// 19. unmute
test('listener : unmute', () => {
  const sink = makeFakeAudioSink();
  const l = makeListener({ audioSink: sink });
  l.setMuted(true);
  l.setMuted(false);
  assert.equal(l.getSnapshot().muted, false);
});

// 20. reconnecting
test('listener : Reconnecting -> reconnecting + compteur', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  Room.lastInstance._emit('reconnecting');
  assert.equal(l.getState(), 'reconnecting');
  assert.equal(l.getSnapshot().reconnectCount, 1);
  await l.destroy();
});

// 21. reconnected -> playing (piste toujours active)
test('listener : Reconnected -> playing', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack(), {}, { identity: 'p' });
  await flush();
  Room.lastInstance._emit('reconnecting');
  Room.lastInstance._emit('reconnected');
  assert.equal(l.getState(), 'playing');
  await l.destroy();
});

// 22. disconnect involontaire -> error
test('listener : Disconnected involontaire -> error', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  Room.lastInstance._emit('disconnected');
  assert.equal(l.getState(), 'error');
  assert.equal(l.getSnapshot().lastError.code, LISTENER_ERRORS.disconnected);
  await l.destroy();
});

// 23. disconnect volontaire -> stopped
test('listener : stop volontaire -> stopped + Room déconnectée', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  const inst = Room.lastInstance;
  await l.stop();
  assert.equal(l.getState(), 'stopped');
  assert.equal(inst._disconnected, true);
});

// 24. destroy idempotent
test('listener : destroy idempotent', async () => {
  const l = makeListener();
  await l.connect();
  await l.destroy();
  await l.destroy();
  assert.equal(l.getState(), 'stopped');
});

// 25. snapshot sans token
test('listener : snapshot sans token', async () => {
  const l = makeListener();
  await l.connect();
  assert.equal(l.getSnapshot().token, undefined);
  await l.destroy();
});

// 26. snapshot sans objet Room
test('listener : snapshot sans objet Room', async () => {
  const l = makeListener();
  await l.connect();
  const s = l.getSnapshot();
  assert.equal(s.room, undefined);
  assert.equal(s.Room, undefined);
  await l.destroy();
});

// 27. performer absent non erreur
test('listener : performer absent -> attente, pas d erreur', async () => {
  const l = makeListener();
  await l.connect();
  assert.equal(l.getState(), 'waiting_for_track');
  assert.equal(l.getSnapshot().lastError, null);
  assert.equal(l.getSnapshot().hasAudioTrack, false);
  await l.destroy();
});

// 28. piste arrivée après connexion
test('listener : piste arrivée après connexion', async () => {
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room });
  await l.connect();
  assert.equal(l.getSnapshot().hasAudioTrack, false);
  Room.lastInstance._emit('trackSubscribed', makeFakeRemoteTrack({ sid: 'late' }), {}, { identity: 'p' });
  await flush();
  assert.equal(l.getSnapshot().hasAudioTrack, true);
  assert.equal(l.getSnapshot().audioTrackSid, 'late');
  await l.destroy();
});

// 29. retry après erreur
test('listener : retry après erreur -> reconnecte', async () => {
  const tc = makeFakeListenerTokenClient();
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ tokenClient: tc, RoomClass: Room });
  await l.connect();
  Room.lastInstance._emit('disconnected');
  assert.equal(l.getState(), 'error');
  await l.connect();
  assert.equal(l.getState(), 'waiting_for_track');
  assert.equal(tc._calls.length, 2); // 2 tokens demandés (retry)
  await l.destroy();
});

// 30. aucun getUserMedia appelé (aucune capture micro côté listener)
test('listener : aucun getUserMedia / capture micro', async () => {
  const sink = makeFakeAudioSink();
  const Room = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass: Room, audioSink: sink });
  await l.connect();
  assert.equal(sink._calls.attach.length, 0); // aucune piste attachée sans TrackSubscribed
  assert.equal(typeof l.getUserMedia, 'undefined');
  await l.destroy();
});

// ================= Adaptateur audio element (12) =================

function fakeAudioEl({ playImpl = async () => {} } = {}) {
  const el = {
    tagName: 'AUDIO', _volume: 1, _muted: false, _srcObject: null,
    _paused: true, _removed: false, _playImpl: playImpl,
    parentNode: null,
    get volume() { return this._volume; }, set volume(v) { this._volume = v; },
    get muted() { return this._muted; }, set muted(v) { this._muted = v; },
    get srcObject() { return this._srcObject; }, set srcObject(v) { this._srcObject = v; },
    async play() { await this._playImpl(); this._paused = false; },
    pause() { this._paused = true; },
  };
  el.parentNode = { removeChild(x) { x._removed = true; } };
  return el;
}

// 1. création audio element
test('listenerAudioElement : crée un élément audio', () => {
  const created = [];
  const doc = { createElement(t) { const e = fakeAudioEl(); created.push(e); return e; } };
  const a = createListenerAudioElement({ documentRef: doc });
  assert.equal(a.getSnapshot().hasElement, true);
  assert.equal(a.getSnapshot().ownsElement, true);
  assert.equal(created.length, 1);
});

// 2. autoplay contrôlé (pas de play à la construction)
test('listenerAudioElement : pas de play() à la construction', () => {
  let played = 0;
  const doc = { createElement: () => fakeAudioEl({ playImpl: async () => { played++; } }) };
  const a = createListenerAudioElement({ documentRef: doc });
  assert.equal(played, 0);
  assert.equal(a.getSnapshot().playing, false);
});

// 3. attachTrack
test('listenerAudioElement : attachTrack attache la piste', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  const t = makeFakeRemoteTrack();
  a.attachTrack(t);
  assert.equal(t._attached.length, 1);
  assert.equal(a.getSnapshot().attached, true);
});

// 4. detachTrack
test('listenerAudioElement : detachTrack détache + vide srcObject', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  const t = makeFakeRemoteTrack();
  a.attachTrack(t);
  a.detachTrack();
  assert.equal(t._detached.length, 1);
  assert.equal(el.srcObject, null);
  assert.equal(a.getSnapshot().attached, false);
});

// 5. play succès
test('listenerAudioElement : play succès -> playing', async () => {
  const el = fakeAudioEl({ playImpl: async () => {} });
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  await a.play();
  assert.equal(a.getSnapshot().playing, true);
});

// 6. play NotAllowedError propagé
test('listenerAudioElement : play NotAllowedError propagé', async () => {
  const el = fakeAudioEl({ playImpl: async () => { throw Object.assign(new Error('b'), { name: 'NotAllowedError' }); } });
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  await assert.rejects(() => a.play(), (e) => e.name === 'NotAllowedError');
});

// 7. volume
test('listenerAudioElement : setVolume', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  a.setVolume(0.3);
  assert.equal(el.volume, 0.3);
});

// 8. mute
test('listenerAudioElement : setMuted', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  a.setMuted(true);
  assert.equal(el.muted, true);
});

// 9. pause
test('listenerAudioElement : pause', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  a.pause();
  assert.equal(el._paused, true);
  assert.equal(a.getSnapshot().playing, false);
});

// 10. destroy (pause + detach)
test('listenerAudioElement : destroy pause + détache', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  const t = makeFakeRemoteTrack();
  a.attachTrack(t);
  a.destroy();
  assert.equal(t._detached.length, 1);
  assert.equal(a.getSnapshot().attached, false);
});

// 11. retrait si propriétaire (élément créé)
test('listenerAudioElement : retire l élément créé du DOM', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el } });
  a.destroy();
  assert.equal(el._removed, true);
});

// 12. conservation si élément fourni (ne retire pas)
test('listenerAudioElement : conserve l élément fourni (pas de retrait)', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => fakeAudioEl() }, audioElement: el });
  assert.equal(a.getSnapshot().ownsElement, false);
  a.destroy();
  assert.equal(el._removed, false);
});

// ================= UI publique (11) =================

// 1. section masquée si VITE_LIVEKIT_ENABLED=false
test('listenerUI : isLiveKitEnabled("false") -> false', () => {
  assert.equal(isLiveKitEnabled('false'), false);
});

// 2. absent / vide -> false (aucun import LiveKit)
test('listenerUI : isLiveKitEnabled absent/vide -> false', () => {
  assert.equal(isLiveKitEnabled(undefined), false);
  assert.equal(isLiveKitEnabled(''), false);
  assert.equal(isLiveKitEnabled(null), false);
});

// 2b. valeur inconnue -> false + warning
test('listenerUI : isLiveKitEnabled valeur inconnue -> false', () => {
  const orig = console.warn; let warned = false; console.warn = () => { warned = true; };
  try { assert.equal(isLiveKitEnabled('maybe'), false); }
  finally { console.warn = orig; }
  assert.equal(warned, true);
});

// 3. bouton visible si activé (état idle -> primary visible)
test('listenerUI : bouton principal visible à l état idle', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'idle', volume: 0.8, muted: false, hasAudioTrack: false }, els);
  assert.equal(els.primary.hidden, false);
  assert.equal(els.primary.textContent, 'ÉCOUTER LE DIRECT');
});

// 4. premier clic déclenche la connexion (onPrimary appelé)
test('listenerUI : premier clic appelle onPrimary', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  let called = 0;
  wireListenerControls({ els, onPrimary: () => { called++; }, onMuteToggle: () => {}, onVolume: () => {} });
  els.primary._fire('click');
  assert.equal(called, 1);
});

// 5. statut en attente
test('listenerUI : statut "En attente du direct"', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'waiting_for_track', volume: 0.8, muted: false, hasAudioTrack: false }, els);
  assert.equal(els.status.textContent, 'En attente du direct');
});

// 6. statut lecture
test('listenerUI : statut "Lecture en cours"', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: false, hasAudioTrack: true }, els);
  assert.equal(els.status.textContent, 'Lecture en cours');
});

// 7. bouton enceinte (🔇/🔊) + aria-label mute/unmute
test('listenerUI : bouton enceinte 🔊 puis 🔇 + aria-label', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: false, hasAudioTrack: true }, els);
  assert.equal(els.speaker.hidden, false);
  assert.equal(els.speaker.textContent, '🔊');
  assert.equal(els.speaker.getAttribute('aria-label'), 'Couper le son');
  renderListenerState({ state: 'playing', volume: 0.8, muted: true, hasAudioTrack: true }, els);
  assert.equal(els.speaker.textContent, '🔇');
  assert.equal(els.speaker.getAttribute('aria-label'), 'Réactiver le son');
});

// 8. volume (slider + pourcentage)
test('listenerUI : volume slider + pourcentage', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.5, muted: false, hasAudioTrack: true }, els);
  assert.equal(els.volume.value, '0.5');
  assert.equal(els.volumeLabel.textContent, '50%');
});

// 8b. volume input déclenche onVolume
test('listenerUI : volume input appelle onVolume', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  let v = null;
  wireListenerControls({ els, onPrimary: () => {}, onMuteToggle: () => {}, onVolume: (x) => { v = x; } });
  els.volume.value = '0.25';
  els.volume._fire('input');
  assert.equal(v, 0.25);
});

// 9. erreur + retry (bouton RÉESSAYER)
test('listenerUI : erreur -> statut Erreur audio + RÉESSAYER', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'error', volume: 0.8, muted: false, hasAudioTrack: false, lastError: { code: 'disconnected' } }, els);
  assert.equal(els.status.textContent, 'Erreur audio');
  assert.equal(els.primary.hidden, false);
  assert.equal(els.primary.textContent, 'RÉESSAYER');
});

// 10. section indépendante (carte séparée, n interfère pas avec Collab-Hub)
test('listenerUI : section est une carte séparée lk-listener', () => {
  const doc = fakeDocument();
  const { section } = buildListenerDOM(doc, null);
  assert.ok(section.className.includes('lk-listener'));
  assert.equal(section.getAttribute('data-lk-section'), ''); // attribut présent (vide)
});

// 11. diagnostic existant continue + extension LiveKit
test('listenerUI : diagnostic panel + extension LiveKit (refreshLivekit)', () => {
  // diagnosticPanel utilise le `document` global pour createElement (liste des
  // headers) -> on stubbe globalThis.document le temps du test.
  const root = fakeDocument();
  const origDoc = globalThis.document;
  globalThis.document = fakeDocument();
  try {
    const fakeSocket = { id: 'sock-1', on() {}, onAny() {}, offAny() {}, emit() {} };
    const api = {
      socket: fakeSocket,
      observeHeaderOnce() {}, observeKnownHeadersOnce() {}, isObserved: () => true, forget() {},
    };
    const diag = initDiagnostic(api, root, {
      livekitDiag: () => ({ enabled: true, snapshot: { state: 'playing', roomName: 'main', identity: 'listener-1', participantCount: 2, audioTrackSid: 'tr-9', performerIdentity: 'performer-1', volume: 0.6, muted: false, autoplayBlocked: false, reconnectCount: 1, lastError: null } }),
    });
    diag.refreshLivekit();
    assert.equal(root.querySelector('diag-lk-enabled').textContent, 'oui');
    assert.equal(root.querySelector('diag-lk-state').textContent, 'playing');
    assert.equal(root.querySelector('diag-lk-room').textContent, 'main');
    assert.equal(root.querySelector('diag-lk-participants').textContent, '2');
    assert.equal(root.querySelector('diag-lk-track').textContent, 'tr-9');
    assert.equal(root.querySelector('diag-lk-performer').textContent, 'performer-1');
    assert.equal(root.querySelector('diag-lk-volume').textContent, '60%');
    assert.equal(root.querySelector('diag-lk-reconnects').textContent, '1');
    // Le diagnostic existant (Connexion) fonctionne toujours.
    diag.setStatus('connected');
    assert.equal(root.querySelector('diag-conn-state').textContent, 'connecté');
  } finally {
    globalThis.document = origDoc;
  }
});

// ================= Control Room performer — Lot 4E =================

import {
  deriveCompositeState, broadcastStatus, isOnAir, describeError,
  derivePermission, COMPOSITE_STATES, PUBLISHER_ACTIVE,
} from '../src/control-room/controlRoomState.js';
import { createControlRoomController } from '../src/control-room/controlRoomController.js';
import {
  buildControlRoomDOM, renderControlRoom, renderMeter,
  updateBroadcastEnabled, wireControlRoom, buildLoginDOM, renderLogin, wireLogin,
} from '../src/control-room/controlRoomView.js';
import { createControlRoomGate, GATE_STATES } from '../src/control-room/controlRoomGate.js';

// --- Faux moteur audio (boundary contrôleur) ---
function makeFakeAudioEngine({
  state = 'idle', devices = [], gain = 1, outputStream = null,
  meter = null, error = null, selectedDeviceId = null, selectedDeviceLabel = null,
  captureFail = null, permFail = null,
} = {}) {
  let st = state, devs = devices.slice(), g = gain, os = outputStream;
  let mt = meter, err = error, selId = selectedDeviceId, selLabel = selectedDeviceLabel;
  const listeners = new Set();
  const calls = { requestPermission: 0, listDevices: 0, selectDevice: 0, startCapture: 0, stopCapture: 0, setMasterGain: 0, destroy: 0 };
  const notify = () => { const s = snap(); for (const l of listeners) { try { l(s); } catch {} } };
  function snap() {
    return {
      state: st, selectedDeviceId: selId, selectedDeviceLabel: selLabel,
      devices: devs.slice(), settings: (st === 'capturing') ? { label: selLabel || 'dev' } : null,
      gain: g, meter: mt ? { ...mt } : null, error: err ? { ...err } : null,
      hasSourceStream: st === 'capturing', hasOutputStream: !!os, updatedAt: 1,
    };
  }
  return {
    _calls: calls,
    _set(s) { st = s; notify(); },
    _setDevices(d) { devs = d.slice(); notify(); },
    _setOutputStream(o) { os = o; notify(); },
    _setMeter(m) { mt = m; },
    _setError(e) { err = e; st = 'error'; notify(); },
    async requestPermission() { calls.requestPermission++; if (permFail) { st = 'error'; err = { code: permFail, message: permFail }; notify(); throw err; } st = 'permission_granted'; if (!selId && devs.length) { selId = devs[0].deviceId; selLabel = devs[0].label; } notify(); return { code: 'ok' }; },
    async listDevices() { calls.listDevices++; return devs.slice(); },
    selectDevice(id) { calls.selectDevice++; selId = id; const f = devs.find((d) => d.deviceId === id); selLabel = f ? f.label : null; notify(); },
    async startCapture() { calls.startCapture++; if (st === 'capturing') return; if (captureFail) { st = 'error'; err = { code: captureFail, message: captureFail }; notify(); throw err; } st = 'capturing'; if (!os) os = makeFakeOutputStream(makeFakeMediaTrack()); notify(); },
    async stopCapture() { calls.stopCapture++; st = 'stopped'; os = null; mt = null; notify(); },
    setMasterGain(v) { calls.setMasterGain++; g = v; notify(); return g; },
    readMeter() { return mt ? { ...mt } : { rms: 0, peak: 0, db: -Infinity, clipping: false }; },
    getOutputStream() { return os; },
    getSnapshot() { return snap(); },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    getState() { return st; },
    async destroy() { calls.destroy++; st = 'stopped'; },
  };
}

// --- Faux publisher (boundary contrôleur) ---
function makeFakePublisher({ state = 'idle', fail = null } = {}) {
  let s = { state, roomName: null, identity: null, participantSid: null, trackSid: null, connected: false, published: false, reconnectCount: 0, lastError: null, connectedAt: null, liveSince: null };
  const listeners = new Set();
  const calls = { connect: 0, stop: 0, destroy: 0 };
  let lastConnectArgs = null;
  const notify = () => { for (const l of listeners) { try { l({ ...s }); } catch {} } };
  return {
    _calls: calls,
    _lastConnectArgs: () => lastConnectArgs,
    _set(patch) { s = { ...s, ...patch }; notify(); },
    async connect({ password, outputStream }) {
      calls.connect++; lastConnectArgs = { password, outputStream };
      if (fail) { const e = { code: fail, message: fail }; s = { ...s, state: 'error', lastError: e }; notify(); throw e; }
      s = { ...s, state: 'live', connected: true, published: true, trackSid: 'pub-1', identity: 'performer-1', roomName: 'main', connectedAt: 1000, liveSince: 1000 };
      notify(); return s;
    },
    async stop() { calls.stop++; s = { state: 'stopped', roomName: null, identity: null, participantSid: null, trackSid: null, connected: false, published: false, reconnectCount: 0, lastError: null, connectedAt: null, liveSince: null }; notify(); },
    async destroy() { calls.destroy++; s = { ...s, state: 'stopped' }; notify(); },
    getSnapshot() { return { ...s }; },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    getState() { return s.state; },
  };
}

function makeController({ audio, publisher, ...rest } = {}) {
  return createControlRoomController({
    audioEngine: audio || makeFakeAudioEngine({ devices: [{ deviceId: 'd1', label: 'BlackHole 2ch' }], outputStream: makeFakeOutputStream(makeFakeMediaTrack()) }),
    publisher: publisher || makeFakePublisher(),
    now: () => 1,
    ...rest,
  });
}
// Moteur audio "prêt à diffuser" : capture en cours + outputStream.
function readyAudio() {
  return makeFakeAudioEngine({
    state: 'capturing',
    devices: [{ deviceId: 'd1', label: 'BlackHole 2ch' }],
    outputStream: makeFakeOutputStream(makeFakeMediaTrack()),
    selectedDeviceId: 'd1', selectedDeviceLabel: 'BlackHole 2ch',
  });
}

// ---------- États composites (pur) ----------
test('crState : COMPOSITE_STATES contient live + error + capturing', () => {
  assert.ok(COMPOSITE_STATES.includes('live'));
  assert.ok(COMPOSITE_STATES.includes('error'));
  assert.ok(COMPOSITE_STATES.includes('capturing'));
});

test('crState : deriveCompositeState idle/stopped -> idle/stopped', () => {
  assert.equal(deriveCompositeState('idle', 'idle', false), 'idle');
  assert.equal(deriveCompositeState('stopped', 'stopped', true), 'stopped');
});

test('crState : publisher live -> composite live (prioritaire sur audio)', () => {
  assert.equal(deriveCompositeState('capturing', 'live', true), 'live');
});

test('crState : audio capturing + publisher idle -> capturing', () => {
  assert.equal(deriveCompositeState('capturing', 'idle', true), 'capturing');
});

test('crState : permission_granted sans device -> selecting_device', () => {
  assert.equal(deriveCompositeState('permission_granted', 'idle', false), 'selecting_device');
  assert.equal(deriveCompositeState('permission_granted', 'idle', true), 'permission_granted');
});

test('crState : error prioritaire (publisher ou audio)', () => {
  assert.equal(deriveCompositeState('capturing', 'error', true), 'error');
  assert.equal(deriveCompositeState('error', 'idle', true), 'error');
});

test('crState : broadcastStatus ON AIR seulement pour live', () => {
  assert.equal(broadcastStatus('live'), 'ON AIR');
  assert.equal(broadcastStatus('capturing'), 'HORS ANTENNE');
  assert.equal(broadcastStatus('reconnecting'), 'RECONNEXION…');
  assert.equal(broadcastStatus('requesting_token'), 'CONNEXION…');
});

test('crState : isOnAir vrai uniquement pour live', () => {
  assert.equal(isOnAir('live'), true);
  assert.equal(isOnAir('capturing'), false);
});

test('crState : describeError couvre token_unauthorized + permission_denied', () => {
  // Lot 4F.1 : token_unauthorized = session expirée (auth par cookie, plus de password).
  assert.equal(describeError('token_unauthorized'), 'Session expirée — reconnectez-vous à la Control Room.');
  assert.ok(describeError('permission_denied').includes('micro'));
  assert.equal(describeError('code_inconnu_xyz'), 'Erreur inconnue.');
});

test('crState : derivePermission états', () => {
  assert.equal(derivePermission('requesting_permission', null), 'requesting');
  assert.equal(derivePermission('idle', { code: 'permission_denied' }), 'denied');
  assert.equal(derivePermission('capturing', null), 'granted');
  assert.equal(derivePermission('idle', null), 'not_requested');
});

test('crState : PUBLISHER_ACTIVE contient live et connecting, pas stopped', () => {
  assert.ok(PUBLISHER_ACTIVE.has('live'));
  assert.ok(PUBLISHER_ACTIVE.has('connecting'));
  assert.ok(!PUBLISHER_ACTIVE.has('stopped'));
});

// ---------- Contrôleur (30) ----------
test('crController : construction rejette sans audioEngine', () => {
  assert.throws(() => createControlRoomController({ audioEngine: null, publisher: makeFakePublisher() }));
});

test('crController : construction rejette sans publisher', () => {
  assert.throws(() => createControlRoomController({ audioEngine: makeFakeAudioEngine(), publisher: null }));
});

test('crController : snapshot initial idle, onAir false, canBroadcast false', () => {
  const c = makeController({ audio: makeFakeAudioEngine({ state: 'idle', devices: [] }) });
  const s = c.getSnapshot();
  assert.equal(s.composite, 'idle');
  assert.equal(s.onAir, false);
  assert.equal(s.canBroadcast, false);
});

test('crController : snapshot ne contient jamais password/token/clé', () => {
  const c = makeController({ audio: readyAudio() });
  const s = c.getSnapshot();
  assert.equal('password' in s, false);
  assert.equal('token' in s, false);
  assert.equal('apiKey' in s, false);
  assert.equal('apiSecret' in s, false);
});

test('crController : requestPermission appelle audioEngine + ok', async () => {
  const a = makeFakeAudioEngine({ devices: [{ deviceId: 'd1', label: 'B' }] });
  const c = makeController({ audio: a });
  const r = await c.requestPermission();
  assert.equal(r.ok, true);
  assert.equal(a._calls.requestPermission, 1);
});

test('crController : requestPermission permission_denied -> code', async () => {
  const a = makeFakeAudioEngine({ permFail: 'permission_denied' });
  const c = makeController({ audio: a });
  const r = await c.requestPermission();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'permission_denied');
});

test('crController : refreshDevices renvoie la liste', async () => {
  const a = makeFakeAudioEngine({ devices: [{ deviceId: 'd1', label: 'B' }, { deviceId: 'd2', label: 'Mic' }] });
  const c = makeController({ audio: a });
  const d = await c.refreshDevices();
  assert.equal(d.length, 2);
  assert.equal(a._calls.listDevices, 1);
});

test('crController : selectDevice transmet à audioEngine', () => {
  const a = makeFakeAudioEngine({ devices: [{ deviceId: 'd1', label: 'B' }] });
  const c = makeController({ audio: a });
  c.selectDevice('d1');
  assert.equal(a._calls.selectDevice, 1);
  assert.equal(a.getSnapshot().selectedDeviceId, 'd1');
});

test('crController : startCapture ok', async () => {
  const a = makeFakeAudioEngine({ state: 'permission_granted', devices: [{ deviceId: 'd1', label: 'B' }] });
  const c = makeController({ audio: a });
  const r = await c.startCapture();
  assert.equal(r.ok, true);
  assert.equal(a._calls.startCapture, 1);
  assert.equal(a.getState(), 'capturing');
});

test('crController : startCapture échec -> code capture_failed', async () => {
  const a = makeFakeAudioEngine({ state: 'permission_granted', captureFail: 'capture_failed' });
  const c = makeController({ audio: a });
  const r = await c.startCapture();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'capture_failed');
});

test('crController : stopCapture appelle audioEngine.stopCapture', async () => {
  const a = readyAudio();
  const c = makeController({ audio: a });
  await c.stopCapture();
  assert.equal(a._calls.stopCapture, 1);
});

test('crController : setGain(50) -> setMasterGain(0.5)', () => {
  const a = readyAudio();
  const c = makeController({ audio: a });
  c.setGain(50);
  assert.equal(a._calls.setMasterGain, 1);
  assert.equal(a.getSnapshot().gain, 0.5);
});

test('crController : setGain borne >100 -> 1.0 ; <0 -> 0', () => {
  const a = readyAudio();
  const c = makeController({ audio: a });
  c.setGain(150);
  assert.equal(a.getSnapshot().gain, 1);
  c.setGain(-20);
  assert.equal(a.getSnapshot().gain, 0);
});

test('crController : startBroadcast sans capture -> no_output_stream', async () => {
  const a = makeFakeAudioEngine({ state: 'idle', devices: [{ deviceId: 'd1', label: 'B' }] });
  const c = makeController({ audio: a });
  const r = await c.startBroadcast('pw');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'no_output_stream');
});

test('crController : startBroadcast capture+password -> publisher.connect + ok', async () => {
  const a = readyAudio();
  const p = makeFakePublisher();
  const c = makeController({ audio: a, publisher: p });
  const r = await c.startBroadcast('pw');
  assert.equal(r.ok, true);
  assert.equal(p._calls.connect, 1);
});

test('crController : startBroadcast ne transmet aucun password (auth via session)', async () => {
  const a = readyAudio();
  const p = makeFakePublisher();
  const c = makeController({ audio: a, publisher: p });
  await c.startBroadcast();
  const args = p._lastConnectArgs();
  assert.ok(args.outputStream, 'outputStream transmis');
  assert.equal(args.password, undefined, 'aucun password transmis au publisher');
});

test('crController : startBroadcast échec token_unauthorized -> code', async () => {
  const p = makeFakePublisher({ fail: 'token_unauthorized' });
  const c = makeController({ audio: readyAudio(), publisher: p });
  const r = await c.startBroadcast('pw');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'token_unauthorized');
});

test('crController : startBroadcast échec connect_failed -> code', async () => {
  const p = makeFakePublisher({ fail: 'connect_failed' });
  const c = makeController({ audio: readyAudio(), publisher: p });
  const r = await c.startBroadcast('pw');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'connect_failed');
});

test('crController : startBroadcast déjà live -> publisher_busy', async () => {
  const p = makeFakePublisher({ state: 'live' });
  const c = makeController({ audio: readyAudio(), publisher: p });
  const r = await c.startBroadcast('pw');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'publisher_busy');
});

test('crController : double-clic gardé (2e appel concurrent bloqué)', async () => {
  const a = readyAudio();
  const p = makeFakePublisher();
  const c = makeController({ audio: a, publisher: p });
  const p1 = c.startBroadcast('pw');      // synchrone : broadcasting = true
  const p2 = c.startBroadcast('pw');      // bloqué par le garde
  const r1 = await p1; const r2 = await p2;
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'publisher_busy');
});

test('crController : startBroadcast succès -> onAir + composite live + ON AIR', async () => {
  const c = makeController({ audio: readyAudio() });
  await c.startBroadcast('pw');
  const s = c.getSnapshot();
  assert.equal(s.onAir, true);
  assert.equal(s.composite, 'live');
  assert.equal(s.broadcastLabel, 'ON AIR');
});

test('crController : stopBroadcast appelle publisher.stop', async () => {
  const p = makeFakePublisher({ state: 'live' });
  const c = makeController({ audio: readyAudio(), publisher: p });
  await c.stopBroadcast();
  assert.equal(p._calls.stop, 1);
});

test('crController : retry = startBroadcast (après erreur)', async () => {
  const a = readyAudio();
  const p = makeFakePublisher();
  const c = makeController({ audio: a, publisher: p });
  p._set({ state: 'error', lastError: { code: 'disconnected', message: 'x' } });
  const r = await c.retry('pw');
  assert.equal(r.ok, true);
  assert.equal(p._calls.connect, 1);
});

test('crController : stopAll stoppe publisher + capture', async () => {
  const a = readyAudio();
  const p = makeFakePublisher({ state: 'live' });
  const c = makeController({ audio: a, publisher: p });
  await c.stopAll();
  assert.equal(p._calls.stop, 1);
  assert.equal(a._calls.stopCapture, 1);
});

test('crController : destroy appelle publisher.destroy + audioEngine.destroy', async () => {
  const a = readyAudio();
  const p = makeFakePublisher();
  const c = makeController({ audio: a, publisher: p });
  await c.destroy();
  assert.equal(p._calls.destroy, 1);
  assert.equal(a._calls.destroy, 1);
});

test('crController : subscriber notifié au changement audioEngine', () => {
  const a = readyAudio();
  const c = makeController({ audio: a });
  let snap = null;
  c.subscribe((s) => { snap = s; });
  a._set('stopped');
  assert.ok(snap !== null);
  assert.equal(snap.audioState, 'stopped');
});

test('crController : subscriber notifié au changement publisher', () => {
  const p = makeFakePublisher();
  const c = makeController({ publisher: p });
  let snap = null;
  c.subscribe((s) => { snap = s; });
  p._set({ state: 'reconnecting' });
  assert.ok(snap !== null);
  assert.equal(snap.publisherState, 'reconnecting');
  assert.equal(snap.composite, 'reconnecting');
});

test('crController : error publisher prioritaire -> message describeError', () => {
  const p = makeFakePublisher();
  const c = makeController({ publisher: p });
  p._set({ state: 'error', lastError: { code: 'token_unauthorized', message: 'x' } });
  const s = c.getSnapshot();
  assert.equal(s.composite, 'error');
  assert.equal(s.error.code, 'token_unauthorized');
  assert.equal(s.error.message, 'Session expirée — reconnectez-vous à la Control Room.');
});

test('crController : error audio quand publisher ok', () => {
  const a = readyAudio();
  const c = makeController({ audio: a });
  a._setError({ code: 'device_not_found', message: 'x' });
  const s = c.getSnapshot();
  assert.equal(s.composite, 'error');
  assert.equal(s.error.code, 'device_not_found');
});

test('crController : aucun getUserMedia/capture supplémentaire au publish', async () => {
  const a = readyAudio();
  const c = makeController({ audio: a });
  const before = a._calls.startCapture;
  await c.startBroadcast('pw');
  assert.equal(a._calls.startCapture, before); // le publish réutilise outputStream
});

test('crController : canBroadcast vrai quand capture + outputStream + publisher idle', () => {
  const c = makeController({ audio: readyAudio() });
  assert.equal(c.getSnapshot().canBroadcast, true);
});

// ---------- Vue (pure DOM) ----------
function crSnap(over = {}) {
  return {
    composite: 'idle', audioState: 'idle', publisherState: 'idle', onAir: false,
    permission: 'not_requested', devices: [], selectedDeviceId: null, selectedDeviceLabel: null,
    settings: null, gain: 1, meter: null, hasOutputStream: false, canBroadcast: false,
    broadcastLabel: 'HORS ANTENNE', roomName: null, identity: null, trackSid: null,
    connected: false, published: false, reconnectCount: 0, liveSince: null,
    error: null, lastActionResult: null, updatedAt: 1, ...over,
  };
}

test('crView : build crée 7 sections + root cr-room', () => {
  const doc = fakeDocument();
  const { root } = buildControlRoomDOM(doc, null);
  assert.ok(root.className.includes('cr-room'));
  const sections = doc._created.filter((e) => e._tag === 'section');
  assert.equal(sections.length, 7);
});

test('crView : écran login champ mot de passe type=password + autocomplete off', () => {
  const doc = fakeDocument();
  const { els } = buildLoginDOM(doc, null);
  assert.equal(els.password.type, 'password');
  assert.equal(els.password.autocomplete, 'off');
});

test('crView : Control Room sans champ mot de passe (auth via session)', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  assert.equal(els.password, undefined, 'plus de <input> password en Control Room');
  assert.ok(els.logout, 'bouton QUITTER présent');
  assert.ok(els.sessionLabel, 'label de session présent');
});

test('crView : rendu idle -> HORS ANTENNE, onair hidden, stopBroadcast hidden', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderControlRoom(crSnap(), els);
  assert.equal(els.broadcastLabel.textContent, 'HORS ANTENNE');
  assert.equal(els.onair.hidden, true);
  assert.equal(els.stopBroadcast.hidden, true);
});

test('crView : rendu live -> ON AIR, onair visible, stop visible, bouton EN DIFFUSION', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderControlRoom(crSnap({ composite: 'live', publisherState: 'live', onAir: true, broadcastLabel: 'ON AIR' }), els);
  assert.equal(els.onair.hidden, false);
  assert.equal(els.stopBroadcast.hidden, false);
  assert.equal(els.startBroadcast.textContent, 'EN DIFFUSION');
});

test('crView : rendu error -> message derreur + dot is-off', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderControlRoom(crSnap({ composite: 'error', error: { code: 'token_unauthorized', message: 'Mot de passe incorrect.' } }), els);
  assert.equal(els.err.textContent, 'Mot de passe incorrect.');
  assert.ok(els.broadcastDot.getAttribute('class').includes('is-off'));
});

test('crView : permission denied -> AUTORISER visible "RÉAUTORISER"', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderControlRoom(crSnap({ permission: 'denied' }), els);
  assert.equal(els.authorize.hidden, false);
  assert.equal(els.authorize.textContent, 'RÉAUTORISER LE MICRO');
  assert.equal(els.permState.textContent, 'Micro refusé');
});

test('crView : permission granted -> authorize hidden, device enabled', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderControlRoom(crSnap({ permission: 'granted', audioState: 'permission_granted', devices: [{ deviceId: 'd1', label: 'B' }], selectedDeviceId: 'd1' }), els);
  assert.equal(els.authorize.hidden, true);
  assert.equal(els.device.disabled, false);
});

test('crView : capturing -> startCapture hidden, stopCapture visible, device disabled', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderControlRoom(crSnap({ audioState: 'capturing', permission: 'granted', selectedDeviceLabel: 'BlackHole', devices: [{ deviceId: 'd1', label: 'B' }] }), els);
  assert.equal(els.startCapture.hidden, true);
  assert.equal(els.stopCapture.hidden, false);
  assert.equal(els.device.disabled, true);
  assert.ok(els.captureHint.textContent.includes('BlackHole'));
});

test('crView : devices peuplées dans le select + value sélectionné', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderControlRoom(crSnap({ permission: 'granted', audioState: 'permission_granted', devices: [{ deviceId: 'd1', label: 'BlackHole' }, { deviceId: 'd2', label: 'Mic' }], selectedDeviceId: 'd2' }), els);
  assert.equal(els.device._options.length, 2);
  assert.equal(els.device._options[1].label, 'Mic');
  assert.equal(els.device.value, 'd2');
});

test('crView : renderMeter null -> bar 0%, dB "—"', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderMeter(null, els);
  assert.equal(els.meterBar.getAttribute('style'), 'width:0%');
  assert.equal(els.meterDb.textContent, '—');
});

test('crView : renderMeter rms/peak/db -> bar 50%, peak 80%, texte dBFS', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderMeter({ rms: 0.5, peak: 0.8, db: -6, clipping: false }, els);
  assert.equal(els.meterBar.getAttribute('style'), 'width:50%');
  assert.equal(els.meterPeak.getAttribute('style'), 'left:80%');
  assert.equal(els.meterDb.textContent, '-6.0 dBFS');
});

test('crView : renderMeter clipping -> class is-clipping ajoutée', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderMeter({ rms: 1, peak: 1, db: 0, clipping: true }, els);
  assert.equal(els.meter.classList._c, 'is-clipping'); // fakeDomEl.classList.add stocke dans _c
});

test('crView : renderMeter db -Infinity -> "-∞ dBFS"', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderMeter({ rms: 0, peak: 0, db: -Infinity, clipping: false }, els);
  assert.equal(els.meterDb.textContent, '-∞ dBFS');
});

test('crView : gain 1 -> slider 100 + label 100%', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderControlRoom(crSnap({ gain: 1 }), els);
  assert.equal(els.gain.value, '100');
  assert.equal(els.gainLabel.textContent, '100%');
});

test('crView : updateBroadcastEnabled suit canBroadcast (aucun password requis)', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  els._canBroadcast = false;
  updateBroadcastEnabled(els);
  assert.equal(els.startBroadcast.disabled, true);
  els._canBroadcast = true;
  updateBroadcastEnabled(els);
  assert.equal(els.startBroadcast.disabled, false);
});

test('crView : wire -> clic DÉMARRER appelle onStartBroadcast (sans password)', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  let called = false;
  wireControlRoom({ els, handlers: { onStartBroadcast: () => { called = true; } } });
  els.startBroadcast._fire('click');
  assert.equal(called, true);
});

test('crView : wire -> clic QUITTER appelle onLogout', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  let called = false;
  wireControlRoom({ els, handlers: { onLogout: () => { called = true; } } });
  els.logout._fire('click');
  assert.equal(called, true);
});

test('crView : wire -> change device appelle onSelectDevice', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  let received = null;
  wireControlRoom({ els, handlers: { onSelectDevice: (id) => { received = id; } } });
  els.device.value = 'd2';
  els.device._fire('change');
  assert.equal(received, 'd2');
});

test('crView : wire -> input gain appelle onGain(int)', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  let received = null;
  wireControlRoom({ els, handlers: { onGain: (v) => { received = v; } } });
  els.gain.value = '73';
  els.gain._fire('input');
  assert.equal(received, 73);
});

test('crView : wire -> clic authorize appelle onAuthorize', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  let called = false;
  wireControlRoom({ els, handlers: { onAuthorize: () => { called = true; } } });
  els.authorize._fire('click');
  assert.equal(called, true);
});

test('crView : dernier échec lastActionResult -> message describeError', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderControlRoom(crSnap({ lastActionResult: { ok: false, code: 'no_password' } }), els);
  assert.equal(els.lastAction.textContent, 'Saisissez le mot de passe performer.');
});

test('crView : aucune valeur secrète écrite dans le DOM', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  renderControlRoom(crSnap({ identity: 'performer-1', roomName: 'main', trackSid: 'pub-1' }), els);
  // Lot 4F.1 : plus aucun champ mot de passe en Control Room (auth via session).
  assert.equal(els.password, undefined);
  // Pas de token/clé dans les libellés de statut.
  assert.ok(!els.status.textContent.includes('token'));
  assert.ok(!els.err.textContent.includes('secret'));
});

// ---------- Intégration (contrôleur + faux moteurs, flux complet) ----------
test('crInteg : flux complet idle -> permission -> capture -> live -> arrêt', async () => {
  const a = makeFakeAudioEngine({ devices: [{ deviceId: 'd1', label: 'BlackHole' }] });
  const p = makeFakePublisher();
  const c = makeController({ audio: a, publisher: p });
  assert.equal(c.getSnapshot().composite, 'idle');
  await c.requestPermission();
  assert.equal(c.getSnapshot().composite, 'permission_granted');
  await c.refreshDevices();
  c.selectDevice('d1');
  await c.startCapture();
  assert.equal(c.getSnapshot().composite, 'capturing');
  assert.equal(c.getSnapshot().canBroadcast, true);
  const r = await c.startBroadcast('pw');
  assert.equal(r.ok, true);
  assert.equal(c.getSnapshot().onAir, true);
  await c.stopBroadcast();
  assert.equal(c.getSnapshot().onAir, false);
});

test('crInteg : startBroadcast démarre sans password (auth via session)', async () => {
  const c = makeController({ audio: readyAudio() });
  await c.startCapture().catch(() => {});
  const r = await c.startBroadcast();
  assert.equal(r.ok, true);
});

test('crInteg : échec token -> error + message, puis retry -> live', async () => {
  const a = readyAudio();
  let p = makeFakePublisher({ fail: 'token_unauthorized' });
  const c = makeController({ audio: a, publisher: p });
  const r = await c.startBroadcast();
  assert.equal(r.code, 'token_unauthorized');
  assert.equal(c.getSnapshot().composite, 'error');
  assert.equal(c.getSnapshot().error.message, 'Session expirée — reconnectez-vous à la Control Room.');
  // Retry avec un publisher sain (simule nouvelle tentative).
  p = makeFakePublisher();
  const c2 = createControlRoomController({ audioEngine: a, publisher: p, now: () => 1 });
  const r2 = await c2.startBroadcast();
  assert.equal(r2.ok, true);
});

test('crInteg : subscriber reçoit les transitions composite dans l\'ordre', async () => {
  const a = makeFakeAudioEngine({ devices: [{ deviceId: 'd1', label: 'B' }] });
  const p = makeFakePublisher();
  const c = makeController({ audio: a, publisher: p });
  const seen = [];
  c.subscribe((s) => seen.push(s.composite));
  await c.requestPermission();
  await c.startCapture();
  await c.startBroadcast('pw');
  assert.ok(seen.includes('permission_granted'));
  assert.ok(seen.includes('capturing'));
  assert.ok(seen.includes('live'));
});

test('crInteg : setGain reflété dans le snapshot', () => {
  const c = makeController({ audio: readyAudio() });
  c.setGain(25);
  assert.equal(c.getSnapshot().gain, 0.25);
});

test('crInteg : stopAll remet HORS ANTENNE et arrête la capture', async () => {
  const a = readyAudio();
  const p = makeFakePublisher({ state: 'live' });
  const c = makeController({ audio: a, publisher: p });
  await c.stopAll();
  assert.equal(c.getSnapshot().composite, 'stopped');
  assert.equal(a.getState(), 'stopped');
});

test('crInteg : destroy nettoie les deux moteurs (idempotent via fakes)', async () => {
  const a = readyAudio();
  const p = makeFakePublisher();
  const c = makeController({ audio: a, publisher: p });
  await c.destroy();
  assert.equal(p._calls.destroy, 1);
  assert.equal(a._calls.destroy, 1);
});

test('crInteg : le snapshot ne contient jamais le password durant tout le flux', async () => {
  const c = makeController({ audio: readyAudio() });
  await c.startBroadcast('topsecret');
  const s = c.getSnapshot();
  assert.equal('password' in s, false);
  assert.equal('token' in s, false);
  assert.ok(!JSON.stringify(s).includes('topsecret'));
});

test('crInteg : view rendu cohérent avec le snapshot live du contrôleur', async () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  const c = makeController({ audio: readyAudio() });
  c.subscribe((s) => renderControlRoom(s, els));
  await c.startBroadcast('pw');
  assert.equal(els.onair.hidden, false);
  assert.equal(els.broadcastLabel.textContent, 'ON AIR');
});

test('crInteg : reconnexion publisher -> composite reconnecting, broadcastLabel RECONNEXION…', () => {
  const a = readyAudio();
  const p = makeFakePublisher();
  const c = makeController({ audio: a, publisher: p });
  p._set({ state: 'live' });
  p._set({ state: 'reconnecting', reconnectCount: 1 });
  const s = c.getSnapshot();
  assert.equal(s.composite, 'reconnecting');
  assert.equal(s.broadcastLabel, 'RECONNEXION…');
  assert.equal(s.reconnectCount, 1);
});

test('crInteg : déconnexion involontaire -> error + propose retry (publisher stopped apres error)', async () => {
  const a = readyAudio();
  const p = makeFakePublisher();
  const c = makeController({ audio: a, publisher: p });
  p._set({ state: 'live' });
  p._set({ state: 'error', lastError: { code: 'disconnected', message: 'x' } });
  assert.equal(c.getSnapshot().composite, 'error');
  // Retry possible : publisher repassé en stopped (après error) puis reconnect.
  p._set({ state: 'stopped', lastError: null });
  const r = await c.startBroadcast('pw');
  assert.equal(r.ok, true);
});

// ============================================================
// Lot 4F.1 — Session Control Room + bouton enceinte listener
// ============================================================
import { readFileSync } from 'node:fs';

const T0 = 1234567890000;

// --- Helpers endpoints session ---
function callLogin({ method = 'POST', body, env = FAKE_ENV, now = () => T0 } = {}) {
  const req = fakeReq({ method, body });
  const res = fakeRes();
  return loginHandler(req, res, env, { now }).then(() => res);
}
function callLogout({ method = 'POST', env = FAKE_ENV } = {}) {
  const req = fakeReq({ method });
  const res = fakeRes();
  return logoutHandler(req, res, env).then(() => res);
}
function callSession({ method = 'GET', cookie = null, env = FAKE_ENV, now = () => T0 } = {}) {
  const req = fakeReq({ method, cookie });
  const res = fakeRes();
  return sessionHandler(req, res, env, { now }).then(() => res);
}
function cookieValue(setCookie) {
  return setCookie.split(';')[0].slice(COOKIE_NAME.length + 1);
}

// ================= Tests session serveur (§16, 15) =================

// 1. login méthode invalide -> 405
test('session : login GET -> 405 + Allow POST', async () => {
  const res = await callLogin({ method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
});

// 2. login body invalide -> 400
test('session : login body non JSON -> 400', async () => {
  const res = await callLogin({ body: 'not-json{' });
  assert.equal(res.statusCode, 400);
});

// 3. mauvais mot de passe -> 401 générique
test('session : login mauvais mot de passe -> 401 unauthorized', async () => {
  const res = await callLogin({ body: { password: 'wrong' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

// 4. bon mot de passe -> cookie HttpOnly
test('session : login bon mot de passe -> 200 + Set-Cookie HttpOnly', async () => {
  const res = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.authenticated, true);
  const sc = res.headers['Set-Cookie'];
  assert.ok(sc.includes('HttpOnly'));
  assert.ok(sc.startsWith(`${COOKIE_NAME}=`));
});

// 5. cookie Secure en production
test('session : cookie Secure en production', async () => {
  const prodEnv = { ...FAKE_ENV, VERCEL_ENV: 'production' };
  const res = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD }, env: prodEnv });
  assert.ok(res.headers['Set-Cookie'].includes('Secure'));
  const devRes = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD }, env: FAKE_ENV });
  assert.ok(!devRes.headers['Set-Cookie'].includes('Secure'));
});

// 6. SameSite Strict
test('session : cookie SameSite=Strict', async () => {
  const res = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD } });
  assert.ok(res.headers['Set-Cookie'].includes('SameSite=Strict'));
});

// 7. expiration définie (Max-Age 7200)
test('session : cookie Max-Age=7200', async () => {
  const res = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD } });
  assert.ok(res.headers['Set-Cookie'].includes('Max-Age=7200'));
});

// 8. aucun mot de passe dans la réponse
test('session : réponse sans mot de passe ni secret', async () => {
  const res = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD } });
  assert.equal(res.body.password, undefined);
  assert.equal(res.body.PERFORMER_PASSWORD, undefined);
  assert.equal(res.body.secret, undefined);
  assert.ok(!JSON.stringify(res.body).includes(FAKE_ENV.PERFORMER_PASSWORD));
});

// 9. session valide -> authenticated true
test('session : GET session cookie valide -> authenticated true + exp', async () => {
  const value = mintSession(FAKE_ENV, { now: () => T0 });
  const res = await callSession({ cookie: `${COOKIE_NAME}=${value}`, now: () => T0 + 1000 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.authenticated, true);
  assert.equal(res.body.exp, T0 + SESSION_TTL_SECONDS * 1000);
});

// 10. session absente -> authenticated false (pas 401)
test('session : GET sans cookie -> authenticated false', async () => {
  const res = await callSession({ cookie: null });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.authenticated, false);
});

// 11. cookie altéré -> rejeté (authenticated false)
test('session : cookie altéré -> authenticated false', async () => {
  const value = mintSession();
  const tampered = value.slice(0, -2) + 'AA';
  const res = await callSession({ cookie: `${COOKIE_NAME}=${tampered}` });
  assert.equal(res.body.authenticated, false);
});

// 12. cookie expiré -> rejeté
test('session : cookie expiré -> authenticated false', async () => {
  const expired = mintSession(FAKE_ENV, { now: () => 0 });
  const res = await callSession({ cookie: `${COOKIE_NAME}=${expired}`, now: () => 9999999999999 });
  assert.equal(res.body.authenticated, false);
});

// 13. logout efface cookie (Max-Age=0)
test('session : logout -> Set-Cookie Max-Age=0', async () => {
  const res = await callLogout();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.authenticated, false);
  assert.ok(res.headers['Set-Cookie'].includes('Max-Age=0'));
});

// 14. configuration absente -> 503
test('session : login config absente -> 503', async () => {
  const res = await callLogin({ body: { password: 'x' }, env: { ...FAKE_ENV, CONTROL_ROOM_SESSION_SECRET: '' } });
  assert.equal(res.statusCode, 503);
});

// 15. aucune valeur secrète logguée (la fonction ne renvoie jamais le secret)
test('session : validateSessionConfig ne renvoie aucune valeur secrète', () => {
  const cfg = validateSessionConfig(FAKE_ENV);
  assert.equal(cfg.ok, true);
  assert.ok(!JSON.stringify(cfg).includes(FAKE_ENV.CONTROL_ROOM_SESSION_SECRET));
  assert.ok(!JSON.stringify(cfg).includes(FAKE_ENV.PERFORMER_PASSWORD));
  // placeholder refusé
  const bad = validateSessionConfig({ ...FAKE_ENV, CONTROL_ROOM_SESSION_SECRET: 'replace-with-a-long-random-secret' });
  assert.equal(bad.ok, false);
});

// ================= Tests token performer (§17, 7) =================

// 1. performer sans session -> 401
test('token4F1 : performer sans session -> 401', async () => {
  const res = await callEndpoint({ body: { role: 'performer' } });
  assert.equal(res.statusCode, 401);
});

// 2. performer session expirée -> 401
test('token4F1 : performer session expirée -> 401', async () => {
  const expired = mintSession(FAKE_ENV, { now: () => 0 });
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${expired}`, now: () => 9999999999999 });
  assert.equal(res.statusCode, 401);
});

// 3. performer session valide -> token
test('token4F1 : performer session valide -> 200 + token', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  assert.equal(res.statusCode, 200);
  assert.ok(typeof res.body.token === 'string' && res.body.token.length > 0);
});

// 4. listener reste accessible sans session
test('token4F1 : listener sans session -> 200', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token);
});

// 5. champ password corps ignoré (avec session valide -> 200, sans session -> 401)
test('token4F1 : champ password corps ignoré (session prime)', async () => {
  const resOk = await callEndpoint({ body: { role: 'performer', password: 'whatever' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  assert.equal(resOk.statusCode, 200);
  const resNo = await callEndpoint({ body: { role: 'performer', password: 'whatever' } });
  assert.equal(resNo.statusCode, 401);
});

// 6. grants inchangés (canPublish true, canSubscribe false)
test('token4F1 : grants performer inchangés via session', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  const v = decodeJwtPayload(res.body.token).video;
  assert.equal(v.canPublish, true);
  assert.equal(v.canSubscribe, false);
  assert.equal(v.canPublishData, false);
});

// 7. aucun secret dans la réponse
test('token4F1 : réponse sans secret serveur', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  assert.equal(res.body.apiKey, undefined);
  assert.equal(res.body.apiSecret, undefined);
  assert.ok(!JSON.stringify(res.body).includes(FAKE_ENV.LIVEKIT_API_SECRET));
});

// ================= Tests gate Control Room (§18, 10) =================

function fakeSessionClient({ loginOk = true, authed = false, exp = null, failCheck = null } = {}) {
  const calls = { login: [], logout: 0, checkSession: 0 };
  return {
    _calls: calls,
    async login({ password }) {
      calls.login.push(password);
      if (!loginOk) throw { code: 'session_unauthorized', message: 'Mot de passe incorrect.' };
      return { authenticated: true, expiresIn: 7200 };
    },
    async logout() { calls.logout++; return { authenticated: false }; },
    async checkSession() {
      calls.checkSession++;
      if (failCheck) throw { code: 'session_unavailable', message: 'Service d\'authentification indisponible.' };
      return { authenticated: authed, exp };
    },
  };
}

// 1. écran login visible sans session (gate initial unauthenticated)
test('gate : état initial unauthenticated', () => {
  const g = createControlRoomGate({ sessionClient: fakeSessionClient() });
  const s = g.getSnapshot();
  assert.equal(s.state, 'unauthenticated');
  assert.equal(s.authenticated, false);
  assert.equal(s.error, null);
});

// 2. contrôles audio absents avant session : le snapshot du gate n'expose rien métier
test('gate : snapshot ne contient aucun contrôle audio/token/password', () => {
  const g = createControlRoomGate({ sessionClient: fakeSessionClient() });
  const s = g.getSnapshot();
  assert.deepEqual(Object.keys(s).sort(), ['authenticated', 'error', 'exp', 'state', 'updatedAt']);
});

// 3. aucun audioEngine créé avant session : structuralement, le gate page n'importe
//    pas le moteur audio ni livekit-client (chargement dynamique post-auth seulement).
test('gate : la page gate n importe pas statiquement audioEngine/livekit-client', () => {
  const src = readFileSync('src/control-room/controlRoomGatePage.js', 'utf8');
  // controlRoomPage.js (lourd, importe livekit-client) doit être un import
  // dynamique uniquement — jamais un import statique `from './controlRoomPage.js'`.
  assert.ok(!/^\s*import\s+.*\sfrom\s+['"]\.\/controlRoomPage\.js['"]/m.test(src),
    'controlRoomPage est un import dynamique, pas statique');
  // Aucun import statique du SDK lourd ni du moteur audio avant la session.
  // (Les commentaires qui citent livekit-client sont OK ; on cible les import.)
  assert.ok(!/^\s*import\s+.*from\s+['"][^'"]*livekit-client['"]/m.test(src),
    'aucun import statique livekit-client dans le gate page');
  assert.ok(!/^\s*import\s+.*audioEngine/m.test(src),
    'aucun import statique audioEngine dans le gate page');
});

// 4. aucun import LiveKit lourd avant session : le chunk gate (build) est léger
//    (vérifié par le build : controlRoomGatePage-*.js ~16 ko sans livekit-client ;
//    controlRoomPage-*.js ~529 ko chargé dynamiquement). Test structural ci-dessus.

// 5. bon login monte l état authenticated
test('gate : login bon mot de passe -> authenticated', async () => {
  const sc = fakeSessionClient({ loginOk: true });
  const g = createControlRoomGate({ sessionClient: sc });
  const r = await g.login('secret');
  assert.equal(r.ok, true);
  assert.equal(g.getSnapshot().state, 'authenticated');
  assert.equal(sc._calls.login.length, 1);
  assert.equal(sc._calls.login[0], 'secret');
});

// 6. mauvais login affiche erreur (état error)
test('gate : login mauvais mot de passe -> error + message', async () => {
  const g = createControlRoomGate({ sessionClient: fakeSessionClient({ loginOk: false }) });
  const r = await g.login('bad');
  assert.equal(r.ok, false);
  assert.equal(g.getSnapshot().state, 'error');
  assert.equal(g.getSnapshot().error, 'Mot de passe incorrect.');
});

// 7. mot de passe vidé après requête (jamais dans le snapshot)
test('gate : le mot de passe n est jamais dans le snapshot', async () => {
  const g = createControlRoomGate({ sessionClient: fakeSessionClient() });
  await g.login('topsecret');
  const s = g.getSnapshot();
  assert.equal('password' in s, false);
  assert.ok(!JSON.stringify(s).includes('topsecret'));
});

// 8. logout détruit la session -> unauthenticated
test('gate : logout -> unauthenticated', async () => {
  const sc = fakeSessionClient();
  const g = createControlRoomGate({ sessionClient: sc });
  await g.login('pw');
  await g.logout();
  assert.equal(g.getSnapshot().state, 'unauthenticated');
  assert.equal(sc._calls.logout, 1);
});

// 9. expiration revient au login (reset avec message)
test('gate : reset(reason) -> unauthenticated + message Session expirée', () => {
  const g = createControlRoomGate({ sessionClient: fakeSessionClient() });
  g.reset('Session expirée.');
  assert.equal(g.getSnapshot().state, 'unauthenticated');
  assert.equal(g.getSnapshot().error, 'Session expirée.');
});

// 10. rechargement pendant session : checkSession authenticated -> accès conservé
test('gate : checkSession authenticated -> authenticated (rechargement)', async () => {
  const g = createControlRoomGate({ sessionClient: fakeSessionClient({ authed: true, exp: T0 + 1000 }) });
  const r = await g.checkSession();
  assert.equal(r.authenticated, true);
  assert.equal(g.getSnapshot().state, 'authenticated');
});

test('gate : checkSession non authenticated -> unauthenticated', async () => {
  const g = createControlRoomGate({ sessionClient: fakeSessionClient({ authed: false }) });
  await g.checkSession();
  assert.equal(g.getSnapshot().state, 'unauthenticated');
});

test('gate : subscriber notifié au login', async () => {
  const g = createControlRoomGate({ sessionClient: fakeSessionClient() });
  const seen = [];
  g.subscribe((s) => seen.push(s.state));
  await g.login('pw');
  assert.ok(seen.includes('authenticating'));
  assert.ok(seen.includes('authenticated'));
});

// --- Vue login (écran d accès) ---
test('gateView : buildLoginDOM crée titre + champ password + bouton ENTRER', () => {
  const doc = fakeDocument();
  const { els } = buildLoginDOM(doc, null);
  assert.equal(els.title.textContent, 'CONTROL ROOM');
  assert.equal(els.enter.textContent, 'ENTRER');
  assert.equal(els.password.type, 'password');
});

test('gateView : renderLogin affiche erreur + bouton CONNEXION… en authenticating', () => {
  const doc = fakeDocument();
  const { els } = buildLoginDOM(doc, null);
  renderLogin({ state: 'authenticating', error: null }, els);
  assert.equal(els.enter.textContent, 'CONNEXION…');
  assert.equal(els.enter.disabled, true);
  renderLogin({ state: 'error', error: 'Mot de passe incorrect.' }, els);
  assert.equal(els.error.textContent, 'Mot de passe incorrect.');
});

test('gateView : wireLogin appelle onLogin(password) puis vide l input', () => {
  const doc = fakeDocument();
  const { els } = buildLoginDOM(doc, null);
  let received = null;
  wireLogin({ els, onLogin: (pw) => { received = pw; } });
  els.password.value = 'secret';
  els.form._fire('submit');
  assert.equal(received, 'secret');
  assert.equal(els.password.value, '', 'mot de passe vidé après envoi');
});

// ================= Tests enceinte listener (§19, 16) =================

function fakeTimer() {
  let q = [];
  return {
    setTimeout(cb) { q.push(cb); return q.length; },
    clearTimeout() { q = []; },
    _flush() { const c = q.splice(0); c.forEach((cb) => cb()); },
    _pending() { return q.length > 0; },
  };
}

// 1. icône volume actif 🔊
test('enceinte : icône 🔊 volume actif', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: false, attenuationActive: false, hasAudioTrack: true }, els);
  assert.equal(els.speaker.textContent, '🔊');
});

// 2. icône mute 🔇
test('enceinte : icône 🔇 quand mute', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: true, attenuationActive: false, hasAudioTrack: true }, els);
  assert.equal(els.speaker.textContent, '🔇');
});

// 3. clic simple mute (engine)
test('enceinte : setMuted(true) -> muted + sink muted true', () => {
  const sink = makeFakeAudioSink();
  const l = makeListener({ audioSink: sink });
  l.setMuted(true);
  assert.equal(l.getSnapshot().muted, true);
  assert.equal(sink._calls.muted[sink._calls.muted.length - 1], true);
  l.destroy();
});

// 4. second clic unmute
test('enceinte : setMuted(false) -> unmute', () => {
  const l = makeListener();
  l.setMuted(true); l.setMuted(false);
  assert.equal(l.getSnapshot().muted, false);
  l.destroy();
});

// 5. double-clic active -20 dB (engine)
test('enceinte : toggleAttenuation -> attenuationActive + attenuationDb -20', () => {
  const l = makeListener();
  l.toggleAttenuation();
  const s = l.getSnapshot();
  assert.equal(s.attenuationActive, true);
  assert.equal(s.attenuationDb, -20);
  l.destroy();
});

// 6. double-clic ne déclenche pas mute (discriminateur)
test('enceinte : double-clic -> onDouble seulement (pas onSingle)', () => {
  const t = fakeTimer();
  let single = 0, dbl = 0;
  const disc = createClickDiscriminator({ onSingle: () => { single++; }, onDouble: () => { dbl++; } }, t);
  disc.click();      // programme l'action simple (non exécutée)
  assert.ok(t._pending());
  disc.dblclick();  // annule l'action simple + déclenche l'atténuation
  assert.equal(single, 0);
  assert.equal(dbl, 1);
  assert.ok(!t._pending());
});

test('enceinte : clic simple (sans dblclick) -> onSingle après délai', () => {
  const t = fakeTimer();
  let single = 0;
  const disc = createClickDiscriminator({ onSingle: () => { single++; }, onDouble: () => {} }, t);
  disc.click();
  assert.equal(single, 0);
  t._flush();
  assert.equal(single, 1);
});

// 7. nouveau double-clic restaure
test('enceinte : second toggleAttenuation -> restaure attenuationActive false', () => {
  const l = makeListener();
  l.toggleAttenuation();
  l.toggleAttenuation();
  assert.equal(l.getSnapshot().attenuationActive, false);
  assert.equal(l.getSnapshot().attenuationDb, 0);
  l.destroy();
});

// 8. effectiveVolume = userVolume × 0.1
test('enceinte : effectiveVolume = volume × 0.1 quand attenué', () => {
  const sink = makeFakeAudioSink();
  const l = makeListener({ audioSink: sink });
  l.setVolume(0.6);
  l.setAttenuation(true);
  assert.equal(l.getSnapshot().effectiveVolume, 0.6 * ATTENUATION_GAIN);
  assert.equal(sink._calls.volume[sink._calls.volume.length - 1], 0.6 * ATTENUATION_GAIN);
  l.destroy();
});

// 9. slider inchangé pendant atténuation (snapshot.volume reste le volume utilisateur)
test('enceinte : slider (snapshot.volume) inchangé pendant atténuation', () => {
  const l = makeListener();
  l.setVolume(0.6);
  l.setAttenuation(true);
  assert.equal(l.getSnapshot().volume, 0.6);
  l.destroy();
});

// 10. changement slider pendant atténuation recalcule effectiveVolume
test('enceinte : setVolume pendant atténuation recalcule effectiveVolume', () => {
  const sink = makeFakeAudioSink();
  const l = makeListener({ audioSink: sink });
  l.setAttenuation(true);
  l.setVolume(0.5);
  assert.equal(l.getSnapshot().effectiveVolume, 0.5 * ATTENUATION_GAIN);
  l.destroy();
});

// 11. mute prioritaire sur atténuation (effectiveVolume 0)
test('enceinte : mute prioritaire sur atténuation -> effectiveVolume 0', () => {
  const sink = makeFakeAudioSink();
  const l = makeListener({ audioSink: sink });
  l.setVolume(0.6);
  l.setAttenuation(true);
  l.setMuted(true);
  assert.equal(l.getSnapshot().effectiveVolume, 0);
  assert.equal(sink._calls.volume[sink._calls.volume.length - 1], 0);
  l.destroy();
});

// 12. unmute restaure le volume effectif atténué
test('enceinte : unmute restaure le volume effectif atténué', () => {
  const sink = makeFakeAudioSink();
  const l = makeListener({ audioSink: sink });
  l.setVolume(0.6);
  l.setAttenuation(true);
  l.setMuted(true);
  l.setMuted(false);
  assert.equal(l.getSnapshot().effectiveVolume, 0.6 * ATTENUATION_GAIN);
  l.destroy();
});

// 13. indication -20 dB visible (badge + label) uniquement si actif
test('enceinte : badge -20 dB + label "60% · −20 dB" visibles si actif', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.6, muted: false, attenuationActive: false, hasAudioTrack: true }, els);
  assert.equal(els.attenBadge.hidden, true);
  assert.equal(els.volumeLabel.textContent, '60%');
  renderListenerState({ state: 'playing', volume: 0.6, muted: false, attenuationActive: true, hasAudioTrack: true }, els);
  assert.equal(els.attenBadge.hidden, false);
  assert.equal(els.volumeLabel.textContent, '60% · −20 dB');
});

// 14. aria-label correct (speaker + bouton -20 dB)
test('enceinte : aria-label speaker Couper/Réactiver + attenBtn aria-pressed', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: false, attenuationActive: false, hasAudioTrack: true }, els);
  assert.equal(els.speaker.getAttribute('aria-label'), 'Couper le son');
  assert.equal(els.attenBtn.getAttribute('aria-pressed'), 'false');
  renderListenerState({ state: 'playing', volume: 0.8, muted: true, attenuationActive: true, hasAudioTrack: true }, els);
  assert.equal(els.speaker.getAttribute('aria-label'), 'Réactiver le son');
  assert.equal(els.attenBtn.getAttribute('aria-pressed'), 'true');
});

// 15. clavier fonctionne (vrai <button> focusable ; Entrée/Espace -> clic -> mute)
test('enceinte : speaker et attenBtn sont des <button> (clavier utilisable)', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  assert.equal(els.speaker.tagName, 'BUTTON');
  assert.equal(els.attenBtn.tagName, 'BUTTON');
  // Le clic speaker déclenche onMuteToggle via le discriminateur.
  let muted = false;
  wireListenerControls({ els, onMuteToggle: () => { muted = !muted; }, onAttenuationToggle: () => {} });
  els.speaker._fire('click'); // simule Enter/Espace -> click
});

// 16. fallback tactile accessible (bouton -20 dB visible quand piste présente)
test('enceinte : bouton -20 dB visible (fallback clavier/tactile) quand piste', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: false, attenuationActive: false, hasAudioTrack: true }, els);
  assert.equal(els.attenBtn.hidden, false);
  let toggled = false;
  wireListenerControls({ els, onMuteToggle: () => {}, onAttenuationToggle: () => { toggled = true; } });
  els.attenBtn._fire('click');
  assert.equal(toggled, true);
});

test('enceinte : ATTENUATION_GAIN = 10^(-20/20) = 0.1', () => {
  assert.equal(ATTENUATION_GAIN, 0.1);
  assert.equal(ATTENUATION_DB, -20);
});

// ================= Tests multi-listener — Lot 4F.2 (race piste déjà publiée) ====

// 1. 2e listener : performer déjà en train de publier, AUCUN TrackSubscribed
//    -> la piste déjà présente doit être rattachée (fix attachExistingAudioTracks).
test('listener4F2 : 2e listener, performer déjà publié, pas de TrackSubscribed -> piste rattachée', async () => {
  const sink = makeFakeAudioSink();
  const RoomClass = makeFakeListenerRoomWithExistingTrack({ emitSubscribed: false });
  const l = makeListener({ RoomClass, audioSink: sink });
  const snap = await l.connect();
  assert.equal(snap.roomName, 'main');
  assert.equal(snap.hasAudioTrack, true, 'piste déjà publiée rattachée');
  assert.equal(snap.audioTrackSid, 'tr-perf');
  assert.equal(snap.performerIdentity, 'performer-A');
  assert.equal(sink._calls.attach.length, 1);
  await flush();
  assert.equal(l.getSnapshot().state, 'playing');
  l.destroy();
});

// 2. Idempotence : un TrackSubscribed arrive APRÈS connect (isConnected true)
//    alors que la piste a déjà été rattachée -> pas de double attach.
test('listener4F2 : TrackSubscribed tardif + piste existante -> pas de double rattachement', async () => {
  const sink = makeFakeAudioSink();
  const RoomClass = makeFakeListenerRoomWithExistingTrack({ emitSubscribed: true });
  const l = makeListener({ RoomClass, audioSink: sink });
  await l.connect();
  await flush();
  const s = l.getSnapshot();
  assert.equal(s.hasAudioTrack, true);
  assert.equal(s.audioTrackSid, 'tr-perf');
  assert.equal(s.performerIdentity, 'performer-A');
  assert.equal(sink._calls.attach.length, 1, 'attachTrack appelé une seule fois');
  assert.equal(s.state, 'playing');
  l.destroy();
});

// 3. Participant déjà présent AVANT connect : le compteur reflète désormais
//    remoteParticipants (hotfix D) -> participantCount=1 (et piste rattachée).
//    Avant le hotfix, le compteur restait à 0 (ParticipantConnected ne se
//    déclenche pas pour les participants déjà présents) -> diagnostic trompeur.
test('listener4F2 : participant déjà présent -> participants=1 (hotfix D) + piste rattachée', async () => {
  const RoomClass = makeFakeListenerRoomWithExistingTrack({});
  const l = makeListener({ RoomClass });
  const snap = await l.connect();
  assert.equal(snap.participantCount, 1, 'participantCount reflète remoteParticipants existants');
  assert.equal(snap.hasAudioTrack, true);
  l.destroy();
});

// 4. Aucune piste déjà présente -> comportement inchangé (waiting_for_track).
test('listener4F2 : aucun participant -> waiting_for_track (inchangé)', async () => {
  const RoomClass = makeFakeListenerRoomClass();
  const l = makeListener({ RoomClass });
  const snap = await l.connect();
  assert.equal(snap.hasAudioTrack, false);
  assert.equal(snap.state, 'waiting_for_track');
  l.destroy();
});

// ================= Tests hotfix multi-listener / iOS (réconciliation + iOS) ====

// Fake timer pour tester le retry borné sans attendre réellement.
function fakeListenerTimer() {
  const jobs = [];
  let nextId = 1;
  return {
    setTimeout(cb) { const id = nextId++; jobs.push({ id, cb }); return id; },
    clearTimeout(id) { const i = jobs.findIndex((j) => j.id === id); if (i >= 0) jobs.splice(i, 1); },
    _flush() { const all = jobs.splice(0); all.forEach((j) => j.cb()); },
    _count() { return jobs.length; },
  };
}

// Fake Room qui émet TrackSubscribed PENDANT connect() (avant résolution), pour
// tester le garde du hotfix A : à cet instant isConnected est encore false, la
// piste ne doit PAS être perdue.
function makeFakeListenerRoomEmitDuringConnect({
  trackName = 'program-audio', participantIdentity = 'performer-A', trackSid = 'tr-perf',
  withStartAudio = false,
} = {}) {
  const track = { kind: 'audio', name: trackName, sid: trackSid, source: 'microphone' };
  class FakeRoom {
    constructor(opts) {
      this.opts = opts; this._connected = false; this._listeners = {};
      this.remoteParticipants = new Map();
      this.startAudioCalled = false;
      if (withStartAudio) this.startAudio = async () => { this.startAudioCalled = true; };
      FakeRoom.lastInstance = this;
    }
    on(ev, cb) { (this._listeners[ev] = this._listeners[ev] || []).push(cb); }
    off(ev) { delete this._listeners[ev]; }
    removeAllListeners() { this._listeners = {}; }
    _emit(ev, ...args) { (this._listeners[ev] || []).forEach((cb) => cb(...args)); }
    async connect() {
      // Émet TrackSubscribed PENDANT connect() (avant résolution).
      this._emit('trackSubscribed', track, { kind: 'audio', name: trackName, trackSid, track }, { identity: participantIdentity });
      this._connected = true;
    }
    async disconnect() { this._disconnected = true; this._connected = false; }
  }
  FakeRoom.lastInstance = null;
  return FakeRoom;
}

// Fake Room avec une publication audio SOUSCRITE (track présent immédiatement),
// remoteParticipants peuplé (pour participantCount) ; pub.setSubscribed dispo.
function makeFakeListenerRoomSubscribedPub({
  trackName = 'program-audio', participantIdentity = 'performer-A', trackSid = 'tr-perf',
  withStartAudio = false,
} = {}) {
  const track = { kind: 'audio', name: trackName, sid: trackSid, source: 'microphone' };
  const pub = {
    kind: 'audio', name: trackName, trackSid, track,
    _setSubscribedCalls: 0, setSubscribed(v) { this._setSubscribedCalls++; this._subscribed = !!v; },
  };
  class FakeRoom {
    constructor(opts) {
      this.opts = opts; this._connected = false; this._listeners = {};
      const p = { identity: participantIdentity, trackPublications: new Map([[trackSid, pub]]) };
      this.remoteParticipants = new Map([[participantIdentity, p]]);
      this.startAudioCalled = false;
      if (withStartAudio) this.startAudio = async () => { this.startAudioCalled = true; };
      FakeRoom.lastInstance = this;
    }
    on(ev, cb) { (this._listeners[ev] = this._listeners[ev] || []).push(cb); }
    off(ev) { delete this._listeners[ev]; }
    removeAllListeners() { this._listeners = {}; }
    _emit(ev, ...args) { (this._listeners[ev] || []).forEach((cb) => cb(...args)); }
    async connect() { this._connected = true; }
    async disconnect() { this._disconnected = true; this._connected = false; }
  }
  FakeRoom.lastInstance = null;
  FakeRoom.pub = pub;
  return FakeRoom;
}

// Fake Room avec une publication audio NON souscrite (track === null au
// départ). pub.track ne devient la piste qu'après setSubscribed(true). Permet
// de tester la souscription explicite (hotfix B) puis l'attache différée.
function makeFakeListenerRoomUnsubscribedPub({
  trackName = 'program-audio', participantIdentity = 'performer-A', trackSid = 'tr-perf',
  withStartAudio = false,
} = {}) {
  const track = { kind: 'audio', name: trackName, sid: trackSid, source: 'microphone' };
  let subscribed = false;
  const pub = {
    kind: 'audio', name: trackName, trackSid,
    get track() { return subscribed ? track : null; },
    _setSubscribedCalls: 0, setSubscribed(v) { this._setSubscribedCalls++; subscribed = !!v; },
  };
  class FakeRoom {
    constructor(opts) {
      this.opts = opts; this._connected = false; this._listeners = {};
      const p = { identity: participantIdentity, trackPublications: new Map([[trackSid, pub]]) };
      this.remoteParticipants = new Map([[participantIdentity, p]]);
      this.startAudioCalled = false;
      if (withStartAudio) this.startAudio = async () => { this.startAudioCalled = true; };
      FakeRoom.lastInstance = this;
    }
    on(ev, cb) { (this._listeners[ev] = this._listeners[ev] || []).push(cb); }
    off(ev) { delete this._listeners[ev]; }
    removeAllListeners() { this._listeners = {}; }
    _emit(ev, ...args) { (this._listeners[ev] || []).forEach((cb) => cb(...args)); }
    async connect() { this._connected = true; }
    async disconnect() { this._disconnected = true; this._connected = false; }
  }
  FakeRoom.lastInstance = null;
  FakeRoom.pub = pub;
  FakeRoom.track = track;
  return FakeRoom;
}

// scanRemoteAudio (pur) — 1. room vide -> listes vides
test('hotfix scanRemoteAudio : room vide -> listes vides', () => {
  assert.deepEqual(scanRemoteAudio(null), { participants: [], audioPubs: [] });
  assert.deepEqual(scanRemoteAudio({ remoteParticipants: new Map() }), { participants: [], audioPubs: [] });
});

// 2. scanRemoteAudio : 1 participant + 1 pub audio (Map)
test('hotfix scanRemoteAudio : 1 participant + 1 pub audio via Map', () => {
  const pub = { kind: 'audio', name: 'program-audio' };
  const p = { identity: 'perf', trackPublications: new Map([['t1', pub]]) };
  const room = { remoteParticipants: new Map([['perf', p]]) };
  const r = scanRemoteAudio(room);
  assert.equal(r.participants.length, 1);
  assert.equal(r.audioPubs.length, 1);
  assert.equal(r.audioPubs[0].pub, pub);
});

// 3. scanRemoteAudio : ignore la vidéo et les pubs non-audio
test('hotfix scanRemoteAudio : ignore vidéo et pubs non-audio', () => {
  const p = { identity: 'perf', trackPublications: new Map([
    ['a', { kind: 'audio', name: 'program-audio' }],
    ['v', { kind: 'video', name: 'cam' }],
  ]) };
  const room = { remoteParticipants: new Map([['perf', p]]) };
  const r = scanRemoteAudio(room);
  assert.equal(r.audioPubs.length, 1);
  assert.equal(r.audioPubs[0].pub.kind, 'audio');
});

// 4. scanRemoteAudio : objet plat (tests) au lieu de Map
test('hotfix scanRemoteAudio : objet plat au lieu de Map', () => {
  const p = { identity: 'perf', trackPublications: { t1: { kind: 'audio', name: 'program-audio' } } };
  const room = { remoteParticipants: { perf: p } };
  const r = scanRemoteAudio(room);
  assert.equal(r.participants.length, 1);
  assert.equal(r.audioPubs.length, 1);
});

// F.1. TrackSubscribed émis PENDANT connect() (avant résolution) -> piste conservée.
test('hotfix : TrackSubscribed pendant connect() (isConnected false) -> piste conservée', async () => {
  const sink = makeFakeAudioSink();
  const RoomClass = makeFakeListenerRoomEmitDuringConnect({});
  const l = makeListener({ RoomClass, audioSink: sink, retryDelays: [] });
  const snap = await l.connect();
  assert.equal(snap.hasAudioTrack, true, 'piste émise pendant connect() conservée (garde !room)');
  assert.equal(snap.audioTrackSid, 'tr-perf');
  assert.equal(sink._calls.attach.length, 1);
  await flush();
  assert.equal(l.getSnapshot().state, 'playing');
  l.destroy();
});

// F.2. Participant déjà présent avant connect -> participantCount=1 (hotfix D).
test('hotfix : participant déjà présent avant connect -> participantCount=1', async () => {
  const RoomClass = makeFakeListenerRoomSubscribedPub({});
  const l = makeListener({ RoomClass, retryDelays: [] });
  const snap = await l.connect();
  assert.equal(snap.participantCount, 1);
  assert.equal(snap.existingParticipants, 1);
  l.destroy();
});

// F.3. Publication audio présente avec track immédiat -> lecture.
test('hotfix : pub audio avec track immédiat -> rattachée + lecture', async () => {
  const sink = makeFakeAudioSink();
  const RoomClass = makeFakeListenerRoomSubscribedPub({});
  const l = makeListener({ RoomClass, audioSink: sink, retryDelays: [] });
  const snap = await l.connect();
  assert.equal(snap.hasAudioTrack, true);
  assert.equal(snap.audioTrackSid, 'tr-perf');
  assert.equal(snap.lastTrackEvent, 'subscribed');
  await flush();
  assert.equal(l.getSnapshot().state, 'playing');
  l.destroy();
});

// F.4. Publication audio présente avec track=null -> setSubscribed(true) appelé.
test('hotfix : pub audio track=null -> setSubscribed(true) demandé, pas d attach', async () => {
  const sink = makeFakeAudioSink();
  const RoomClass = makeFakeListenerRoomUnsubscribedPub({});
  const l = makeListener({ RoomClass, audioSink: sink, retryDelays: [] });
  const snap = await l.connect();
  assert.equal(snap.hasAudioTrack, false, 'pas de piste tant que non souscrite');
  assert.equal(RoomClass.pub._setSubscribedCalls, 1, 'setSubscribed(true) demandé une fois');
  assert.equal(snap.subscribedAudioPublications, 1);
  assert.equal(snap.state, 'waiting_for_track');
  l.destroy();
});

// F.5. TrackSubscribed arrive après réconciliation (souscription effective) -> lecture.
test('hotfix : TrackSubscribed après reconciliation -> lecture', async () => {
  const sink = makeFakeAudioSink();
  const RoomClass = makeFakeListenerRoomUnsubscribedPub({});
  const l = makeListener({ RoomClass, audioSink: sink, retryDelays: [] });
  await l.connect();
  // La souscription demandée a déclenché setSubscribed(true) ; on simule
  // l'arrivée effective de la piste via TrackSubscribed.
  RoomClass.lastInstance._emit('trackSubscribed', RoomClass.track, RoomClass.pub, { identity: 'performer-A' });
  await flush();
  const s = l.getSnapshot();
  assert.equal(s.hasAudioTrack, true);
  assert.equal(s.audioTrackSid, 'tr-perf');
  assert.equal(s.state, 'playing');
  l.destroy();
});

// F.4b. setSubscribed n'est pas rappelé (anti-spam) si une 2e réconciliation tourne.
test('hotfix : setSubscribed non rappelé sur 2e reconciliation (anti-spam)', async () => {
  const RoomClass = makeFakeListenerRoomUnsubscribedPub({});
  const l = makeListener({ RoomClass, retryDelays: [] });
  await l.connect();
  // Forcer une 2e réconciliation via ParticipantConnected.
  RoomClass.lastInstance._emit('participantConnected');
  await flush();
  assert.equal(RoomClass.pub._setSubscribedCalls, 1, 'setSubscribed appelé une seule fois');
  l.destroy();
});

// F.6. Deux listeners rejoignent successivement : les deux obtiennent program-audio.
test('hotfix : 2 listeners successifs -> les 2 obtiennent program-audio', async () => {
  const sink1 = makeFakeAudioSink();
  const sink2 = makeFakeAudioSink();
  const l1 = makeListener({ RoomClass: makeFakeListenerRoomSubscribedPub({ trackSid: 'tr-perf' }), audioSink: sink1, retryDelays: [] });
  const l2 = makeListener({ RoomClass: makeFakeListenerRoomSubscribedPub({ trackSid: 'tr-perf' }), audioSink: sink2, retryDelays: [] });
  const s1 = await l1.connect();
  const s2 = await l2.connect();
  assert.equal(s1.hasAudioTrack, true, 'listener 1 a program-audio');
  assert.equal(s2.hasAudioTrack, true, 'listener 2 a program-audio');
  assert.equal(sink1._calls.attach.length, 1);
  assert.equal(sink2._calls.attach.length, 1);
  await l1.destroy();
  await l2.destroy();
});

// F.7. Reconnected -> reconciliation relancée (reconciliationCount augmente).
test('hotfix : Reconnected -> reconciliation relancée', async () => {
  const RoomClass = makeFakeListenerRoomSubscribedPub({});
  const l = makeListener({ RoomClass, retryDelays: [] });
  await l.connect();
  const before = l.getSnapshot().reconciliationCount;
  RoomClass.lastInstance._emit('reconnecting');
  assert.equal(l.getSnapshot().state, 'reconnecting');
  RoomClass.lastInstance._emit('reconnected');
  const after = l.getSnapshot().reconciliationCount;
  assert.ok(after > before, 'reconciliation relancée après Reconnected');
  l.destroy();
});

// F.8. Pas de double attach : reconcile + TrackSubscribed tardif -> 1 attach.
test('hotfix : pas de double attach (reconcile + TrackSubscribed tardif)', async () => {
  const sink = makeFakeAudioSink();
  const RoomClass = makeFakeListenerRoomSubscribedPub({});
  const l = makeListener({ RoomClass, audioSink: sink, retryDelays: [] });
  await l.connect();
  // TrackSubscribed tardif pour la même piste -> ignoré (idempotent).
  RoomClass.lastInstance._emit('trackSubscribed', RoomClass.pub.track, RoomClass.pub, { identity: 'performer-A' });
  await flush();
  assert.equal(sink._calls.attach.length, 1, 'attachTrack appelé une seule fois');
  l.destroy();
});

// F.9. iOS simulé : room.startAudio() appelé sur le geste utilisateur (connect).
test('hotfix iOS : room.startAudio() appelé dans le geste (connect)', async () => {
  const RoomClass = makeFakeListenerRoomSubscribedPub({ withStartAudio: true });
  const l = makeListener({ RoomClass, retryDelays: [] });
  const snap = await l.connect();
  assert.equal(RoomClass.lastInstance.startAudioCalled, true, 'room.startAudio() appelé au connect');
  assert.equal(snap.audioUnlocked, true);
  assert.equal(snap.roomCanPlaybackAudio, true);
  l.destroy();
});

// F.10. Autoplay refusé -> waiting_for_user + bouton ACTIVER LE SON visible.
test('hotfix iOS : autoplay refusé -> waiting_for_user + bouton ACTIVER LE SON', async () => {
  const sink = makeFakeAudioSink({ playMode: 'NotAllowed' });
  const RoomClass = makeFakeListenerRoomSubscribedPub({ withStartAudio: true });
  const l = makeListener({ RoomClass, audioSink: sink, retryDelays: [] });
  await l.connect();
  await flush();
  const s = l.getSnapshot();
  assert.equal(s.state, 'waiting_for_user');
  assert.equal(s.autoplayBlocked, true);
  // Rendu UI : bouton ACTIVER LE SON visible, primary masqué.
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState(s, els);
  assert.equal(els.activate.hidden, false, 'ACTIVER LE SON visible');
  assert.equal(els.primary.hidden, true, 'primary masqué quand ACTIVER LE SON visible');
  l.destroy();
});

// F.11. Second geste (ACTIVER LE SON) : room.startAudio() + audioSink.play() -> playing.
test('hotfix iOS : 2e geste -> room.startAudio + play -> playing', async () => {
  const sink = makeFakeAudioSink({ playMode: 'NotAllowed' });
  const RoomClass = makeFakeListenerRoomSubscribedPub({ withStartAudio: true });
  const l = makeListener({ RoomClass, audioSink: sink, retryDelays: [] });
  await l.connect();
  await flush();
  assert.equal(l.getSnapshot().state, 'waiting_for_user');
  // Second geste utilisateur : on autorise maintenant la lecture.
  sink._setPlayMode(null);
  await l.startAudio();
  const s = l.getSnapshot();
  assert.equal(s.state, 'playing', 'lecture démarrée au 2e geste');
  assert.equal(s.autoplayBlocked, false);
  l.destroy();
});

// F.12. participantCount reflète les remoteParticipants existants après un
// ParticipantConnected (recompté, pas seulement incrémenté).
test('hotfix : participantCount recompté depuis remoteParticipants après ParticipantConnected', async () => {
  const RoomClass = makeFakeListenerRoomSubscribedPub({});
  const l = makeListener({ RoomClass, retryDelays: [] });
  await l.connect();
  assert.equal(l.getSnapshot().participantCount, 1);
  // Ajout d'un 2e participant distant.
  RoomClass.lastInstance.remoteParticipants.set('performer-B', { identity: 'performer-B', trackPublications: new Map() });
  RoomClass.lastInstance._emit('participantConnected');
  await flush();
  assert.equal(l.getSnapshot().participantCount, 2);
  l.destroy();
});

// F.13. Retry borné : 3 timers programmés (100/300/750ms), flush -> réconciliations.
test('hotfix retry : 3 timers programmés puis déclenchés (borné, pas de polling infini)', async () => {
  const timer = fakeListenerTimer();
  const RoomClass = makeFakeListenerRoomSubscribedPub({});
  const l = makeListener({ RoomClass, audioSink: makeFakeAudioSink(), retryDelays: DEFAULT_RETRY_DELAYS, timerImpl: timer });
  await l.connect();
  assert.equal(timer._count(), 3, '3 timers programmés (100/300/750)');
  const before = l.getSnapshot().reconciliationCount;
  timer._flush();
  const after = l.getSnapshot().reconciliationCount;
  assert.ok(after > before, 'réconciliations déclenchées par le retry');
  assert.equal(timer._count(), 0, 'plus aucun timer en attente après flush');
  l.destroy();
});

// F.14. TrackPublished après connect -> reconciliation relancée (souscription
//      demandée / piste rattachée). lastTrackPublishedAt est horodaté.
test('hotfix : TrackPublished après connect -> reconciliation relancée', async () => {
  const RoomClass = makeFakeListenerRoomUnsubscribedPub({});
  const l = makeListener({ RoomClass, audioSink: makeFakeAudioSink(), retryDelays: [] });
  await l.connect();
  assert.equal(RoomClass.pub._setSubscribedCalls, 1);
  assert.equal(l.getSnapshot().lastTrackPublishedAt, null);
  RoomClass.lastInstance._emit('trackPublished', RoomClass.pub, { identity: 'performer-A' });
  await flush();
  const s = l.getSnapshot();
  assert.ok(typeof s.lastTrackPublishedAt === 'number', 'lastTrackPublishedAt horodaté');
  assert.equal(s.hasAudioTrack, true, 'piste rattachée via TrackPublished');
  // setSubscribed n'est pas rappelé (déjà demandé) -> toujours 1.
  assert.equal(RoomClass.pub._setSubscribedCalls, 1);
  l.destroy();
});

// F.15. Aucun secret dans le snapshot listener (hotfix : nouveaux champs diag).
test('hotfix : snapshot listener sans secret (audioUnlocked + diag, aucun token/password)', async () => {
  const RoomClass = makeFakeListenerRoomSubscribedPub({});
  const l = makeListener({ RoomClass, retryDelays: [] });
  const snap = await l.connect();
  const json = JSON.stringify(snap);
  assert.equal(snap.token, undefined);
  assert.equal(snap.password, undefined);
  assert.ok(!/token|password|apiKey|apiSecret|secret/i.test(json.replace(/lastError/g, '')));
  assert.equal(typeof snap.audioUnlocked, 'boolean');
  assert.equal(typeof snap.reconciliationCount, 'number');
  l.destroy();
});

// ============================================================
// Lot 4G — Statut de flux direct public + mini VU-mètre
// (src/state/streamStatus.js, src/control-room/streamPresencePublisher.js,
//  src/ui/streamStatusView.js)
// ============================================================
import {
  createStreamStatus, routeStreamControl,
  STREAM_HEADERS, STALE_MS, SIGNAL_THRESHOLD,
  STREAM_STATUS, STREAM_SIGNAL,
  clamp01, parseOnAir, parseTimestamp,
} from '../src/state/streamStatus.js';
import {
  createStreamPresencePublisher, DEFAULT_STREAM_THROTTLE_MS,
} from '../src/control-room/streamPresencePublisher.js';
import {
  buildStreamStatusDOM, renderStreamStatus,
  mountStreamCard, shouldMountStreamCard,
} from '../src/ui/streamStatusView.js';

// Faux emitter Collab-Hub : capture les publish(header, values).
function makeFakeStreamEmitter() {
  const calls = [];
  return {
    calls,
    publish(header, values) { calls.push({ header, values: Array.isArray(values) ? values.slice() : values }); },
  };
}
function meterOf(rms, peak) { return { rms, peak, db: rms > 0 ? 20 * Math.log10(rms) : -Infinity, clipping: false }; }

// Ingest un snapshot complet de flux en 4 headers (comme la Control Room publie).
function ingestStream(stream, { onAir, level, peak, updatedAt }, now) {
  stream.ingest('stream_onair', [onAir]);
  stream.ingest('stream_level', [level]);
  stream.ingest('stream_peak', [peak]);
  stream.ingest('stream_updated_at', [updatedAt]);
  if (now) { /* no-op : receivedAt déjà posé par ingest */ }
}

// 1. onair=1 + niveau haut -> EN DIRECT / présent
test('streamStatus : onair=1 + niveau haut -> EN DIRECT / présent', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  ingestStream(s, { onAir: 1, level: 0.5, peak: 0.8, updatedAt: 1000 });
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.LIVE);
  assert.equal(snap.signal, STREAM_SIGNAL.PRESENT);
  assert.equal(snap.signalPresent, true);
  assert.equal(snap.onAir, 1);
});

// 2. onair=1 + niveau bas -> EN DIRECT / silence
test('streamStatus : onair=1 + niveau bas -> EN DIRECT / silence', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  ingestStream(s, { onAir: 1, level: 0.001, peak: 0.002, updatedAt: 1000 });
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.LIVE);
  assert.equal(snap.signal, STREAM_SIGNAL.SILENT);
  assert.equal(snap.signalPresent, false);
});

// 3. onair=0 -> HORS ANTENNE
test('streamStatus : onair=0 (frais) -> HORS ANTENNE', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  ingestStream(s, { onAir: 0, level: 0, peak: 0, updatedAt: 1000 });
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.OFF_AIR);
  assert.equal(snap.signal, STREAM_SIGNAL.NONE);
  assert.equal(snap.fresh, true);
});

// 4. timestamp stale -> STATUT INDISPONIBLE (pas de faux EN DIRECT)
test('streamStatus : stale -> STATUT INDISPONIBLE (pas de faux EN DIRECT)', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  ingestStream(s, { onAir: 1, level: 0.5, peak: 0.8, updatedAt: 1000 });
  c.advance(STALE_MS + 500); // > 3 s sans mise à jour
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.UNAVAILABLE);
  assert.equal(snap.fresh, false);
  assert.equal(snap.signal, STREAM_SIGNAL.NONE);
});

// 5. payload invalide -> fallback sûr (INDISPONIBLE, niveau 0)
test('streamStatus : payload invalide -> fallback sûr', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  assert.equal(s.getSnapshot().computedStatus, STREAM_STATUS.UNAVAILABLE);
  // onair invalide -> on conserve null (fallback), pas de faux EN DIRECT
  s.ingest('stream_onair', ['maybe']);
  s.ingest('stream_level', ['not-a-number']);
  s.ingest('stream_peak', [null]);
  s.ingest('stream_updated_at', ['garbage']);
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.UNAVAILABLE);
  assert.equal(snap.level, 0);
  assert.equal(snap.peak, 0);
  assert.equal(snap.onAir, null);
});

// 6. meter borné 0..1 (clamp01 + publisher clamp)
test('streamStatus : clamp01 borne 0..1 (invalides -> 0, >1 -> 1)', () => {
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(2.5), 1);
  assert.equal(clamp01(-0.3), 0);
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01('abc'), 0);
});

// 7. throttle respecté (publisher)
test('publisher : throttle respecté (pas d envoi à chaque frame)', () => {
  const c = makeClock(1000);
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: c.now, throttleMs: 400, emitter: em });
  p.update({ onAir: true }, meterOf(0.5, 0.8));   // t=1000 : transition -> publish
  assert.equal(em.calls.length, 4);              // 4 headers publiés
  assert.equal(p.getDiagnostics().publishCount, 1);
  c.advance(100); p.update({ onAir: true }, meterOf(0.6, 0.9)); // t=1100 : throttle bloqué
  assert.equal(p.getDiagnostics().publishCount, 1);
  c.advance(300); p.update({ onAir: true }, meterOf(0.6, 0.9)); // t=1400 : due -> publish
  assert.equal(p.getDiagnostics().publishCount, 2);
  // onair publié = 1, level clampé
  const onairCalls = em.calls.filter((x) => x.header === 'stream_onair').map((x) => x.values[0]);
  assert.deepEqual(onairCalls, [1, 1]);
});

// 8. stop diffusion -> reset immédiat (onair=0, level=0, peak=0)
test('publisher : stop -> reset immédiat onair=0 level=0 peak=0', () => {
  const c = makeClock(1000);
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: c.now, throttleMs: 400, emitter: em });
  p.update({ onAir: true }, meterOf(0.5, 0.8));
  assert.equal(p.getDiagnostics().publishedOnAir, 1);
  p.stop();
  const d = p.getDiagnostics();
  assert.equal(d.publishedOnAir, 0);
  assert.equal(d.publishedLevel, 0);
  assert.equal(d.publishedPeak, 0);
  // dernière publication onair=0
  const lastOnair = em.calls.filter((x) => x.header === 'stream_onair').pop();
  assert.deepEqual(lastOnair.values, [0]);
});

// 8b. transition onair (start/stop) publiée immédiatement hors throttle
test('publisher : transition onair publiée immédiatement (hors throttle)', () => {
  const c = makeClock(1000);
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: c.now, throttleMs: 400, emitter: em });
  p.update({ onAir: false }, meterOf(0, 0));  // t=1000 : transition initiale -> onair=0
  assert.equal(p.getDiagnostics().publishCount, 1);
  c.advance(50); p.update({ onAir: true }, meterOf(0.5, 0.7)); // t=1050 : transition 0->1 immédiate
  assert.equal(p.getDiagnostics().publishCount, 2);
  assert.equal(p.getDiagnostics().publishedOnAir, 1);
});

// 8c. meter borné côté publisher (level/peak clampés même si meter > 1)
test('publisher : level/peak clampés 0..1 même si meter > 1', () => {
  const c = makeClock(1000);
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: c.now, throttleMs: 400, emitter: em });
  p.update({ onAir: true }, meterOf(2.5, 5.0));
  const level = em.calls.find((x) => x.header === 'stream_level').values[0];
  const peak = em.calls.find((x) => x.header === 'stream_peak').values[0];
  assert.equal(level, 1);
  assert.equal(peak, 1);
});

// 9. page publique réagit aux headers (routeStreamControl)
test('routeStreamControl : route les headers de flux, ignore les autres', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  // header de flux -> routé
  assert.equal(routeStreamControl({ header: 'stream_onair', values: [1] }, s), true);
  assert.equal(s.getSnapshot().onAir, 1);
  // header de contenu (non flux) -> non routé
  assert.equal(routeStreamControl({ header: 'sound_title', values: ['x'] }, s), false);
  // data invalide -> non routé
  assert.equal(routeStreamControl(null, s), false);
  assert.equal(routeStreamControl({ header: 'unknown', values: [1] }, s), false);
});

// 9b. routeStreamControl alimente un EN DIRECT cohérent
test('routeStreamControl : headers complets -> EN DIRECT / présent', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_onair', values: [1] }, s);
  routeStreamControl({ header: 'stream_level', values: [0.4] }, s);
  routeStreamControl({ header: 'stream_peak', values: [0.7] }, s);
  routeStreamControl({ header: 'stream_updated_at', values: [1000] }, s);
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.LIVE);
  assert.equal(snap.signalPresent, true);
  assert.equal(snap.peak, 0.7);
});

// 10. listener existant non régressé : bouton ÉCOUTER LE DIRECT inchangé,
//     titre de section changé (plus de doublon "DIRECT AUDIO"), DOM construit.
test('listener : bouton ÉCOUTER LE DIRECT inchangé + titre section ajusté (Lot 4G)', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  assert.equal(els.primary.textContent, 'ÉCOUTER LE DIRECT');
  // Le h2 de la section listener ne duplique plus "DIRECT AUDIO" (titre du bloc
  // de flux public). On ne dépend pas du texte exact, juste de l'absence du
  // doublon.
  const h2 = doc._created.find((e) => e.tagName === 'H2');
  assert.ok(h2, 'section listener a un titre');
  assert.notEqual(h2.textContent, 'DIRECT AUDIO');
});

// 11. aucun secret dans snapshots streamStatus + publisher diagnostics
test('streamStatus/publisher : aucun secret/token/password dans snapshots', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  ingestStream(s, { onAir: 1, level: 0.5, peak: 0.8, updatedAt: 1000 });
  const snap = s.getSnapshot();
  const snapJson = JSON.stringify(snap);
  assert.ok(!/token|password|apiKey|apiSecret|secret|cookie/i.test(snapJson));

  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: c.now, throttleMs: 400, emitter: em });
  p.update({ onAir: true }, meterOf(0.5, 0.8));
  const diag = p.getDiagnostics();
  const diagJson = JSON.stringify(diag);
  assert.ok(!/token|password|apiKey|apiSecret|secret|cookie/i.test(diagJson));
  assert.equal(typeof diag.publishCount, 'number');
  assert.equal(typeof diag.throttleMs, 'number');
});

// 12. reduced-motion propre : renderStreamStatus pose des largeurs (pas de
//     transition inline) + data-stream-status, sans dépendre d'une animation.
test('streamStatusView : rendu reduced-motion safe (largeurs + data-attr, pas de transition inline)', () => {
  const doc = fakeDocument();
  const { els } = buildStreamStatusDOM(doc, null);
  assert.ok(els.section, 'bloc flux construit');
  const snap = {
    computedStatus: STREAM_STATUS.LIVE, signal: STREAM_SIGNAL.PRESENT,
    level: 0.42, peak: 0.91, onAir: 1, ageMs: 100, fresh: true, signalPresent: true, updatedAt: 1000,
  };
  renderStreamStatus(snap, els);
  assert.equal(els.statusLabel.textContent, 'EN DIRECT');
  assert.equal(els.signalVal.textContent, 'présent');
  // largeurs posées via setAttribute('style', ...) — pas de transition inline.
  const barStyle = els.meterBar._attrs.style || '';
  assert.match(barStyle, /width:42%/);
  const peakStyle = els.meterPeak._attrs.style || '';
  assert.match(peakStyle, /left:91%/);
  assert.ok(!/transition/i.test(barStyle) && !/transition/i.test(peakStyle));
  // data-stream-status posé pour le styling (state-driven, pas animation)
  assert.equal(els.section._attrs['data-stream-status'], STREAM_STATUS.LIVE);
});

// 12b. rendu INDISPONIBLE par défaut (avant tout header reçu)
test('streamStatusView : INDISPONIBLE par défaut avant tout header', () => {
  const doc = fakeDocument();
  const { els } = buildStreamStatusDOM(doc, null);
  const s = createStreamStatus({ now: () => 1000 });
  renderStreamStatus(s.getSnapshot(), els);
  assert.equal(els.statusLabel.textContent, 'STATUT INDISPONIBLE');
  assert.equal(els.section._attrs['data-stream-status'], STREAM_STATUS.UNAVAILABLE);
  assert.match(els.meterBar._attrs.style, /width:0%/);
});

// 12c. constants stables (seuils documentés)
test('streamStatus : seuils et constantes stables', () => {
  assert.equal(STALE_MS, 3000);
  assert.equal(SIGNAL_THRESHOLD, 0.01);
  assert.deepEqual(STREAM_HEADERS, ['stream_onair', 'stream_level', 'stream_peak', 'stream_updated_at']);
  assert.equal(DEFAULT_STREAM_THROTTLE_MS, 400);
  assert.equal(parseOnAir(1), 1);
  assert.equal(parseOnAir('0'), 0);
  assert.equal(parseOnAir('maybe'), null);
  assert.equal(parseTimestamp(1000), 1000);
  assert.equal(parseTimestamp('2026-07-11T09:00:00Z') != null, true);
  assert.equal(parseTimestamp('garbage'), null);
});

// ============================================================
// Hotfix Lot 4G — Protocole Collab-Hub register/deliver
// (src/collabHub/publishClient.js). Prouve le cycle register/deliver :
// 1er publish d'un header = enregistrement (pas de push), publish subséquents =
// livraison. Reconnexion -> réenregistrement. File d'attente avant connexion.
// ============================================================
import { connectCollabHubPublisher } from '../src/collabHub/publishClient.js';

// Faux socket publication : capture les emit('control', ...) + pilote connect/disconnect.
function fakePublishSocket() {
  const handlers = {};
  const emitted = [];
  return {
    connected: false,
    id: 'sock-1',
    on(evt, fn) { handlers[evt] = fn; },
    emit(evt, payload) { emitted.push({ evt, ...(payload || {}) }); },
    disconnect() {},
    fire(evt) { if (handlers[evt]) handlers[evt](); },
    setConnected(c) { this.connected = c; },
    emitted,
  };
}

// Factory de publisher testable : socket fake, horloge injectable, setTimeout synchrone.
async function makeChPublisher({ headers, clock } = {}) {
  const sock = fakePublishSocket();
  const pub = await connectCollabHubPublisher({
    serverUrl: 'https://server.collab-hub.io',
    namespace: 'hub',
    username: 'test',
    headers,
    ioFactory: () => sock,
    now: clock ? clock.now : () => 1000,
    setTimeoutFn: (fn) => fn(), // synchrone -> flush déterministe après register
  });
  return { pub, sock };
}
function controls(sock, header) {
  return sock.emitted.filter((e) => e.evt === 'control' && e.header === header);
}

// H1. pas de deliver avant connexion (mise en file d'attente)
test('publishClient : aucun deliver avant connexion, valeur mise en file', async () => {
  const { pub, sock } = await makeChPublisher({});
  pub.publish('stream_onair', [1]);
  assert.equal(sock.emitted.length, 0, 'rien émis avant connexion');
  const d = pub.getDiagnostics();
  assert.equal(d.connected, false);
  assert.deepEqual(d.pendingHeaders, ['stream_onair']);
});

// H2. chaque header enregistré une seule fois à la connexion
test('publishClient : enregistre chaque header une fois à la connexion', async () => {
  const { pub, sock } = await makeChPublisher({});
  sock.setConnected(true); sock.fire('connect');
  const ctl = sock.emitted.filter((e) => e.evt === 'control');
  assert.equal(ctl.length, 4, '4 publish d enregistrement (un par header)');
  for (const h of STREAM_HEADERS) {
    assert.equal(controls(sock, h).length, 1, `${h} enregistré une fois`);
  }
  assert.deepEqual(pub.getDiagnostics().registeredHeaders.sort(), [...STREAM_HEADERS].sort());
});

// H3. register avant deliver (header non pré-enregistré)
test('publishClient : register avant deliver (1er publish enregistre puis livre)', async () => {
  const { pub, sock } = await makeChPublisher({ headers: ['stream_onair'] }); // 1 seul pré-enregistré
  sock.setConnected(true); sock.fire('connect'); // register stream_onair
  const before = sock.emitted.length;
  pub.publish('stream_level', [0.5]); // stream_level non enregistré -> register puis deliver
  const lvl = controls(sock, 'stream_level');
  assert.equal(lvl.length, 2, 'un register + un deliver');
  assert.deepEqual(lvl[0].values, [0], 'register avec valeur neutre (no push)');
  assert.deepEqual(lvl[1].values, [0.5], 'deliver avec la valeur publiée');
  assert.ok(pub.isRegistered('stream_level'));
  assert.equal(before + 2, sock.emitted.length);
});

// H4. première valeur livrée après enregistrement
test('publishClient : 1re valeur livrée après register (flush pending)', async () => {
  const { pub, sock } = await makeChPublisher({ headers: [] }); // aucun pré-enregistré
  sock.setConnected(true); sock.fire('connect');
  pub.publish('stream_onair', [1]);
  const onair = controls(sock, 'stream_onair');
  assert.equal(onair.length, 2);
  assert.deepEqual(onair[1].values, [1], 'la valeur livrée est bien [1]');
  assert.equal(pub.getDiagnostics().deliverCount >= 1, true);
});

// H5. mises à jour multiples ne réenregistrent pas
test('publishClient : updates multiples ne réenregistrent pas (idempotent)', async () => {
  const { pub, sock } = await makeChPublisher({});
  sock.setConnected(true); sock.fire('connect'); // 4 registers
  const registersAfterConnect = sock.emitted.length;
  pub.publish('stream_onair', [1]);
  pub.publish('stream_onair', [0.6]);
  pub.publish('stream_onair', [0.3]);
  const onair = controls(sock, 'stream_onair');
  assert.equal(onair.length, 4, '1 register + 3 delivers, pas de re-register');
  assert.deepEqual(onair.slice(1).map((e) => e.values), [[1], [0.6], [0.3]]);
  assert.equal(sock.emitted.length, registersAfterConnect + 3, 'aucun emit parasite');
});

// H6. reconnexion -> réenregistrement
test('publishClient : reconnexion réenregistre les headers', async () => {
  const { pub, sock } = await makeChPublisher({});
  sock.setConnected(true); sock.fire('connect');   // 4 registers
  sock.setConnected(false); sock.fire('disconnect');
  assert.equal(pub.getDiagnostics().connected, false);
  assert.equal(pub.getDiagnostics().registeredHeaders.length, 0, 'registered vidé au disconnect');
  sock.setConnected(true); sock.fire('connect');   // 4 nouveaux registers
  const ctl = sock.emitted.filter((e) => e.evt === 'control');
  assert.equal(ctl.length, 8, '4 + 4 registers (reconnexion)');
  for (const h of STREAM_HEADERS) assert.equal(controls(sock, h).length, 2, `${h} enregistré 2x`);
});

// H7. valeur la plus récente conservée pendant la déconnexion
test('publishClient : dernière valeur conservée puis livrée après reconnexion', async () => {
  const { pub, sock } = await makeChPublisher({});
  pub.publish('stream_onair', [1]);    // déconnecté -> file
  pub.publish('stream_onair', [0.7]);  // écrase la précédente
  assert.equal(sock.emitted.length, 0);
  sock.setConnected(true); sock.fire('connect'); // register + flush pending
  const onair = controls(sock, 'stream_onair');
  // register ([0]) puis deliver de la dernière valeur ([0.7], pas [1])
  const delivered = onair.map((e) => JSON.stringify(e.values));
  assert.ok(delivered.includes('[0.7]'), 'dernière valeur [0.7] livrée');
  assert.ok(!delivered.includes('[1]'), 'ancienne valeur [1] écrasée, non livrée');
});

// H8. stop -> onair=0 livré (streamPresencePublisher)
test('streamPresencePublisher : stop livre onair=0', () => {
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: () => 5000, emitter: em });
  p.update({ onAir: true }, { rms: 0.4, peak: 0.7 });
  p.stop();
  const onair = em.calls.filter((c) => c.header === 'stream_onair');
  assert.ok(onair.some((c) => Array.isArray(c.values) && c.values[0] === 0), 'onair=0 livré au stop');
});

// H9. page publique observe les 4 headers de flux (guard idempotent)
test('observation publique : les 4 headers de flux sont observés une fois', () => {
  const emitted = [];
  const g = createObserveGuard({ emit: (h) => emitted.push(h) });
  g.setConnected(true);
  for (const h of STREAM_HEADERS) g.observeHeaderOnce(h);
  assert.equal(emitted.length, 4);
  assert.deepEqual([...new Set(emitted)].sort(), [...STREAM_HEADERS].sort());
  // réobserver -> idempotent (pas de double émission)
  for (const h of STREAM_HEADERS) g.observeHeaderOnce(h);
  assert.equal(emitted.length, 4);
});

// H10. payload reçu met à jour streamStatus (routeStreamControl)
test('routeStreamControl : payload reçu met à jour streamStatus', () => {
  const c = makeClock(2000);
  const s = createStreamStatus({ now: c.now });
  assert.equal(routeStreamControl({ header: 'sound_title', values: ['x'] }, s), false, 'header non-flux ignoré');
  assert.equal(routeStreamControl({ header: 'stream_onair', values: [1] }, s), true);
  c.advance(10);
  assert.equal(routeStreamControl({ header: 'stream_level', values: [0.5] }, s), true);
  const snap = s.getSnapshot();
  assert.equal(snap.onAir, 1);
  assert.equal(snap.level, 0.5);
  assert.equal(snap.computedStatus, STREAM_STATUS.LIVE);
  const diag = s.getDiagnostics();
  assert.equal(diag.receivedCount.stream_onair, 1);
  assert.equal(diag.receivedCount.stream_level, 1);
  assert.equal(diag.lastStreamHeader, 'stream_level');
});

// H11. pas de régression des 5 headers sound_* (routeControl réservé aux contenus)
test('routage : routeControl accepte sound_*, routeStreamControl accepte stream_*', () => {
  let sound = null;
  assert.equal(routeControl({ header: 'sound_title', values: ['Morceau'] }, (h, v) => { sound = v; }), true);
  assert.equal(sound, 'Morceau');
  assert.equal(routeControl({ header: 'stream_onair', values: [1] }, () => {}), false, 'stream_* non routé par routeControl');
  const s = createStreamStatus({ now: () => 1000 });
  assert.equal(routeStreamControl({ header: 'sound_title', values: ['x'] }, s), false, 'sound_* non routé par routeStreamControl');
});

// H12. aucun secret dans les diagnostics (publisher + streamStatus)
test('diagnostics : aucun secret/token/password dans publisher + streamStatus', async () => {
  const secretPat = /token|secret|password|api[-_]?key|apiKey/i;
  const c = makeClock(1000);
  const st = createStreamStatus({ now: c.now });
  st.ingest('stream_onair', [1]);
  st.ingest('stream_level', [0.4]);
  const snapJson = JSON.stringify({ ...st.getSnapshot(), ...st.getDiagnostics() });
  assert.ok(!secretPat.test(snapJson), 'streamStatus: aucun secret dans snapshot+diag');
  // publisher diag : publisher non connecté (diag par défaut).
  const { pub } = await makeChPublisher({});
  const dJson = JSON.stringify(pub.getDiagnostics());
  assert.ok(!secretPat.test(dJson), 'publishClient: aucun secret dans diagnostics');
});

// ============================================================
// Lot 4G (ajustement) — carte de flux visible uniquement en mode debug
// (src/ui/streamStatusView.js shouldMountStreamCard/mountStreamCard,
//  src/publicPage.js). La logique métier (streamStatus, observation, routage,
//  diagnostic) reste active hors debug ; seul le DOM public est masqué.
// ============================================================

// A1. hors debug, aucune .stream-card dans le DOM
test('stream-card : masquée hors debug (aucun DOM .stream-card créé)', () => {
  const doc = fakeDocument();
  const card = doc.querySelector('main.card');
  const st = createStreamStatus({ now: () => 1000 });
  const mounted = mountStreamCard(doc, card, { debug: false, livekitEnabled: true, streamStatus: st });
  assert.equal(mounted, null);
  assert.ok(!doc._created.some((e) => e.className && e.className.includes('stream-card')),
    'aucune .stream-card créée hors debug');
});

// A2. en debug, .stream-card présente et fonctionnelle
test('stream-card : présente et rendue en mode debug', () => {
  const doc = fakeDocument();
  const card = doc.querySelector('main.card');
  const st = createStreamStatus({ now: () => 1000 });
  ingestStream(st, { onAir: 1, level: 0.5, peak: 0.8, updatedAt: 1000 });
  const mounted = mountStreamCard(doc, card, { debug: true, livekitEnabled: true, streamStatus: st });
  assert.ok(mounted && mounted.section, 'carte montée en debug');
  const section = doc._created.find((e) => e.className && e.className.includes('stream-card'));
  assert.ok(section, '.stream-card présente');
  assert.equal(section._attrs['data-stream-status'], STREAM_STATUS.LIVE, 'snapshot initial rendu');
});

// A3. listener visible dans les deux cas (debug n'affecte pas le listener)
test('listener : visible quel que soit debug (ÉCOUTER LE DIRECT inchangé)', () => {
  for (const debug of [false, true]) {
    const doc = fakeDocument();
    const { els } = buildListenerDOM(doc, null);
    assert.ok(els.section, `section listener construite (debug=${debug})`);
    assert.equal(els.primary.textContent, 'ÉCOUTER LE DIRECT', `bouton principal inchangé (debug=${debug})`);
  }
});

// A4. diagnostic flux cohérent même hors debug (streamStatus actif sans carte)
test('diagnostic flux : cohérent hors debug (routage actif sans carte)', () => {
  const c = makeClock(1000);
  const st = createStreamStatus({ now: c.now });
  // Carte non montée (debug=false) mais logique métier active :
  routeStreamControl({ header: 'stream_onair', values: [1] }, st);
  routeStreamControl({ header: 'stream_level', values: [0.5] }, st);
  const merged = { ...st.getSnapshot(), ...st.getDiagnostics() };
  assert.equal(merged.computedStatus, STREAM_STATUS.LIVE);
  assert.equal(merged.receivedCount.stream_onair, 1);
  assert.equal(merged.receivedCount.stream_level, 1);
  assert.equal(merged.lastStreamHeader, 'stream_level');
});

// A5. règle de montage + pas de régression des headers stream_*
test('stream-card : règle shouldMountStreamCard (debug ET livekit)', () => {
  assert.equal(shouldMountStreamCard(false, true), false, 'hors debug -> pas de carte');
  assert.equal(shouldMountStreamCard(true, true), true, 'debug + livekit -> carte');
  assert.equal(shouldMountStreamCard(false, false), false, 'rien -> pas de carte');
  assert.equal(shouldMountStreamCard(true, false), false, 'debug sans livekit -> pas de carte');
});

// A6. aucun changement sur le moteur listener (DOM + contrôles présents)
test('listener : moteur inchangé (contrôles attendus présents)', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  // Contrats stables du moteur listener (Lot 4D/4F.1) : bouton principal,
  // bouton activation iOS, bouton enceinte, badge atténuation, statut.
  assert.equal(els.primary.id, 'lk-primary');
  assert.equal(els.activate.id, 'lk-activate');
  assert.equal(els.activate.textContent, 'ACTIVER LE SON');
  assert.equal(els.speaker.id, 'lk-speaker');
  assert.equal(els.attenBadge.id, 'lk-atten-badge');
  assert.equal(els.status.id, 'lk-status');
});
