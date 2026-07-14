// Tests de caractérisation pour mountPublicPage() (issue #7).
// Ces tests pinent le comportement d'orchestration AVANT extraction : montage,
// socket Collab-Hub unique, observation des headers, routage sound_* / stream_*,
// compteur d'auditeurs, fraîcheur, liens enrichis, listener LiveKit gate + import
// dynamique, debug protégé, teardown, double montage, persistance. Aucune
// assertion métier n'est modifiée pendant l'extraction — ces tests doivent rester
// verts à chaque étape.
//
// La seam d'injection (deps) de mountPublicPage permet de brancher des fakes
// (env, DOM, storage, horloge, scheduler, factory socket, chargeurs diag/listener)
// sans charger le SDK LiveKit ni ouvrir de vraie socket.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { KNOWN_HEADERS, STREAM_HEADERS } from '../../src/collabHub/messageRouter.js';
import { STORAGE_KEY } from '../../src/state/persist.js';
import { DEFAULTS } from '../../src/state/soundState.js';
import { STALE_MS } from '../../src/state/streamStatus.js';

// Stub des imports .css (publicPage.js -> styles/main.css) sous node:test.
// register() s'exécute avant l'import dynamique de publicPage.js (les imports
// statiques ci-dessus ne touchent pas de CSS). Vite gère le CSS en build réel.
register(new URL('./css-stub.mjs', import.meta.url), import.meta.url);
const { mountPublicPage } = await import('../../src/publicPage.js');

// Le source est lu pour vérifier que les import() dynamiques littéraux sont
// conservés (caractérisation du code-splitting, cf. build).
const PUBLIC_PAGE_SRC = readFileSync(new URL('../../src/publicPage.js', import.meta.url), 'utf8');

// --- Fakes locaux à la suite d'orchestration (un seul domaine) ---

function makeEl() {
  const handlers = {};
  return {
    textContent: '', hidden: false, className: '', value: '', id: '', _attrs: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    appendChild(c) { return c; }, append(...c) { return c; }, insertBefore(c) { return c; }, replaceChildren() {},
    addEventListener(ev, cb) { (handlers[ev] ||= []).push(cb); },
    removeEventListener() {},
    _fire(ev, ...a) { (handlers[ev] || []).forEach((cb) => cb(...a)); },
  };
}

