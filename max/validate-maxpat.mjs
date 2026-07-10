// validate-maxpat.mjs — validation statique du patch Lot 0C.
// Usage: node max/validate-maxpat.mjs   (ou npm run check depuis le spike)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, 'CollabHub_Web_Text_Sender.maxpat');
const REQUIRED_HEADERS = ['sound_title', 'sound_author', 'sound_subtitle', 'sound_description', 'sound_link'];

let j;
try { j = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error('FAIL: JSON invalide —', e.message); process.exit(1); }

const p = j.patcher;
const boxes = p.boxes.map(b => b.box);
const ids = boxes.map(b => b.id);
const byId = Object.fromEntries(boxes.map(b => [b.id, b]));
const lines = p.lines || [];

let ok = true;
const fail = (m) => { console.error('FAIL:', m); ok = false; };
const pass = (m) => console.log('OK  :', m);

// 1. ids uniques
const dup = ids.find((id, i) => ids.indexOf(id) !== i);
dup ? fail(`id dupliqué: ${dup}`) : pass(`${ids.length} boxes, ids uniques`);

// 2. lines -> objets existants (clé Max officielle "lines", cf. ch.client.maxpat)
let badLines = 0;
for (const l of lines) {
  const { source, destination } = l.patchline;
  if (!byId[source[0]]) { fail(`patchline source inconnue: ${source[0]}`); badLines++; }
  if (!byId[destination[0]]) { fail(`patchline destination inconnue: ${destination[0]}`); badLines++; }
  // index d'outlet/inlet dans les limites
  const sb = byId[source[0]]; if (sb && source[1] >= sb.numoutlets) fail(`outlet ${source[1]} hors-limites sur ${source[0]} (${sb.numoutlets} outlets)`);
  const db = byId[destination[0]]; if (db && destination[1] >= db.numinlets) fail(`inlet ${destination[1]} hors-limites sur ${destination[0]} (${db.numinlets} inlets)`);
}
badLines === 0 && pass(`${lines.length} lines, toutes les extrémités existent`);

// 3. module CH-Client (bpatcher ch.client.maxpat)
const client = boxes.find(b => b.maxclass === 'bpatcher' && /ch\.client/i.test(b.name || ''));
client ? pass(`module Collab-Hub présent: bpatcher "${client.name}"`) : fail('aucun bpatcher ch.client.maxpat');

// 4. print CollabHub-Web-Sender
const printSend = boxes.find(b => b.maxclass === 'newobj' && /print\s+CollabHub-Web-Sender/.test(b.text || ''));
printSend ? pass('print CollabHub-Web-Sender présent') : fail('print CollabHub-Web-Sender manquant');

// 5. les 5 headers (publish all <header> $1)
for (const h of REQUIRED_HEADERS) {
  const m = boxes.find(b => b.maxclass === 'message' && new RegExp(`publish all ${h}\\s+\\$1`).test(b.text || ''));
  m ? pass(`header ${h} présent`) : fail(`header ${h} manquant`);
}

// 6. bouton global + séquence double passage (register + deliver)
const tbb = boxes.find(b => b.maxclass === 'newobj' && /^t b b$/.test((b.text || '').trim()));
tbb ? pass('trigger "t b b" présent') : fail('trigger "t b b" manquant');
const gb = boxes.find(b => b.maxclass === 'button');
gb ? pass('bouton global présent') : fail('bouton global manquant');

// 6a. ancien mécanisme multi-outlet interdit (pipe 0 50 100 150 200)
const badPipes = boxes.filter(b => b.maxclass === 'newobj' && /^pipe\s+\d+(\s+\d+){4}$/.test((b.text || '').trim()));
badPipes.length === 0 ? pass('aucun pipe multi-outlet (ancien mécanisme retiré)') : fail(`${badPipes.length} pipe(s) multi-outlet restant(s): ${badPipes.map(b => b.id).join(', ')}`);

