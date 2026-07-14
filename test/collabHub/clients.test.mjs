// Tests de caractérisation pour les deux clients Collab-Hub (issue #9).
// Pinent le comportement de connectCollabHub (page publique, observer) et
// connectCollabHubPublisher (Control Room, register/deliver) AVANT unification
// de la frontière — sans vrai serveur (io factory fake). Les contrats observe /
// register / deliver / reconnect sont couverts des deux côtés.
//
// Aucune assertion métier ne sera modifiée pendant le refactor ; ces tests
// doivent rester verts à chaque phase.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectCollabHub } from '../../src/collabHub/socketClient.js';
import { connectCollabHubPublisher } from '../../src/collabHub/publishClient.js';
import { KNOWN_HEADERS, HEARTBEAT_HEADER, OBSERVABLE_HEADERS, STREAM_HEADERS } from '../../src/collabHub/messageRouter.js';

// --- Fake io : socket controllable, espionne emit(), fire() d'événements ---
function fakeIo() {
  const calls = [];
  const io = (url, opts) => {
    const handlers = {};
    const emits = [];
    const sock = {
      id: null,
      connected: false,
      on(evt, cb) { (handlers[evt] ||= []).push(cb); return sock; },
      emit(evt, payload) { emits.push({ evt, payload }); return sock; },
      disconnect() { sock.connected = false; (handlers.disconnect || []).forEach((cb) => cb()); },
      _emits: emits,
      _handlers: handlers,
      // Simule un connect (positionne socket.id + connected + fire 'connect').
      _connect(id = 's-1') { sock.id = id; sock.connected = true; (handlers.connect || []).forEach((cb) => cb()); },
      _reconnect() { (handlers.reconnect || []).forEach((cb) => cb()); },
      _fire(evt, ...args) { (handlers[evt] || []).forEach((cb) => cb(...args)); },
    };
    calls.push({ url, opts, sock });
    return sock;
  };
  return { io, calls, last: () => calls[calls.length - 1] };
}

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

// ===========================================================================
// connectCollabHub — page publique (observer)
// ===========================================================================

test('connectCollabHub : URL socket = serveur + namespace /hub (sans slash initial)', async () => {
  const f = fakeIo();
  await connectCollabHub({
    serverUrl: 'https://server.collab-hub.io/', namespace: '/hub/', username: 'u', authMode: 'anonymous',
    onControl: () => {}, onStatus: () => {}, ioFactory: f.io,
  });
  assert.equal(f.last().url, 'https://server.collab-hub.io/hub');
});

test('connectCollabHub : options socket (transports websocket, reactivation reconnexion, query username)', async () => {
  const f = fakeIo();
  await connectCollabHub({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'alice', authMode: 'anonymous',
    onControl: () => {}, onStatus: () => {}, ioFactory: f.io,
  });
  const o = f.last().opts;
  assert.equal(o.query.username, 'alice');
  assert.deepEqual(o.transports, ['websocket']);
  assert.equal(o.reconnection, true);
  assert.equal(o.reconnectionDelay, 1000);
  assert.equal(o.reconnectionDelayMax, 5000);
});

test('connectCollabHub : mode anonymous -> aucune auth (auth = {})', async () => {
  const f = fakeIo();
  await connectCollabHub({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'u', authMode: 'anonymous',
    onControl: () => {}, onStatus: () => {}, ioFactory: f.io,
  });
  assert.deepEqual(f.last().opts.auth, {});
});

test('connectCollabHub : observe OBSERVABLE_HEADERS au connect (6 contenus + heartbeat)', async () => {
  const f = fakeIo();
  const statuses = [];
  const api = await connectCollabHub({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'u', authMode: 'anonymous',
    onControl: () => {}, onStatus: (s) => statuses.push(s), ioFactory: f.io,
  });
  const sock = f.last().sock;
  sock._connect();
  const observed = sock._emits.filter((e) => e.evt === 'observeControl').map((e) => e.payload.header);
  assert.deepEqual(observed.sort(), [...OBSERVABLE_HEADERS].sort());
  assert.equal(api.observedCount(), OBSERVABLE_HEADERS.length);
  assert.equal(statuses[0], 'connected');
});

test('connectCollabHub : observation idempotente par socket.id (2e observeHeaderOnce no-op)', async () => {
  const f = fakeIo();
  const api = await connectCollabHub({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'u', authMode: 'anonymous',
    onControl: () => {}, onStatus: () => {}, ioFactory: f.io,
  });
  const sock = f.last().sock;
  sock._connect();
  const before = sock._emits.filter((e) => e.evt === 'observeControl').length;
  // Réobserver le même header -> no-op (déjà observé pour ce socket.id).
  assert.equal(api.observeHeaderOnce('sound_title'), false);
  const after = sock._emits.filter((e) => e.evt === 'observeControl').length;
  assert.equal(after, before);
});

