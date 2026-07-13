// Tests de caractérisation du câblage de mountControlRoom() (issue #8).
// mountControlRoom() est désormais une racine de composition injectable ; ces
// tests pinnent le WIRING (start/stop/destroy/logout/onSessionExpired) — pas la
// logique métier des unités (contrôleur, vue, publisher de flux), déjà couverte
// par test/control-room/control-room.test.mjs. Aucun vrai LiveKit / socket /
// AudioContext (tout injecté).
//
// Contrats figés (issue #8) vérifiés ici : teardown idempotent, beforeunload sync
// vs destroy awaited, onSessionExpired signalé une seule fois, aucun secret dans
// le snapshot debug, aucun second publisher/runtime audio.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { fakeDocument, fakeDomEl } from '../helpers/dom.mjs';

// Stub des imports .css (controlRoomPage.js -> styles/main.css) sous node:test.
// Réutilise le loader shared de la suite public (issue #7) ; register() s'exécute
// avant l'import dynamique de controlRoomPage.js. Vite gère le CSS en build réel.
register(new URL('../public/css-stub.mjs', import.meta.url), import.meta.url);
const { mountControlRoom } = await import('../../src/control-room/controlRoomPage.js');

// --- Fake doc avec body (mount point) ---
function fakeDoc() {
  const doc = fakeDocument();
  doc.body = fakeDomEl();
  doc.documentElement = fakeDomEl();
  return doc;
}

// --- Fake controller : on pilote onSnapshot via le subscriber enregistré ---
function fakeController({ snap = baseSnap() } = {}) {
  let subscriber = null;
  let current = snap;
  const calls = { subscribe: 0, destroy: 0, requestPermission: 0, refreshDevices: 0, selectDevice: 0, startCapture: 0, stopCapture: 0, setGain: 0, startBroadcast: 0, stopBroadcast: 0 };
  return {
    _calls: calls,
    _setSnap(s) { current = s; },
    _emit(s) { if (subscriber) subscriber(s); },
    subscribe(fn) { calls.subscribe++; subscriber = fn; return () => { subscriber = null; }; },
    getSnapshot() { return current; },
    async requestPermission() { calls.requestPermission++; return { ok: true }; },
    async refreshDevices() { calls.refreshDevices++; return []; },
    selectDevice(id) { calls.selectDevice++; },
    async startCapture() { calls.startCapture++; return { ok: true }; },
    async stopCapture() { calls.stopCapture++; return { ok: true }; },
    setGain(p) { calls.setGain++; },
    async startBroadcast() { calls.startBroadcast++; return { ok: true }; },
    async stopBroadcast() { calls.stopBroadcast++; return { ok: true }; },
    async destroy() { calls.destroy++; },
  };
}

function baseSnap(over = {}) {
  return {
    composite: 'idle', audioState: 'idle', publisherState: 'idle', onAir: false,
    permission: 'not_requested', devices: [], selectedDeviceId: null, selectedDeviceLabel: null,
    settings: null, gain: 1, meter: null, hasOutputStream: false, canBroadcast: false,
    broadcastLabel: 'HORS ANTENNE', roomName: null, identity: null, trackSid: null,
    connected: false, published: false, reconnectCount: 0, liveSince: null,
    error: null, lastActionResult: null, updatedAt: 1, liveListenerCount: 0, ...over,
  };
}

function fakeStreamPublisher() {
  const calls = { update: 0, stop: 0 };
  const diag = { publishCount: 0, lastPublishedListenerCount: 0, listenerCountPublishCount: 0 };
  return {
    _calls: calls,
    update(snap, meter) { calls.update++; },
    stop() { calls.stop++; },
    getDiagnostics() { return diag; },
  };
}

function fakeConn({ registered = true } = {}) {
  const calls = { destroy: 0 };
  return {
    _calls: calls,
    destroy() { calls.destroy++; },
    getDiagnostics() { return { connected: true, socketId: 's-1', registeredHeaders: [] }; },
    isRegistered() { return registered; },
  };
}

function fakePresence({ conn = null } = {}) {
  const calls = { destroy: 0 };
  const sp = fakeStreamPublisher();
  return {
    _calls: calls,
    streamPublisher: sp,
    getConn: () => conn,
    destroy() { calls.destroy++; },
  };
}

function fakeMeter() {
  const calls = { start: 0, stop: 0 };
  return { _calls: calls, start() { calls.start++; }, stop() { calls.stop++; } };
}

function fakeRuntime({ controller } = {}) {
  const audioEngine = { _marker: 'audio' };
  const publisher = { _marker: 'publisher' };
  const calls = { create: 0 };
  return {
    _calls: calls,
    audioEngine, publisher, controller,
    // Pour compter : on wrap via la factory injectée ci-dessous.
  };
}

function fakeWin() {
  const handlers = {};
  return {
    _handlers: handlers,
    addEventListener(ev, cb) { (handlers[ev] ||= []).push(cb); },
    _fire(ev) { (handlers[ev] || []).forEach((cb) => cb()); },
  };
}

