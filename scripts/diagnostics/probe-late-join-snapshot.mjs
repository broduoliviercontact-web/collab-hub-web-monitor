import { io } from 'socket.io-client';

const URL = 'https://server.collab-hub.io/hub';
const HEADER = 'sound_title';

function mk(name) {
  return io(URL, {
    query: { username: name },
    transports: ['websocket'],
    reconnection: false,
    timeout: 8000,
  });
}

const sockets = [];
const events = [];
const t0 = Date.now();

function now() {
  return `${Date.now() - t0}ms`;
}

function stop(label) {
  console.log(`\n--- ${label} ---`);
  for (const s of sockets) {
    try { s.disconnect(); } catch { /* noop */ }
  }
  process.exit(0);
}

function track(socket, label) {
  sockets.push(socket);
  socket.on('connect', () => console.log(`${now()} ${label} CONNECT id=${socket.id} nsp=${socket.nsp}`));
  socket.on('connect_error', (e) => console.log(`${now()} ${label} CONNECT_ERROR ${e && e.message}`));
  socket.onAny((name, ...args) => {
    if (!['observedControls', 'availableControls', 'myControls', 'control', 'serverMessage'].includes(name)) return;
    const entry = { at: now(), label, name, args };
    events.push(entry);
    console.log(`${entry.at} ${label} ${name}: ${JSON.stringify(args).slice(0, 400)}`);
  });
  return socket;
}

const pub = track(mk(`SpikePub_${Math.floor(Math.random() * 1000)}`), 'PUB');

let subA = null;
let subB = null;
let subA2 = null;

setTimeout(() => {
  console.log(`${now()} PUB first publish (register expected): ${HEADER}=v1`);
  pub.emit('control', { mode: 'publish', target: 'all', header: HEADER, values: ['v1'] });
}, 700);

setTimeout(() => {
  subA = track(mk(`LateA_${Math.floor(Math.random() * 1000)}`), 'SUB_A_LATE_AFTER_REGISTER');
}, 1400);

setTimeout(() => {
  if (!subA) return;
  console.log(`${now()} SUB_A observeControl ${HEADER}`);
  subA.emit('observeControl', { header: HEADER });
}, 2200);

setTimeout(() => {
  console.log(`${now()} PUB second publish (deliver expected): ${HEADER}=v2`);
  pub.emit('control', { mode: 'publish', target: 'all', header: HEADER, values: ['v2'] });
}, 3200);

setTimeout(() => {
  subB = track(mk(`LateB_${Math.floor(Math.random() * 1000)}`), 'SUB_B_LATE_AFTER_DELIVER');
}, 4300);

setTimeout(() => {
  if (!subB) return;
  console.log(`${now()} SUB_B observeControl ${HEADER}`);
  subB.emit('observeControl', { header: HEADER });
}, 5100);

setTimeout(() => {
  if (!subA) return;
  console.log(`${now()} SUB_A disconnect (reconnect scenario)`);
  try { subA.disconnect(); } catch { /* noop */ }
}, 6200);

setTimeout(() => {
  subA2 = track(mk(`LateA2_${Math.floor(Math.random() * 1000)}`), 'SUB_A_RECONNECTED');
}, 7000);

setTimeout(() => {
  if (!subA2) return;
  console.log(`${now()} SUB_A_RECONNECTED observeControl ${HEADER}`);
  subA2.emit('observeControl', { header: HEADER });
}, 7800);

setTimeout(() => {
  const controls = events.filter((e) => e.name === 'control').map((e) => ({
    at: e.at,
    label: e.label,
    payload: e.args[0],
  }));
  console.log('\nCONTROL SUMMARY');
  console.log(JSON.stringify(controls, null, 2));
  console.log('\nEXPECTED');
  console.log('- no immediate control for SUB_A after first publish/register only');
  console.log('- SUB_A should receive control only after PUB second publish v2');
  console.log('- if SUB_B or SUB_A_RECONNECTED receive an immediate control after observeControl, the server provides a snapshot/replay');
  console.log('- if they do not, the server does not replay the last delivered value to late joiners');
  stop('timeout 9s');
}, 9000);
