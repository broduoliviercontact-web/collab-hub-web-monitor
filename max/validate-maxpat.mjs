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

// 6. bouton global + chaîne trigger/pipe
const tbb = boxes.find(b => b.maxclass === 'newobj' && /^t b b$/.test((b.text || '').trim()));
const pipes = boxes.filter(b => b.maxclass === 'newobj' && /^pipe\s+0\s+50\s+100\s+150\s+200$/.test((b.text || '').trim()));
tbb ? pass('trigger "t b b" présent') : fail('trigger "t b b" manquant');
pipes.length >= 2 ? pass(`${pipes.length} pipes 0 50 100 150 200 (register + deliver)`) : fail('pipes de séquencement manquants');
const gb = boxes.find(b => b.maxclass === 'button');
gb ? pass('bouton global présent') : fail('bouton global manquant');

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

console.log(ok ? '\nVALIDATION OK ✅' : '\nVALIDATION ÉCHEC ❌');
process.exit(ok ? 0 : 1);