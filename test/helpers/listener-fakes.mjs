// Shared test fakes for the listener-fakes concern — extracted from the former monolithic runTests.mjs.
// Used by >=2 domain suites (see issue #11). No tests live here.
import { test } from 'node:test';
import { requestLiveKitToken, TOKEN_ERRORS } from '../../src/livekit/tokenClient.js';
import { createLiveKitListener, LISTENER_ERRORS, DEFAULT_VOLUME, ATTENUATION_DB, ATTENUATION_GAIN, scanRemoteAudio, DEFAULT_RETRY_DELAYS } from '../../src/livekit/livekitListener.js';

export function makeFakeRemoteTrack({ kind = 'audio', name = 'program-audio', sid = 'tr-1' } = {}) {
  return {
    kind, name, sid, source: 'microphone',
    _attached: [], _detached: [],
    attach(el) { this._attached.push(el); return el; },
    detach(el) { this._detached.push(el); return el; },
  };
}

export function makeFakeAudioSink({ playMode = null } = {}) {
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

export function makeFakeListenerRoomClass({ connectFail = false } = {}) {
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

export function makeFakeListenerTokenClient({ identity = 'listener-test', fail = false } = {}) {
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

export function makeListener({ tokenClient, RoomClass, audioSink, connectFail, ...rest } = {}) {
  return createLiveKitListener({
    tokenClient: tokenClient || makeFakeListenerTokenClient(),
    RoomClass: RoomClass || makeFakeListenerRoomClass({ connectFail }),
    audioSink: audioSink || makeFakeAudioSink(),
    now: () => 1000,
    ...rest,
  });
}

export function makeFakeListenerRoomSubscribedPub({
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
