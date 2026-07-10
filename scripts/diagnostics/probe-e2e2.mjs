import { io } from 'socket.io-client';
const H='sound_title';
const mk=(url,name)=>io(url,{query:{username:name},transports:['websocket'],reconnection:false,timeout:8000});
const pub=mk('https://server.collab-hub.io/hub','Pub');
const subHub=mk('https://server.collab-hub.io/hub','SubH');
const subRoot=mk('https://server.collab-hub.io','SubR');
const stop=(l)=>{console.log(`\n--- ${l} ---`);[pub,subHub,subRoot].forEach(s=>{try{s.disconnect()}catch{}});process.exit(0)};
let ready=0; const bump=()=>{ready++;if(ready===3){
  console.log('all connected. subHub.nsp='+subHub.nsp+' subRoot.nsp='+subRoot.nsp);
  // 1) publish first to REGISTER the control
  setTimeout(()=>{console.log('t0.3s PUB register: control publish '+H+' v1');pub.emit('control',{mode:'publish',target:'all',header:H,values:['v1']});},300);
  // 2) observers observe AFTER registration
  setTimeout(()=>{console.log('t1.0s SUB observeControl '+H);subHub.emit('observeControl',{header:H});subRoot.emit('observeControl',{header:H});},1000);
  // 3) publish again -> should push to observers
  setTimeout(()=>{console.log('t2.0s PUB update: control publish '+H+' v2');pub.emit('control',{mode:'publish',target:'all',header:H,values:['v2']});},2000);
}};
[pub,subHub,subRoot].forEach((s,i)=>s.on('connect',()=>{console.log(`connected [${['PUB','SUB_HUB','SUB_ROOT'][i]}] nsp=${s.nsp}`);bump();}));
const filt=(n)=>n!=='ping'&&n!=='serverMessage';
subHub.onAny((n,...a)=>{if(filt(n))console.log(`SUB_HUB onAny ${n}: ${JSON.stringify(a).slice(0,180)}`);});
subRoot.onAny((n,...a)=>{if(filt(n))console.log(`SUB_ROOT onAny ${n}: ${JSON.stringify(a).slice(0,180)}`);});
setTimeout(()=>stop('timeout 5s'),5000);
