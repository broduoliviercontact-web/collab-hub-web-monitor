// Tests for the control-room domain — split from the former monolithic test/runTests.mjs (issue #11).
// Behaviour is unchanged; tests and fakes were moved verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveCompositeState, broadcastStatus, isOnAir, describeError,
  derivePermission, COMPOSITE_STATES, PUBLISHER_ACTIVE,
} from '../../src/control-room/controlRoomState.js';
import { createControlRoomController } from '../../src/control-room/controlRoomController.js';
import {
  buildControlRoomDOM, renderControlRoom, renderMeter,
  updateBroadcastEnabled, wireControlRoom, buildLoginDOM, renderLogin, wireLogin,
} from '../../src/control-room/controlRoomView.js';
import { createControlRoomGate, GATE_STATES } from '../../src/control-room/controlRoomGate.js';
import { readFileSync } from 'node:fs';
import {
  createStreamStatus, routeStreamControl,
  STREAM_HEADERS, STALE_MS, SIGNAL_THRESHOLD,
  STREAM_STATUS, STREAM_SIGNAL,
  clamp01, parseOnAir, parseTimestamp,
  normalizeCount, formatListenerCount,
} from '../../src/state/streamStatus.js';
import {
  createStreamPresencePublisher, DEFAULT_STREAM_THROTTLE_MS,
} from '../../src/control-room/streamPresencePublisher.js';
import { fakeDocument, fakeDomEl } from '../helpers/dom.mjs';
import { T0 } from '../helpers/session-fixtures.mjs';
import { makeClock } from '../helpers/clock.mjs';
import { makeFakeStreamEmitter, meterOf } from '../helpers/stream-fakes.mjs';
import { makeFakeMediaTrack, makeFakeOutputStream } from '../helpers/publisher-fakes.mjs';

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

function makeFakePublisher({ state = 'idle', fail = null } = {}) {
  let s = { state, roomName: null, identity: null, participantSid: null, trackSid: null, connected: false, published: false, reconnectCount: 0, lastError: null, connectedAt: null, liveSince: null, liveListenerCount: 0 };
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
    async stop() { calls.stop++; s = { state: 'stopped', roomName: null, identity: null, participantSid: null, trackSid: null, connected: false, published: false, reconnectCount: 0, lastError: null, connectedAt: null, liveSince: null, liveListenerCount: 0 }; notify(); },
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

function readyAudio() {
  return makeFakeAudioEngine({
    state: 'capturing',
    devices: [{ deviceId: 'd1', label: 'BlackHole 2ch' }],
    outputStream: makeFakeOutputStream(makeFakeMediaTrack()),
    selectedDeviceId: 'd1', selectedDeviceLabel: 'BlackHole 2ch',
  });
}

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

// Lot 5 (partie B) hotfix : liveListenerCount (entier >= 0, aucune identité)
// doit être propagé depuis le publisher jusqu'au snapshot du controller, sinon
// streamPresencePublisher n'émet jamais le vrai compte (reste à 0).

test('crController : liveListenerCount propagé depuis le publisher -> snapshot', () => {
  const p = makeFakePublisher({ state: 'live' });
  const c = makeController({ audio: readyAudio(), publisher: p });
  assert.equal(c.getSnapshot().liveListenerCount, 0);
  p._set({ liveListenerCount: 2 });
  assert.equal(c.getSnapshot().liveListenerCount, 2);
  p._set({ liveListenerCount: 0 });
  assert.equal(c.getSnapshot().liveListenerCount, 0);
});


test('crController : liveListenerCountAbsent -> 0 par défaut (pas undefined)', () => {
  // Publisher sans champ liveListenerCount (ex. vieille implé) -> 0 sûr.
  const p = makeFakePublisher({ state: 'live' });
  delete p.getSnapshot;
  p.getSnapshot = () => ({ state: 'live', connected: true, published: true, reconnectCount: 0 });
  const c = makeController({ audio: readyAudio(), publisher: p });
  assert.equal(c.getSnapshot().liveListenerCount, 0);
});


test('crController : stop diffuseur -> liveListenerCount revenu à 0', async () => {
  const p = makeFakePublisher({ state: 'live' });
  p._set({ liveListenerCount: 3 });
  const c = makeController({ audio: readyAudio(), publisher: p });
  assert.equal(c.getSnapshot().liveListenerCount, 3);
  await c.stopBroadcast();
  assert.equal(c.getSnapshot().liveListenerCount, 0);
});


test('crController : snapshot ne contient aucune identité/SID d auditeur', () => {
  const p = makeFakePublisher({ state: 'live' });
  p._set({ liveListenerCount: 2 });
  const s = makeController({ audio: readyAudio(), publisher: p }).getSnapshot();
  assert.equal('listenerIdentities' in s, false);
  assert.equal('participantSids' in s, false);
  assert.equal(typeof s.liveListenerCount, 'number');
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


test('publisher : throttle respecté (pas d envoi à chaque frame)', () => {
  const c = makeClock(1000);
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: c.now, throttleMs: 400, emitter: em });
  p.update({ onAir: true }, meterOf(0.5, 0.8));   // t=1000 : transition -> publish
  assert.equal(em.calls.length, STREAM_HEADERS.length); // un emit par header de flux
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

test('streamPresencePublisher : stop livre onair=0', () => {
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: () => 5000, emitter: em });
  p.update({ onAir: true }, { rms: 0.4, peak: 0.7 });
  p.stop();
  const onair = em.calls.filter((c) => c.header === 'stream_onair');
  assert.ok(onair.some((c) => Array.isArray(c.values) && c.values[0] === 0), 'onair=0 livré au stop');
});

// H9. page publique observe les headers de flux (guard idempotent)

test('streamPresencePublisher : update publie stream_listener_count [N]', () => {
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: () => 1000, throttleMs: 400, emitter: em });
  p.update({ onAir: true, liveListenerCount: 3 }, meterOf(0.4, 0.7));
  const cnt = em.calls.filter((c) => c.header === 'stream_listener_count');
  assert.deepEqual(cnt[cnt.length - 1].values, [3]);
});