// 6b. send/receive nommé + delay de livraison
const SEND_NAME = 'ch_pub5';
const sends = boxes.filter(b => b.maxclass === 'newobj' && new RegExp(`^send\\s+${SEND_NAME}$`).test((b.text || '').trim()));
sends.length === 1 ? pass(`send ${SEND_NAME} présent (1)`) : fail(`send ${SEND_NAME} attendu unique, trouvé ${sends.length}`);
const delay = boxes.find(b => b.maxclass === 'newobj' && /^delay\s+(\d+)\s*$/.exec((b.text || '').trim()));
delay ? pass(`delay de livraison présent (${delay.text.trim()})`) : fail('delay de livraison manquant (ex: "delay 300")');
const receives = boxes.filter(b => b.maxclass === 'newobj' && new RegExp(`^receive\\s+${SEND_NAME}$`).test((b.text || '').trim()));
receives.length === 5 ? pass(`5 receive ${SEND_NAME} (un par header)`) : fail(`5 receive ${SEND_NAME} attendus, trouvé ${receives.length}`);

// 6c. deux passages : t b b out0 -> send (register) ; t b b out1 -> delay -> send (deliver)
function destsOf(id, outlet) { return lines.filter(l => l.patchline.source[0] === id && l.patchline.source[1] === outlet).map(l => l.patchline.destination[0]); }
if (tbb) {
  const regPass = destsOf(tbb.id, 0).some(id => sends.some(s => s.id === id));
  regPass ? pass('passage enregistrement : t b b out0 -> send') : fail('passage enregistrement manquant (t b b out0 -> send)');
  const deliverToDelay = destsOf(tbb.id, 1).some(id => delay && id === delay.id);
  deliverToDelay ? pass('passage livraison : t b b out1 -> delay') : fail('passage livraison manquant (t b b out1 -> delay)');
  const delayToSend = delay && destsOf(delay.id, 0).some(id => sends.some(s => s.id === id));
  delayToSend ? pass('delay -> send (livraison retardée)') : fail('delay non câblé vers send');
}

// 6d. chaque receive -> une value box distincte -> publish ; 5 headers x 2 passages = 10 déclenchements
const valueBoxes = boxes.filter(b => b.maxclass === 'message' && !/^publish\s+all\s+/.test(b.text || '') && !/^—/.test(b.text || ''));
let receiveToPublish = 0;
for (const r of receives) {
  const rDest = destsOf(r.id, 0);
  const vb = rDest.map(id => byId[id]).find(b => b && b.maxclass === 'message' && !/^publish\s+all\s+/.test(b.text || ''));
  if (vb) {
    // value box -> publish ?
    const vbOuts = destsOf(vb.id, 0);
    const pub = vbOuts.map(id => byId[id]).find(b => b && /^publish\s+all\s+/.test(b.text || ''));
    if (pub) receiveToPublish++;
  }
}
receiveToPublish === 5 ? pass('5 receive -> value box -> publish (10 déclenchements sur 2 passages)') : fail(`${receiveToPublish}/5 receive câblés vers une publish`);

// 7. chaque publish reçoit une valeur ($1) et va vers ch.client + print
for (const h of REQUIRED_HEADERS) {
  const pub = boxes.find(b => b.maxclass === 'message' && new RegExp(`publish all ${h}\\s+\\$1`).test(b.text || ''));
  if (!pub) continue;
  const outs = lines.filter(l => l.patchline.source[0] === pub.id).map(l => l.patchline.destination[0]);
  const toClient = outs.some(id => byId[id] && byId[id].maxclass === 'bpatcher' && /ch\.client/i.test(byId[id].name || ''));
  const toPrint = outs.some(id => byId[id] && /print\s+CollabHub-Web-Sender/.test(byId[id].text || ''));
  if (!toClient) fail(`${h}: publish non câblé vers ch.client`);
  if (!toPrint) fail(`${h}: publish non câblé vers print CollabHub-Web-Sender`);
}

// 8. boutons individuels conservés (un par header -> value box)
const indButtons = boxes.filter(b => b.maxclass === 'button');
indButtons.length >= 1 ? pass(`${indButtons.length} bouton(s) (global + individuels)`) : fail('aucun bouton');

console.log(ok ? '\nVALIDATION OK ✅' : '\nVALIDATION ÉCHEC ❌');
process.exit(ok ? 0 : 1);