// Monte une Control Room avec fakes. Retourne { api, ctx } où ctx expose les
// fakes pour les assertions + l'émission de snapshots.
function mount({
  snap, debug = false, onLogout, onSessionExpired, conn = null, runtime = null,
  presence = null, meter = null, win,
} = {}) {
  const ctrl = fakeController({ snap: snap || baseSnap() });
  const rt = runtime || fakeRuntime({ controller: ctrl });
  const rtCalls = { create: 0 };
  const createRuntime = () => { rtCalls.create++; return rt; };
  const pres = presence || fakePresence({ conn });
  const presCalls = { create: 0 };
  const createPresence = () => { presCalls.create++; return pres; };
  const mtr = meter || fakeMeter();
  const mtrCalls = { create: 0 };
  const createMeter = () => { mtrCalls.create++; return mtr; };
  const doc = fakeDoc();
  const loc = { search: debug ? '?debug=1' : '' };
  // win: undefined -> fakeWin (défaut) ; null explicite -> pas de beforeunload.
  const w = win === undefined ? fakeWin() : win;
  const api = mountControlRoom({
    doc, loc, win: w, createRuntime, createPresence, createMeter, onLogout, onSessionExpired,
  });
  return {
    api, doc, loc, win: w, controller: ctrl, runtime: rt, presence: pres, meter: mtr,
    rtCalls, presCalls, mtrCalls,
  };
}

// ===========================================================================
// Tests de structure / démarrage
// ===========================================================================

test('mount : sans doc -> null', () => {
  const api = mountControlRoom({ doc: null, createRuntime: () => fakeRuntime(), createPresence: () => fakePresence(), createMeter: () => fakeMeter() });
  assert.equal(api, null);
});

test('mount : retourne { controller, audioEngine, publisher, els, root, destroy }', () => {
  const { api } = mount();
  for (const k of ['controller', 'audioEngine', 'publisher', 'els', 'root', 'destroy']) {
    assert.ok(k in api, `${k} présent`);
  }
  assert.equal(typeof api.destroy, 'function');
});

test('mount : construit le DOM (root cr-room + 7 sections) et l attache au body', () => {
  const { api, doc } = mount();
  assert.ok(api.root.className.includes('cr-room'));
  const sections = doc._created.filter((e) => e._tag === 'section');
  assert.equal(sections.length, 7);
  // root attaché au body via appendChild -> _parent posé.
  assert.equal(api.root._parent, doc.body);
});

test('mount : crée exactement un runtime audio + une présence + un meter (aucun doublon)', () => {
  const { rtCalls, presCalls, mtrCalls } = mount();
  assert.equal(rtCalls.create, 1);
  assert.equal(presCalls.create, 1);
  assert.equal(mtrCalls.create, 1);
});

test('mount : subscribe onSnapshot + rendu initial (broadcastLabel HORS ANTENNE)', () => {
  const { api, controller } = mount();
  assert.equal(controller._calls.subscribe, 1);
  // Rendu initial : broadcastLabel peint depuis le snapshot idle.
  assert.equal(api.els.broadcastLabel.textContent, 'HORS ANTENNE');
});

// ===========================================================================
// onSnapshot -> meter + publication + expiration session
// ===========================================================================

test('mount : onSnapshot idle initial -> meter.stop appelé (pas start)', () => {
  const { meter } = mount();
  assert.equal(meter._calls.stop, 1);
  assert.equal(meter._calls.start, 0);
});

test('mount : onSnapshot capturing -> meter.start ; retour idle -> meter.stop', () => {
  const { controller, meter } = mount();
  controller._emit(baseSnap({ audioState: 'capturing' }));
  assert.equal(meter._calls.start, 1);
  controller._emit(baseSnap({ audioState: 'stopped' }));
  assert.equal(meter._calls.stop, 2); // initial + retour idle
});

test('mount : onSnapshot appelle presence.streamPublisher.update(snap, meter)', () => {
  const { controller, presence } = mount();
  const before = presence.streamPublisher._calls.update;
  controller._emit(baseSnap({ audioState: 'capturing', meter: { rms: 0.5 } }));
  assert.equal(presence.streamPublisher._calls.update, before + 1);
});

test('mount : token_unauthorized -> onSessionExpired signalé une seule fois (idempotent)', () => {
  let expired = 0;
  const { controller } = mount({ onSessionExpired: () => { expired++; } });
  controller._emit(baseSnap({ error: { code: 'token_unauthorized', message: 'x' } }));
  assert.equal(expired, 1);
  controller._emit(baseSnap({ error: { code: 'token_unauthorized', message: 'x' } }));
  assert.equal(expired, 1, 'signalé une seule fois');
});

test('mount : erreur non-token -> onSessionExpired NON appelé', () => {
  let expired = 0;
  const { controller } = mount({ onSessionExpired: () => { expired++; } });
  controller._emit(baseSnap({ error: { code: 'disconnected', message: 'x' } }));
  assert.equal(expired, 0);
});

