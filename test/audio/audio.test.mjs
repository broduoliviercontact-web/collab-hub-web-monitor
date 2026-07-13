// Tests for the audio domain — split from the former monolithic test/runTests.mjs (issue #11).
// Behaviour is unchanged; tests and fakes were moved verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAudioConstraints, captureAudio } from '../../src/audio/audioCapture.js';
import { computeMeterLevel, createAudioMeter } from '../../src/audio/audioMeter.js';
import { createAudioGraph, clampGain } from '../../src/audio/audioGraph.js';
import {
  isVirtualDevice, normalizeDevice, listAudioInputDevices,
  findPreferredAudioDevice, requestAudioPermission,
} from '../../src/audio/audioDevices.js';
import { createAudioEngine } from '../../src/audio/audioEngine.js';
import { ERROR_CODES } from '../../src/audio/constants.js';
import { requestLiveKitToken, TOKEN_ERRORS } from '../../src/livekit/tokenClient.js';
import { createLiveKitPublisher, PUBLISHER_ERRORS } from '../../src/audio/livekitPublisher.js';
import {
  createStreamStatus, routeStreamControl,
  STALE_MS, SIGNAL_THRESHOLD,
  STREAM_STATUS, STREAM_SIGNAL,
  clamp01, parseOnAir, parseTimestamp,
  normalizeCount, formatListenerCount,
} from '../../src/state/streamStatus.js';
import { STREAM_HEADERS } from '../../src/collabHub/messageRouter.js';
import { countLiveListeners, LISTENER_IDENTITY_PREFIX } from '../../src/audio/listenerCount.js';
import { makeFakeOutputStream, makeFakeMediaTrack } from '../helpers/publisher-fakes.mjs';

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

