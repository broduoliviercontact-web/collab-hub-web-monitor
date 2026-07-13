// Tests for the livekit domain — split from the former monolithic test/runTests.mjs (issue #11).
// Behaviour is unchanged; tests and fakes were moved verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestLiveKitToken, TOKEN_ERRORS } from '../../src/livekit/tokenClient.js';
import {
  createSessionValue, verifySessionValue, validateSessionConfig,
  setCookieString, clearCookieString, parseCookies, readSessionCookie,
  isSecureEnv, COOKIE_NAME, SESSION_TTL_SECONDS,
} from '../../src/server/controlRoomSession.js';
import { createLiveKitListener, LISTENER_ERRORS, DEFAULT_VOLUME, ATTENUATION_DB, ATTENUATION_GAIN, scanRemoteAudio, DEFAULT_RETRY_DELAYS } from '../../src/livekit/livekitListener.js';
import { makeFakeListenerTokenClient, makeListener, makeFakeListenerRoomClass, makeFakeRemoteTrack, makeFakeAudioSink, makeFakeListenerRoomSubscribedPub } from '../helpers/listener-fakes.mjs';
import { flush } from '../helpers/flush.mjs';

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

function cookieValue(setCookie) {
  return setCookie.split(';')[0].slice(COOKIE_NAME.length + 1);
}

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

test('enceinte : ATTENUATION_GAIN = 10^(-20/20) = 0.1', () => {
  assert.equal(ATTENUATION_GAIN, 0.1);
  assert.equal(ATTENUATION_DB, -20);
});


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