function makeDoc() {
  const byId = new Map();
  const getById = (id) => { if (!byId.has(id)) byId.set(id, makeEl()); return byId.get(id); };
  const card = makeEl();
  card.parentNode = { insertBefore() {} };
  card.nextSibling = null;
  return {
    _card: card, _byId: byId,
    createElement: () => makeEl(),
    createTextNode: (t) => ({ textContent: t }),
    getElementById: getById,
    querySelector: (sel) => (sel === 'main.card' ? card : getById(sel.replace(/^#/, ''))),
  };
}

function makeStorage(init = {}) {
  const store = { ...init };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _store: store,
  };
}

function makeScheduler() {
  const timers = [];
  let next = 1;
  const cleared = [];
  const schedule = (fn, ms) => { const id = next++; timers.push({ id, fn, ms }); return id; };
  const clearSchedule = (id) => { cleared.push(id); const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
  const tick = () => { [...timers].forEach((t) => t.fn()); };
  return { schedule, clearSchedule, tick, cleared, _timers: timers };
}

function makeFakeConnect({ reject = false } = {}) {
  const observed = new Map();
  let capturedOpts = null;
  let connectCalls = 0;
  let closeCalls = 0;
  const api = {
    socket: { close: () => { closeCalls++; } },
    observeHeaderOnce: (h) => { observed.set(h, (observed.get(h) || 0) + 1); return true; },
    isObserved: (h) => observed.has(h),
    observedCount: () => observed.size,
    forget: () => { observed.clear(); },
    _observed: observed, _closeCalls: () => closeCalls,
  };
  const connect = (opts) => { connectCalls++; capturedOpts = opts; return reject ? Promise.reject(new Error('boom')) : Promise.resolve(api); };
  return { connect, api, getOpts: () => capturedOpts, connectCalls: () => connectCalls };
}

function makeFakeListener() {
  let mountCalls = 0;
  let destroyCalls = 0;
  let lastOpts = null;
  const listenerApi = { getSnapshot: () => ({ enabled: true, connected: false }), destroy: () => { destroyCalls++; } };
  const mountListener = (opts) => { mountCalls++; lastOpts = opts; return Promise.resolve(listenerApi); };
  return { mountListener, listenerApi, mountCalls: () => mountCalls, destroyCalls: () => destroyCalls, lastOpts: () => lastOpts };
}

function makeFakeDiag() {
  let mountCalls = 0;
  const diagApi = { refreshFreshness() {}, refreshLivekit() {}, refreshStream() {}, setStatus() {}, logControl() {}, setLocalSaved() {}, setLocalRestore() {} };
  const mountDiag = () => { mountCalls++; return Promise.resolve(diagApi); };
  return { mountDiag, diagApi, mountCalls: () => mountCalls };
}

const BASE_ENV = {
  VITE_COLLAB_HUB_URL: 'https://server.collab-hub.io',
  VITE_COLLAB_HUB_NAMESPACE: 'hub',
  VITE_COLLAB_HUB_AUTH_MODE: 'anonymous',
  VITE_LIVEKIT_ENABLED: 'true',
  VITE_PUBLIC_DEBUG_ENABLED: 'false',
};

function mount(overrides = {}) {
  const doc = overrides.doc ?? makeDoc();
  const storage = overrides.storage ?? makeStorage();
  const sched = overrides.sched ?? makeScheduler();
  const conn = overrides.conn ?? makeFakeConnect();
  const listener = overrides.listener ?? makeFakeListener();
  const diag = overrides.diag ?? makeFakeDiag();
  const errors = [];
  const now = overrides.now ?? (() => 1_000_000);
  const env = { ...BASE_ENV, ...(overrides.env || {}) };
  const r = mountPublicPage({
    env, doc, storage,
    loc: { search: overrides.search ?? '' },
    now,
    schedule: sched.schedule,
    clearSchedule: sched.clearSchedule,
    connect: conn.connect,
    mountDiag: diag.mountDiag,
    mountListener: listener.mountListener,
    onError: (label, err) => errors.push({ label, err }),
    log: () => {}, // dbg silencieux sous test (debug gated)
  });
  return { r, doc, storage, sched, conn, listener, diag, errors, env, now };
}

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

// --- 18 tests de caractérisation ---

test('1. montage page normale : renvoie { teardown }, rendu initial, attribut fraîcheur posé', async () => {
  const { r, doc } = mount();
  assert.equal(typeof r.teardown, 'function');
  // recomputePublicState() au montage pose data-content-fresh (pas de contenu -> false).
  assert.equal(doc._card.getAttribute('data-content-fresh'), 'false');
  assert.doesNotThrow(() => r.teardown());
});

test('2. connexion Collab-Hub unique : connect appelée exactement une fois', async () => {
  const { conn, r } = mount();
  await flush();
  assert.equal(conn.connectCalls(), 1);
  assert.equal(typeof conn.getOpts().onControl, 'function');
  assert.equal(typeof conn.getOpts().onStatus, 'function');
  r.teardown();
});

test('3. observation des headers attendus : STREAM_HEADERS observés après connexion', async () => {
  const { conn, r } = mount(); // LiveKit activé par défaut -> streamStatus créé
  await flush();
  for (const h of STREAM_HEADERS) assert.ok(conn.api._observed.has(h), `header observé : ${h}`);
  r.teardown();
});

test('4. reconnexion -> réobserve les headers de flux (le guard socketClient déduplique les émissions)', async () => {
  // Orchestrateur réémet observeStreamHeaders à chaque (re)connexion ; le
  // guard idempotent de connectCollabHub (unit-testé dans la suite collabHub)
  // garantit quun seul observeControl part sur le fil par socket.id.
  const { conn, r } = mount();
  await flush();
  const opts = conn.getOpts();
  const before = conn.api._observed.get('stream_onair');
  opts.onStatus('disconnected');
  opts.onStatus('connected'); // reconnexion -> observeStreamHeaders rappelé
  assert.equal(conn.api._observed.get('stream_onair'), before + 1);
  r.teardown();
});

test('5. réception sound_* : rendu du champ + persistance locale', async () => {
  const { conn, storage, doc, r } = mount();
  await flush();
  conn.getOpts().onControl({ header: 'sound_title', values: 'Nouveau titre' });
  assert.equal(doc.getElementById('sound-title').textContent, 'Nouveau titre');
  const raw = storage.getItem(STORAGE_KEY);
  assert.ok(raw, 'état persisté');
  assert.equal(JSON.parse(raw).fields.sound_title, 'Nouveau titre');
  r.teardown();
});

test('6. réception stream_* : routé vers streamStatus, non persisté comme contenu', async () => {
  const { conn, storage, doc, r } = mount();
  await flush();
  conn.getOpts().onControl({ header: 'stream_onair', values: 1 });
  // stream_* nest pas un KNOWN_HEADER -> pas de persistance son, pas de rendu contenu.
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(doc.getElementById('sound-title').textContent, DEFAULTS.sound_title);
  r.teardown();
});

test('6b. réception image : affichée sans être persistée avec les textes', async () => {
  const { conn, storage, doc, r } = mount();
  await flush();
  conn.getOpts().onControl({ header: 'sound_image_url', values: 'https://example.com/visuel.png' });
  const image = doc.getElementById('sound-image');
  assert.equal(image.getAttribute('src'), 'https://example.com/visuel.png');
  assert.equal(doc.getElementById('sound-image-wrap').hidden, false);
  assert.equal(storage.getItem(STORAGE_KEY), null, 'image éphémère : aucun localStorage');
  conn.getOpts().onControl({ header: 'sound_image_visible', values: 'false' });
  assert.equal(doc.getElementById('sound-image-wrap').hidden, true);
  assert.doesNotThrow(() => conn.getOpts().onControl({ header: 'sound_image_slot', values: 'top' }));
  r.teardown();
});

test('6c. visibilité des textes : masque sans effacer et reste hors localStorage', async () => {
  const { conn, storage, doc, r } = mount();
  await flush();
  conn.getOpts().onControl({ header: 'sound_title', values: 'Titre conservé' });
  conn.getOpts().onControl({ header: 'sound_title_visible', values: 'false' });
  assert.equal(doc.getElementById('sound-title-wrap').hidden, true);
  assert.equal(doc.getElementById('sound-title').textContent, 'Titre conservé');
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).fields.sound_title, 'Titre conservé');
  conn.getOpts().onControl({ header: 'sound_title_visible', values: 'true' });
  assert.equal(doc.getElementById('sound-title-wrap').hidden, false);

  conn.getOpts().onControl({ header: 'sound_link', values: 'https://example.com' });
  conn.getOpts().onControl({ header: 'sound_link_visible', values: 'false' });
  assert.equal(doc.getElementById('sound-link-wrap').hidden, true);
  conn.getOpts().onControl({ header: 'sound_link_visible', values: 'true' });
  assert.equal(doc.getElementById('sound-link-wrap').hidden, false);
  r.teardown();
});

test('7. compteur dauditeurs : stream_listener_count -> libellé rendu dans lk-listener-count', async () => {
  const { conn, doc, r } = mount();
  await flush();
  conn.getOpts().onControl({ header: 'stream_listener_count', values: 5 });
  // formatListenerCount(5) = "5 auditeurs" ; rendu seulement si le libellé change.
  assert.equal(doc.getElementById('lk-listener-count').textContent, '5 auditeurs');
  r.teardown();
});

// 7b. issue #1 : le compteur d'auditeurs CONSERVE son dernier état connu et ne
// revient pas à "Auditeurs : —" après stale. Le header stream_listener_count est
// publié sur les changements de participants (event-driven, pas à chaque tick) ;
// entre deux publications, le tick 1 s (renderStreamState -> stream.render)
// réévaluait le gate STALE_MS et repeignait "Auditeurs : —" — c'est ce que
// l'utilisateur observe comme disparition du compteur pendant qu'il règle le
// volume (plusieurs secondes). Reproduction : on affiche un compte connu, on
// avance l'horloge au-delà de STALE_MS (le temps qui s'écoule pendant le réglage
// volume), on déclenche le tick 1 s, et on exige que le compteur reste visible.
// Ce test ÉCHOUE avant le correctif (le tick repeint "—") et passe après.

test('7b. issue #1 : compteur conservé après stale + tick 1 s (ne revient pas à —)', async () => {
  let t = 1_000_000;
  const now = () => t;
  const { conn, doc, sched, r } = mount({ now });
  await flush();
  conn.getOpts().onControl({ header: 'stream_listener_count', values: 2 });
  assert.equal(doc.getElementById('lk-listener-count').textContent, '2 auditeurs', 'compte initial rendu');
  // > 3 s s'écoulent sans nouveau header (ex : l'utilisateur règle le volume).
  t = 1_000_000 + STALE_MS + 500;
  // Le tick 1 s déclenche renderStreamState() -> stream.render() réévalue le label.
  sched.tick();
  assert.equal(doc.getElementById('lk-listener-count').textContent, '2 auditeurs', 'compte conservé après stale + tick');
  // Un nouveau nombre arrive -> le compteur se met à jour.
  t = 1_000_000 + STALE_MS + 600;
  conn.getOpts().onControl({ header: 'stream_listener_count', values: 7 });
  assert.equal(doc.getElementById('lk-listener-count').textContent, '7 auditeurs', 'mise à jour sur nouveau compte');
  r.teardown();
});

test('8. fraîcheur : contenu restauré récent -> fresh true ; ancien -> stale false', async () => {
  const now = () => 10_000_000;
  const freshStorage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ version: 1, updatedAt: new Date(9_900_000).toISOString(), fields: { sound_title: 'X' } }) });
  const fresh = mount({ storage: freshStorage, now });
  assert.equal(fresh.doc._card.getAttribute('data-content-fresh'), 'true');
  fresh.r.teardown();

  const staleStorage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ version: 1, updatedAt: new Date(6_000_000).toISOString(), fields: { sound_title: 'Y' } }) });
  const stale = mount({ storage: staleStorage, now });
  assert.equal(stale.doc._card.getAttribute('data-content-fresh'), 'false');
  stale.r.teardown();
});