// ===========================================================================
// Vue / contrôleur : câblage des handlers
// ===========================================================================

test('mount : clic QUITTER -> onLogout appelé', () => {
  let loggedOut = 0;
  const { api } = mount({ onLogout: () => { loggedOut++; } });
  api.els.logout._fire('click');
  assert.equal(loggedOut, 1);
});

test('mount : clic DÉMARRER LA DIFFUSION -> controller.startBroadcast', async () => {
  const { api, controller } = mount();
  api.els.startBroadcast._fire('click');
  // wireControlRoom handler est async ; on attend une microtask.
  await Promise.resolve();
  assert.equal(controller._calls.startBroadcast, 1);
});

// ===========================================================================
// Cycle de vie / teardown
// ===========================================================================

test('mount : destroy stoppe meter + présence + contrôleur (awaited)', async () => {
  const { api, meter, presence, controller } = mount();
  // onSnapshot(idle) initial a déjà appelé meter.stop une fois -> on mesure le delta.
  const meterBefore = meter._calls.stop;
  const presBefore = presence._calls.destroy;
  await api.destroy();
  assert.equal(meter._calls.stop, meterBefore + 1, 'destroy appelle meter.stop');
  assert.equal(presence._calls.destroy, presBefore + 1, 'destroy appelle presence.destroy');
  assert.equal(controller._calls.destroy, 1, 'controller.destroy awaited');
});

test('mount : destroy idempotent (2e appel no-op)', async () => {
  const { api, meter, presence, controller } = mount();
  await api.destroy();
  const meterAfter1 = meter._calls.stop;
  const presAfter1 = presence._calls.destroy;
  const ctrlAfter1 = controller._calls.destroy;
  await api.destroy();
  assert.equal(meter._calls.stop, meterAfter1, '2e destroy: meter.stop no-op');
  assert.equal(presence._calls.destroy, presAfter1, '2e destroy: presence.destroy no-op');
  assert.equal(controller._calls.destroy, ctrlAfter1, '2e destroy: controller.destroy no-op');
});

test('mount : destroy retire root du DOM (parentNode.removeChild)', async () => {
  const { api, doc } = mount();
  // fakeDomEl n expose pas parentNode -> on le pose explicitement pour tester
  // la branche de retrait du DOM (équivalent navigateur).
  let removed = null;
  api.root.parentNode = doc.body;
  doc.body.removeChild = (node) => { removed = node; };
  await api.destroy();
  assert.equal(removed, api.root);
});

test('mount : beforeunload -> présence.destroy + controller.destroy (sync)', () => {
  const { win, presence, controller } = mount();
  win._fire('beforeunload');
  assert.equal(presence._calls.destroy, 1);
  assert.equal(controller._calls.destroy, 1);
});

test('mount : sans window -> beforeunload non câblé (aucun crash)', () => {
  const { win } = mount({ win: null });
  assert.equal(win, null);
  // Si on arrive ici sans crash, le branchement beforeunload est skip propre.
});

// ===========================================================================
// Diagnostics (debug) : aucun secret dans le snapshot
// ===========================================================================

test('mount : debug=1 -> section diagnostic + <pre> construits', () => {
  const { api } = mount({ debug: true });
  assert.ok(api.els.root._created || true); // sanity
  // La section debug est appendée à root ; on cherche le pre.cr-debug-pre.
  // fakeDomEl.append pose _parent ; on parcourt les created du doc.
  const doc = api.els._doc;
  const pre = doc._created.find((e) => e.className === 'cr-debug-pre');
  assert.ok(pre, 'pre.cr-debug-pre construit en mode debug');
});

test('mount : debug=1 -> onSnapshot écrit le snapshot JSON sans secret/password/token', () => {
  const { api, controller, doc } = mount({ debug: true });
  const pre = doc._created.find((e) => e.className === 'cr-debug-pre');
  controller._emit(baseSnap({ composite: 'live', onAir: true, liveListenerCount: 3 }));
  const text = pre.textContent;
  assert.ok(text.includes('streamPresence'));
  assert.ok(text.includes('collabHubPublisher'));
  assert.ok(text.includes('listenerCount'));
  assert.ok(text.includes('"liveListenerCount": 3'));
  // Aucun secret transporté dans le diagnostic.
  assert.ok(!text.includes('password'), 'pas de password dans le diag');
  assert.ok(!text.includes('apiKey'), 'pas de apiKey dans le diag');
  assert.ok(!text.includes('apiSecret'), 'pas de apiSecret dans le diag');
  assert.ok(!text.includes('PERFORMER_PASSWORD'), 'pas de PERFORMER_PASSWORD dans le diag');
});

test('mount : debug=0 -> aucun pre diagnostic construit (renderer no-op)', () => {
  const { doc } = mount({ debug: false });
  const pre = doc._created.find((e) => e.className === 'cr-debug-pre');
  assert.equal(pre, undefined);
});