function makeFakeRoomClass({ connectFail = false, publishFail = false, participants = null } = {}) {
  class FakeRoom {
    constructor(opts) {
      this.opts = opts;
      this._connected = false;
      this._disconnected = false;
      this._listeners = {};
      // Lot 5 : participants distants (Map<String, {identity}>). Défaut : Map vide.
      this.remoteParticipants = participants instanceof Map
        ? participants
        : new Map(participants ? Object.entries(participants) : []);
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
    // Helper test : remplace la Map des participants distants.
    _setRemoteParticipants(obj) {
      this.remoteParticipants = obj instanceof Map ? obj : new Map(Object.entries(obj || {}));
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

test('countLiveListeners : null/undefined -> 0', () => {
  assert.equal(countLiveListeners(null), 0);
  assert.equal(countLiveListeners(undefined), 0);
});

// 2. un listener-* -> 1

test('countLiveListeners : un listener-* -> 1', () => {
  assert.equal(countLiveListeners([{ identity: 'listener-1' }]), 1);
  assert.equal(countLiveListeners({ identity: 'listener-1' }), 1); // objet plat seul
});

// 3. plusieurs -> compte correct

test('countLiveListeners : plusieurs auditeurs -> compte exact', () => {
  const arr = [
    { identity: 'listener-1' }, { identity: 'listener-2' }, { identity: 'listener-3' },
  ];
  assert.equal(countLiveListeners(arr), 3);
});

// 4. performer-* non compté

test('countLiveListeners : performer-* non compté', () => {
  assert.equal(countLiveListeners([{ identity: 'performer-x' }]), 0);
  assert.equal(countLiveListeners([{ identity: 'listener-1' }, { identity: 'performer-2' }]), 1);
});

// 5. participant inconnu (sans identity / autre préfixe) non compté

test('countLiveListeners : participant sans identity ou autre préfixe non compté', () => {
  assert.equal(countLiveListeners([{ name: 'nope' }, {}]), 0);
  assert.equal(countLiveListeners([{ identity: 'guest-1' }, { identity: 'listener-1' }]), 1);
});

// 6. Map LiveKit supportée

test('countLiveListeners : Map<String, Participant> supportée', () => {
  const m = new Map([
    ['s1', { identity: 'listener-1' }],
    ['s2', { identity: 'listener-2' }],
    ['s3', { identity: 'performer-1' }],
  ]);
  assert.equal(countLiveListeners(m), 2);
});

// 7. objet plat clé->participant supporté

test('countLiveListeners : objet plat clé->participant supporté', () => {
  const obj = {
    s1: { identity: 'listener-1' },
    s2: { identity: 'listener-2' },
    s3: { identity: 'performer-1' },
  };
  assert.equal(countLiveListeners(obj), 2);
});

// 8. Set / iterable supporté

test('countLiveListeners : Set itérable supporté', () => {
  const s = new Set([{ identity: 'listener-1' }, { identity: 'listener-2' }]);
  assert.equal(countLiveListeners(s), 2);
});

// 8b. LISTENER_IDENTITY_PREFIX exposé et correct

test('countLiveListeners : LISTENER_IDENTITY_PREFIX = "listener-"', () => {
  assert.equal(LISTENER_IDENTITY_PREFIX, 'listener-');
});

// 9. normalizeCount : décimal tronqué, négatif/invalide -> null

test('publisher : liveListenerCount présent dans le snapshot (entier >= 0)', async () => {
  const RoomClass = makeFakeRoomClass({ participants: { s1: { identity: 'listener-1' }, s2: { identity: 'listener-2' } } });
  const p = makePublisher({ RoomClass });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  const snap = p.getSnapshot();
  assert.equal(snap.liveListenerCount, 2);
});

// 22. publisher : ParticipantConnected met à jour le compteur

test('publisher : participantConnected -> liveListenerCount recalculé', async () => {
  const RoomClass = makeFakeRoomClass({ participants: { s1: { identity: 'listener-1' } } });
  const p = makePublisher({ RoomClass });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  assert.equal(p.getSnapshot().liveListenerCount, 1);
  const room = RoomClass.lastInstance;
  room._setRemoteParticipants({ s1: { identity: 'listener-1' }, s2: { identity: 'listener-2' } });
  room._emit('participantConnected', { identity: 'listener-2' });
  assert.equal(p.getSnapshot().liveListenerCount, 2);
});

// 23. publisher : ParticipantDisconnected met à jour le compteur

test('publisher : participantDisconnected -> liveListenerCount recalculé', async () => {
  const RoomClass = makeFakeRoomClass({ participants: { s1: { identity: 'listener-1' }, s2: { identity: 'listener-2' } } });
  const p = makePublisher({ RoomClass });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  assert.equal(p.getSnapshot().liveListenerCount, 2);
  const room = RoomClass.lastInstance;
  room._setRemoteParticipants({ s1: { identity: 'listener-1' } });
  room._emit('participantDisconnected', { identity: 'listener-2' });
  assert.equal(p.getSnapshot().liveListenerCount, 1);
});

// 24. publisher : reconnected recalcul le compteur

test('publisher : reconnected -> liveListenerCount recalculé', async () => {
  const RoomClass = makeFakeRoomClass({ participants: { s1: { identity: 'listener-1' } } });
  const p = makePublisher({ RoomClass });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  const room = RoomClass.lastInstance;
  room._setRemoteParticipants({ s1: { identity: 'listener-1' }, s2: { identity: 'listener-2' }, s3: { identity: 'listener-3' } });
  room._emit('reconnected');
  assert.equal(p.getSnapshot().liveListenerCount, 3);
});

// 25. publisher : notify appelé sur changement de compteur (subscribe)

test('publisher : changement de compteur notifie les abonnés', async () => {
  const RoomClass = makeFakeRoomClass({ participants: { s1: { identity: 'listener-1' } } });
  const p = makePublisher({ RoomClass });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  let snaps = 0;
  p.subscribe(() => { snaps++; });
  const room = RoomClass.lastInstance;
  room._setRemoteParticipants({ s1: { identity: 'listener-1' }, s2: { identity: 'listener-2' } });
  room._emit('participantConnected', { identity: 'listener-2' });
  assert.ok(snaps >= 1, 'au moins une notification sur ajout d auditeur');
});

// 26. publisher : aucun secret/identité d'auditeur dans le snapshot

test('publisher : snapshot ne contient aucune identité/SID d auditeur', async () => {
  const RoomClass = makeFakeRoomClass({ participants: { s1: { identity: 'listener-secret-1' }, s2: { identity: 'listener-secret-2' } } });
  const p = makePublisher({ RoomClass });
  await p.connect({ password: 'pw', outputStream: makeFakeOutputStream(makeFakeMediaTrack()) });
  const json = JSON.stringify(p.getSnapshot());
  assert.equal(p.getSnapshot().liveListenerCount, 2);
  assert.ok(!/listener-secret|listener-1|listener-2/.test(json), 'aucune identité d auditeur dans le snapshot');
});

// 27. streamPresencePublisher : publie stream_listener_count [N]