test('connectCollabHub : reconnect -> déconnect vide le guard puis réobserve une fois', async () => {
  const f = fakeIo();
  const api = await connectCollabHub({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'u', authMode: 'anonymous',
    onControl: () => {}, onStatus: () => {}, ioFactory: f.io,
  });
  const sock = f.last().sock;
  sock._connect();
  const firstCount = sock._emits.filter((e) => e.evt === 'observeControl').length;
  sock._fire('disconnect');            // vrai disconnect -> guard vidé
  assert.equal(api.isObserved('sound_title'), false);
  sock._connect('s-2');                // nouveau socket.id -> réobserve
  const secondCount = sock._emits.filter((e) => e.evt === 'observeControl').length;
  assert.equal(secondCount - firstCount, OBSERVABLE_HEADERS.length, 'une seule réobservation par header après reconnect');
});

test('connectCollabHub : onControl dispatché depuis l événement socket "control"', async () => {
  const f = fakeIo();
  const received = [];
  await connectCollabHub({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'u', authMode: 'anonymous',
    onControl: (d) => received.push(d), onStatus: () => {}, ioFactory: f.io,
  });
  const sock = f.last().sock;
  sock._connect();
  sock._fire('control', { header: 'sound_title', values: ['X'] });
  assert.deepEqual(received, [{ header: 'sound_title', values: ['X'] }]);
});

test('connectCollabHub : statuts connect/reconnecting/disconnected/error dispatchés', async () => {
  const f = fakeIo();
  const statuses = [];
  await connectCollabHub({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'u', authMode: 'anonymous',
    onControl: () => {}, onStatus: (s) => statuses.push(s), ioFactory: f.io,
  });
  const sock = f.last().sock;
  sock._connect();
  sock._fire('reconnect_attempt');
  sock._fire('disconnect');
  sock._fire('connect_error');
  assert.deepEqual(statuses, ['connected', 'reconnecting', 'disconnected', 'error']);
});

test('connectCollabHub : API retournée expose observe/isObserved/observedCount/forget + socket', async () => {
  const f = fakeIo();
  const api = await connectCollabHub({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'u', authMode: 'anonymous',
    onControl: () => {}, onStatus: () => {}, ioFactory: f.io,
  });
  assert.ok(api.socket, 'socket exposé');
  for (const fn of ['observeHeaderOnce', 'observeKnownHeadersOnce', 'observeObservableHeadersOnce', 'isObserved', 'observedCount', 'forget']) {
    assert.equal(typeof api[fn], 'function', `${fn} exposé`);
  }
});

test('connectCollabHub : getDiagnostics snapshot homogène (connected, socketId, observedHeaders, observedCount)', async () => {
  const f = fakeIo();
  const api = await connectCollabHub({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'u', authMode: 'anonymous',
    onControl: () => {}, onStatus: () => {}, ioFactory: f.io,
  });
  // Avant connexion : connected false, socketId null, rien observé.
  let d = api.getDiagnostics();
  assert.equal(d.connected, false);
  assert.equal(d.socketId, null);
  assert.deepEqual(d.observedHeaders, []);
  assert.equal(d.observedCount, 0);
  // Après connexion : connected true, socketId posé, headers observés.
  f.last().sock._connect('s-xyz');
  d = api.getDiagnostics();
  assert.equal(d.connected, true);
  assert.equal(d.socketId, 's-xyz');
  assert.equal(d.observedCount, OBSERVABLE_HEADERS.length);
  assert.deepEqual(d.observedHeaders.sort(), [...OBSERVABLE_HEADERS].sort());
});

// ===========================================================================
// connectCollabHubPublisher — Control Room (register / deliver / reconnect)
// ===========================================================================

test('connectCollabHubPublisher : URL socket = serveur + namespace /hub', async () => {
  const f = fakeIo();
  await connectCollabHubPublisher({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'cr', ioFactory: f.io,
  });
  assert.equal(f.last().url, 'https://server.collab-hub.io/hub');
});

test('connectCollabHubPublisher : au connect, register chaque STREAM_HEADERS une fois (emit control publish valeur neutre)', async () => {
  const f = fakeIo();
  const c = await connectCollabHubPublisher({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'cr', ioFactory: f.io, now: () => 1000,
  });
  const sock = f.last().sock;
  sock._connect();
  const registers = sock._emits.filter((e) => e.evt === 'control' && e.payload.mode === 'publish');
  assert.equal(registers.length, STREAM_HEADERS.length, 'un register par header de flux au connect');
  assert.deepEqual(registers.map((e) => e.payload.header).sort(), [...STREAM_HEADERS].sort());
  for (const h of STREAM_HEADERS) assert.equal(c.isRegistered(h), true);
});

