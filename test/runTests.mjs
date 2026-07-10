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
  sock.fire('connect');            // connexion initiale -> 5 émissions
  assert.equal(emitted.length, 5);
  sock.fire('reconnect');          // déclenche aussi connect ensuite -> déjà observé
  assert.equal(emitted.length, 5);
  sock.fire('disconnect');         // vide le guard
  sock.fire('connect');            // reconnect -> 5 nouvelles
  assert.equal(emitted.length, 10);
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