import { io } from 'socket.io-client';
// Max CH-Client par défaut: io("https://server.collab-hub.io/hub") (config.json namespace "hub")
const URL = 'https://server.collab-hub.io/hub';
console.log(`TEST namespace /hub: connect ${URL} (websocket-only, comme CH-ClientScript.js:257)`);
const s = io(URL, { query:{username:`HubTest_${Math.floor(Math.random()*1000)}`}, transports:['websocket'], reconnection:false, timeout:8000 });
const stop=(l)=>{console.log(`--- ${l} ---`);try{s.disconnect()}catch{};process.exit(0)};
s.on('connect',()=>{console.log(`CONNECTED id=${s.id} nsp=${s.nsp}`);stop('connect ok')});
s.onAny((n,...a)=>{ if(n!=='ping') console.log(`onAny ${n}: ${JSON.stringify(a).slice(0,200)}`); });
s.on('connect_error',e=>stop(`connect_error: ${e.message} desc=${JSON.stringify(e.description||'')}`));
setTimeout(()=>stop('timeout 7s'),7000);