test('9. liens enrichis : sound_link URL simple -> lien visible avec href http(s)', async () => {
  const { conn, doc, r } = mount();
  await flush();
  conn.getOpts().onControl({ header: 'sound_link', values: 'https://example.com' });
  const link = doc.getElementById('sound-link');
  assert.equal(link.getAttribute('href'), 'https://example.com');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(doc.getElementById('sound-link-wrap').hidden, false);
  r.teardown();
});

test('10. listener LiveKit monté uniquement si activé', async () => {
  const on = mount({ env: { VITE_LIVEKIT_ENABLED: 'true' } });
  await flush();
  assert.equal(on.listener.mountCalls(), 1, 'activé -> listener monté');
  on.r.teardown();
  const off = mount({ env: { VITE_LIVEKIT_ENABLED: 'false' } });
  await flush();
  assert.equal(off.listener.mountCalls(), 0, 'désactivé -> listener non monté');
  off.r.teardown();
});

test('11. import LiveKit dynamique conservé (import() littéral inline préservé)', () => {
  // Le code-splitting (chunk listenerSection séparé) repose sur ces littéraux.
  assert.ok(PUBLIC_PAGE_SRC.includes("import('./listener/listenerSection.js')"), 'import dynamique listener conservé');
  assert.ok(PUBLIC_PAGE_SRC.includes("import('./diagnostic/diagnosticPanel.js')"), 'import dynamique diagnostic conservé');
});