// 28. streamPresencePublisher : changement de compteur -> publication immédiate (hors throttle)

test('streamPresencePublisher : changement de compteur force une publication immédiate', () => {
  const c = makeClock(1000);
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: c.now, throttleMs: 400, emitter: em });
  p.update({ onAir: true, liveListenerCount: 1 }, meterOf(0.4, 0.7)); // t=1000 transition -> publish
  assert.equal(p.getDiagnostics().publishCount, 1);
  c.advance(50); // t=1050 : throttle bloqué, MAIS le compteur change -> publish immédiat
  p.update({ onAir: true, liveListenerCount: 2 }, meterOf(0.4, 0.7));
  assert.equal(p.getDiagnostics().publishCount, 2);
  const cnt = em.calls.filter((x) => x.header === 'stream_listener_count').map((x) => x.values[0]);
  assert.deepEqual(cnt, [1, 2]);
});

// 29. streamPresencePublisher : compteur stable -> pas de publication supplémentaire

test('streamPresencePublisher : compteur stable -> pas de publish hors throttle', () => {
  const c = makeClock(1000);
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: c.now, throttleMs: 400, emitter: em });
  p.update({ onAir: true, liveListenerCount: 2 }, meterOf(0.4, 0.7)); // t=1000 publish
  assert.equal(p.getDiagnostics().publishCount, 1);
  c.advance(50); // t=1050 : même compteur, throttle bloqué -> pas de publish
  p.update({ onAir: true, liveListenerCount: 2 }, meterOf(0.5, 0.8));
  assert.equal(p.getDiagnostics().publishCount, 1);
});

// 30. streamPresencePublisher : stop publie listener_count=0

test('streamPresencePublisher : stop publie stream_listener_count [0]', () => {
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: () => 5000, emitter: em });
  p.update({ onAir: true, liveListenerCount: 5 }, meterOf(0.4, 0.7));
  p.stop();
  const cnt = em.calls.filter((c) => c.header === 'stream_listener_count');
  assert.deepEqual(cnt[cnt.length - 1].values, [0]);
});

// 31. streamPresencePublisher : diagnostics compteur

test('streamPresencePublisher : diagnostics lastPublishedListenerCount / publishCount', () => {
  const c = makeClock(1000);
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: c.now, throttleMs: 400, emitter: em });
  p.update({ onAir: true, liveListenerCount: 2 }, meterOf(0.4, 0.7));
  let d = p.getDiagnostics();
  assert.equal(d.lastPublishedListenerCount, 2);
  assert.equal(d.listenerCountPublishCount, 1);
  assert.equal(d.lastListenerCountPublishedAt, 1000);
  c.advance(50);
  p.update({ onAir: true, liveListenerCount: 2 }, meterOf(0.4, 0.7)); // stable -> pas de publish
  d = p.getDiagnostics();
  assert.equal(d.listenerCountPublishCount, 1, 'pas de nouveau publish de compteur si stable');
});

// 32. streamPresencePublisher : hors antenne -> listener_count forcé à 0

test('streamPresencePublisher : hors antenne -> listener_count forcé à 0', () => {
  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: () => 1000, emitter: em });
  p.update({ onAir: false, liveListenerCount: 5 }, meterOf(0, 0));
  const cnt = em.calls.filter((c) => c.header === 'stream_listener_count');
  assert.deepEqual(cnt[cnt.length - 1].values, [0]);
});

// 33. UI listener : span de compteur présent (id + aria-live + classe)
