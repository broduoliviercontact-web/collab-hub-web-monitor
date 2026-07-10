import { io } from 'socket.io-client';
const URL = 'https://server.collab-hub.io';
const U = `Obs_${Math.floor(Math.random()*1000)}`;
console.log(`connect ${URL} as ${U}`);
const s = io(URL, { query: { username: U }, transports: ['websocket'], reconnection: false, timeout: 10000 });
const stop = (l) => { console.log(`\n--- ${l} ---`); try{s.disconnect()}catch{}; process.exit(0); };
s.on('connect', () => {
  console.log(`CONNECTED id=${s.id}`);
  // observer les 5 headers de test
  ['sound_title','sound_author','sound_subtitle','sound_description','sound_link'].forEach(h => s.emit('observeControl', { header: h }));
});
const seen = {};
s.onAny((n, ...a) => {
  if (n === 'ping') return;
  const key = n;
  seen[key] = (seen[key]||0)+1;
  if (['observedControls','availableControls','myControls','serverMessage','control'].includes(n)) {
    console.log(`>> ${n}: ${JSON.stringify(a).slice(0,400)}`);
  }
});
s.on('connect_error', e => stop(`connect_error: ${e.message}`));
setTimeout(() => { console.log('\nobserved/available/myControls seen counts:', JSON.stringify(seen)); stop('timeout 6s'); }, 6000);