test('12. debug public non monté par défaut (gate VITE_PUBLIC_DEBUG_ENABLED + ?debug=1)', async () => {
  const noFlag = mount({ env: { VITE_PUBLIC_DEBUG_ENABLED: 'true' } }); // build true mais pas ?debug=1
  await flush();
  assert.equal(noFlag.diag.mountCalls(), 0, 'sans ?debug=1 -> pas de panneau');
  noFlag.r.teardown();
  const prodOff = mount({ env: { VITE_PUBLIC_DEBUG_ENABLED: 'false' }, search: '?debug=1' });
  await flush();
  assert.equal(prodOff.diag.mountCalls(), 0, 'VITE_PUBLIC_DEBUG_ENABLED=false -> pas de panneau même avec ?debug=1');
  prodOff.r.teardown();
});

test('13. debug monté avec flag build + query ?debug=1', async () => {
  const d = mount({ env: { VITE_PUBLIC_DEBUG_ENABLED: 'true' }, search: '?debug=1' });
  await flush();
  assert.equal(d.diag.mountCalls(), 1, 'flag + query -> panneau monté');
  d.r.teardown();
});

test('14. teardown ferme socket/timers/listeners et est idempotent', async () => {
  const { sched, conn, listener, r } = mount();
  await flush();
  const handle = sched._timers[0]?.id;
  r.teardown();
  assert.ok(handle !== undefined && sched.cleared.includes(handle), 'timer 1s cleared');
  assert.equal(listener.destroyCalls(), 1, 'listener détruit');
  assert.equal(conn.api._closeCalls(), 1, 'socket fermée');
  // idempotent : un second teardown ne refait rien.
  r.teardown();
  assert.equal(listener.destroyCalls(), 1);
  assert.equal(conn.api._closeCalls(), 1);
  assert.equal(sched.cleared.length, 1);
});

