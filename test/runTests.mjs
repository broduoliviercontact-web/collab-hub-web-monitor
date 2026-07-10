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
  assert.equal(REQUIRED.version, '1.1.0');
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
// Lot 4D — moteur listener LiveKit + adaptateur audio + UI publique
// ============================================================
import { createLiveKitListener, LISTENER_ERRORS, DEFAULT_VOLUME } from '../src/livekit/livekitListener.js';
import { createListenerAudioElement } from '../src/listener/listenerAudioElement.js';
import {
  isLiveKitEnabled, STATUS_LABELS, buildListenerDOM,
  renderListenerState, wireListenerControls,
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
function makeListener({ tokenClient, RoomClass, audioSink, connectFail } = {}) {
  return createLiveKitListener({
    tokenClient: tokenClient || makeFakeListenerTokenClient(),
    RoomClass: RoomClass || makeFakeListenerRoomClass({ connectFail }),
    audioSink: audioSink || makeFakeAudioSink(),
    now: () => 1000,
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

// 7. bouton mute (COUPER / RÉACTIVER)
test('listenerUI : bouton mute COUPER puis RÉACTIVER', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: false, hasAudioTrack: true }, els);
  assert.equal(els.mute.hidden, false);
  assert.equal(els.mute.textContent, 'COUPER');
  renderListenerState({ state: 'playing', volume: 0.8, muted: true, hasAudioTrack: true }, els);
  assert.equal(els.mute.textContent, 'RÉACTIVER');
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
  updateBroadcastEnabled, wireControlRoom,
} from '../src/control-room/controlRoomView.js';

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
  assert.equal(describeError('token_unauthorized'), 'Mot de passe incorrect.');
  assert.ok(describeError('permission_denied').includes('micro'));
  assert.equal(describeError('no_password'), 'Saisissez le mot de passe performer.');
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

test('crController : startBroadcast transmet le password à publisher.connect', async () => {
  const a = readyAudio();
  const p = makeFakePublisher();
  const c = makeController({ audio: a, publisher: p });
  await c.startBroadcast('secret123');
  assert.equal(p._lastConnectArgs().password, 'secret123');
});

test('crController : startBroadcast sans password -> no_password', async () => {
  const c = makeController({ audio: readyAudio() });
  const r = await c.startBroadcast('');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'no_password');
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
  assert.equal(s.error.message, 'Mot de passe incorrect.');
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

test('crView : champ mot de passe type=password + autocomplete off', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  assert.equal(els.password.type, 'password');
  assert.equal(els.password.autocomplete, 'off');
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

test('crView : updateBroadcastEnabled canBroadcast+password vide -> disabled', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  els._canBroadcast = true;
  els.password.value = '';
  updateBroadcastEnabled(els);
  assert.equal(els.startBroadcast.disabled, true);
  els.password.value = 'pw';
  updateBroadcastEnabled(els);
  assert.equal(els.startBroadcast.disabled, false);
});

test('crView : wire -> clic DÉMARRER appelle onStartBroadcast(password)', () => {
  const doc = fakeDocument();
  const { els } = buildControlRoomDOM(doc, null);
  let received = null;
  wireControlRoom({ els, handlers: { onStartBroadcast: (pw) => { received = pw; } } });
  els.password.value = 'secret';
  els.startBroadcast._fire('click');
  assert.equal(received, 'secret');
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
  // Le mot de passe n'est jamais reflété : l'input reste vide hors saisie.
  assert.equal(els.password.value, '');
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

test('crInteg : startBroadcast sans password dans le flux -> no_password', async () => {
  const c = makeController({ audio: readyAudio() });
  await c.startCapture().catch(() => {});
  const r = await c.startBroadcast('');
  assert.equal(r.code, 'no_password');
});

test('crInteg : échec token -> error + message, puis retry -> live', async () => {
  const a = readyAudio();
  let p = makeFakePublisher({ fail: 'token_unauthorized' });
  const c = makeController({ audio: a, publisher: p });
  const r = await c.startBroadcast('bad');
  assert.equal(r.code, 'token_unauthorized');
  assert.equal(c.getSnapshot().composite, 'error');
  assert.equal(c.getSnapshot().error.message, 'Mot de passe incorrect.');
  // Retry avec un publisher sain (simule nouvelle tentative).
  p = makeFakePublisher();
  const c2 = createControlRoomController({ audioEngine: a, publisher: p, now: () => 1 });
  const r2 = await c2.startBroadcast('good');
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