test('connectCollabHubPublisher : register idempotent par socket.id (pas de re-register au 2e publish du même header)', async () => {
  const f = fakeIo();
  const c = await connectCollabHubPublisher({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'cr', ioFactory: f.io, now: () => 1000,
  });
  const sock = f.last().sock;
  sock._connect();
  const registersBefore = sock._emits.filter((e) => e.evt === 'control').length;
  // Un publish sur un header déjà enregistré = deliver (1 emit), pas de re-register supplémentaire.
  c.publish('stream_onair', [1]);
  const emitsAfter = sock._emits.filter((e) => e.evt === 'control');
  // 1 deliver pour stream_onair, aucun register supplémentaire.
  assert.equal(emitsAfter.length - registersBefore, 1);
  assert.deepEqual(emitsAfter[emitsAfter.length - 1].payload.values, [1]);
});

test('connectCollabHubPublisher : publish avant connect -> mis en file, flush après register', async () => {
  const f = fakeIo();
  let tickFn = null;
  const setTimeoutFn = (fn) => { tickFn = fn; return 0; };
  const c = await connectCollabHubPublisher({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'cr', ioFactory: f.io, now: () => 1000, setTimeoutFn,
  });
  const sock = f.last().sock;
  // Pas connecté : publish mis en file (aucun emit).
  c.publish('stream_onair', [1]);
  assert.equal(sock._emits.length, 0, 'rien émis avant connexion');
  // Connexion -> registerInitial (register) + flush programmé.
  sock._connect();
  // Le flush est différé (setTimeoutFn) -> on le déclenche.
  assert.ok(tickFn, 'flush programmé après register');
  tickFn();
  const delivered = sock._emits.filter((e) => e.evt === 'control' && e.payload.header === 'stream_onair' && Array.isArray(e.payload.values) && e.payload.values[0] === 1);
  assert.ok(delivered.length >= 1, 'valeur en attente livrée après register');
});

test('connectCollabHubPublisher : reconnect -> réenregistre (registered.clear + registerInitial)', async () => {
  const f = fakeIo();
  const c = await connectCollabHubPublisher({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'cr', ioFactory: f.io, now: () => 1000,
    setTimeoutFn: () => 0,
  });
  const sock = f.last().sock;
  sock._connect();
  const registersFirst = sock._emits.filter((e) => e.evt === 'control').length;
  // Reconnect : socket.io fire 'connect' à nouveau -> registered.clear + registerInitial.
  sock._connect('s-2');
  const registersAfter = sock._emits.filter((e) => e.evt === 'control').length;
  assert.equal(registersAfter - registersFirst, STREAM_HEADERS.length, 'réenregistre chaque header après reconnect');
  for (const h of STREAM_HEADERS) assert.equal(c.isRegistered(h), true);
});

test('connectCollabHubPublisher : getDiagnostics expose une snapshot homogène', async () => {
  const f = fakeIo();
  const c = await connectCollabHubPublisher({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'cr', ioFactory: f.io, now: () => 1000,
    setTimeoutFn: () => 0,
  });
  const sock = f.last().sock;
  sock._connect();
  const d = c.getDiagnostics();
  for (const k of ['connected', 'socketId', 'registeredHeaders', 'pendingHeaders', 'registerCount', 'deliverCount']) {
    assert.ok(k in d, `getDiagnostics contient ${k}`);
  }
  assert.equal(d.connected, true);
  assert.equal(d.socketId, 's-1');
  assert.equal(d.registerCount, STREAM_HEADERS.length);
});

test('connectCollabHubPublisher : destroy déconnecte la socket (idempotent)', async () => {
  const f = fakeIo();
  const c = await connectCollabHubPublisher({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'cr', ioFactory: f.io, now: () => 1000,
  });
  const sock = f.last().sock;
  sock._connect();
  assert.doesNotThrow(() => c.destroy());
  assert.equal(sock.connected, false);
  assert.doesNotThrow(() => c.destroy(), 'destroy idempotent');
});

test('connectCollabHubPublisher : headers personnalisés pris en compte au register', async () => {
  const f = fakeIo();
  const c = await connectCollabHubPublisher({
    serverUrl: 'https://server.collab-hub.io', namespace: 'hub', username: 'cr',
    headers: ['stream_onair', 'stream_level'], ioFactory: f.io, now: () => 1000,
  });
  const sock = f.last().sock;
  sock._connect();
  const registers = sock._emits.filter((e) => e.evt === 'control' && e.payload.mode === 'publish');
  assert.equal(registers.length, 2);
  assert.equal(c.isRegistered('stream_onair'), true);
  assert.equal(c.isRegistered('stream_level'), true);
  assert.equal(c.isRegistered('stream_peak'), false);
});