test('15. aucun double montage après remount (timeurs indépendants)', async () => {
  const sched = makeScheduler();
  const a = mount({ sched });
  a.r.teardown();
  assert.equal(sched._timers.length, 0, 'après teardown A : aucun timer actif');
  const b = mount({ sched });
  assert.equal(sched._timers.length, 1, 'après remount B : un seul timer actif');
  b.r.teardown();
  assert.equal(sched._timers.length, 0, 'après teardown B : aucun timer actif');
});

test('16. page sans LiveKit : pas de streamStatus, pas de listener, routage stream ignoré sans crash', async () => {
  const { conn, listener, doc, r } = mount({ env: { VITE_LIVEKIT_ENABLED: 'false' } });
  await flush();
  assert.equal(listener.mountCalls(), 0);
  // stream_onair reçu mais streamStatus null -> branche stream court-circuitée, pas de throw.
  assert.doesNotThrow(() => conn.getOpts().onControl({ header: 'stream_onair', values: 1 }));
  assert.equal(doc.getElementById('sound-title').textContent, DEFAULTS.sound_title);
  r.teardown();
});

test('17. page sans Collab-Hub disponible : connexion rejetée -> onError, pas de crash, teardown OK', async () => {
  const { conn, errors, r } = mount({ conn: makeFakeConnect({ reject: true }) });
  await flush();
  assert.equal(errors.length, 1);
  assert.match(errors[0].label, /connexion impossible/);
  assert.doesNotThrow(() => r.teardown());
});

test('18. persistance/restauration inchangée : restauration au montage + sauvegarde sur réception', async () => {
  const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ version: 1, updatedAt: new Date(1_000_000).toISOString(), fields: { sound_title: 'Restauré', sound_author: 'Auteur' } }) });
  const { doc, conn, r } = mount({ storage, now: () => 1_000_000 });
  assert.equal(doc.getElementById('sound-title').textContent, 'Restauré');
  assert.equal(doc.getElementById('sound-author').textContent, 'Auteur');
  await flush();
  conn.getOpts().onControl({ header: 'sound_title', values: 'Nouveau' });
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).fields.sound_title, 'Nouveau');
  r.teardown();
});
