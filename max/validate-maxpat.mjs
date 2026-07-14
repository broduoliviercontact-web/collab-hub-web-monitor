// validate-maxpat.mjs — validation statique du patch Lot 0C.
// Usage: node max/validate-maxpat.mjs   (ou npm run check depuis le spike)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, 'CollabHub_Web_Text_Sender.maxpat');
const REQUIRED_HEADERS = ['sound_show_name', 'sound_title', 'sound_author', 'sound_subtitle', 'sound_description', 'sound_link'];
const IMAGE_HEADERS = [
  'sound_image_url', 'sound_image_visible', 'sound_image_width',
  'sound_image_height', 'sound_image_fit', 'sound_image_position', 'sound_image_slot',
];
const TEXT_VISIBILITY_HEADERS = [
  'sound_show_name_visible', 'sound_title_visible', 'sound_author_visible', 'sound_subtitle_visible',
  'sound_description_visible', 'sound_link_visible',
];

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

// 5. les 6 headers : tosymbol -> prepend push all <header>.
// tosymbol évite que les espaces, crochets et astérisques soient découpés en
// plusieurs valeurs par Max avant l'envoi à Collab-Hub.
function formatterForHeader(header) {
  return boxes.find(b => b.maxclass === 'newobj' && new RegExp(`^prepend push all ${header}$`).test((b.text || '').trim()));
}
for (const h of REQUIRED_HEADERS) {
  const formatter = formatterForHeader(h);
  if (!formatter) {
    fail(`header ${h} manquant`);
    continue;
  }
  const hasToSymbol = lines.some(l => {
    const source = byId[l.patchline.source[0]];
    return l.patchline.destination[0] === formatter.id && /^tosymbol$/.test((source?.text || '').trim());
  });
  hasToSymbol ? pass(`header ${h} présent (tosymbol + prepend)`) : fail(`${h}: tosymbol manquant avant prepend`);
}

// Les contrôles image empruntent le même chemin de transport sûr. Le rendu web
// applique ensuite des listes fermées pour dimensions, cadrage et position.
for (const h of IMAGE_HEADERS) {
  const formatter = formatterForHeader(h);
  if (!formatter) {
    fail(`header image ${h} manquant`);
    continue;
  }
  const hasToSymbol = lines.some(l => {
    const source = byId[l.patchline.source[0]];
    return l.patchline.destination[0] === formatter.id && /^tosymbol$/.test((source?.text || '').trim());
  });
  hasToSymbol ? pass(`header image ${h} présent (tosymbol + prepend)`) : fail(`${h}: tosymbol manquant avant prepend`);
}

for (const h of TEXT_VISIBILITY_HEADERS) {
  const formatter = formatterForHeader(h);
  if (!formatter) {
    fail(`header visibilité ${h} manquant`);
    continue;
  }
  const hasToSymbol = lines.some(l => {
    const source = byId[l.patchline.source[0]];
    return l.patchline.destination[0] === formatter.id && /^tosymbol$/.test((source?.text || '').trim());
  });
  hasToSymbol ? pass(`header visibilité ${h} présent (tosymbol + prepend)`) : fail(`${h}: tosymbol manquant avant prepend`);
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
const SEND_NAME = 'ch_pub6';
const sends = boxes.filter(b => b.maxclass === 'newobj' && new RegExp(`^send\\s+${SEND_NAME}$`).test((b.text || '').trim()));
sends.length === 1 ? pass(`send ${SEND_NAME} présent (1)`) : fail(`send ${SEND_NAME} attendu unique, trouvé ${sends.length}`);
const delay = boxes.find(b => b.maxclass === 'newobj' && /^delay\s+(\d+)\s*$/.exec((b.text || '').trim()));
delay ? pass(`delay de livraison présent (${delay.text.trim()})`) : fail('delay de livraison manquant (ex: "delay 300")');
const receives = boxes.filter(b => b.maxclass === 'newobj' && new RegExp(`^receive\\s+${SEND_NAME}$`).test((b.text || '').trim()));
receives.length === 6 ? pass(`6 receive ${SEND_NAME} (un par header)`) : fail(`6 receive ${SEND_NAME} attendus, trouvé ${receives.length}`);

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

// 6d. chaque receive -> une value box distincte -> tosymbol -> push ;
// 6 headers x 2 passages = 12 déclenchements.
let receiveToPublish = 0;
for (const r of receives) {
  const rDest = destsOf(r.id, 0);
  const vb = rDest.map(id => byId[id]).find(b => b && b.maxclass === 'message' && !/^—/.test(b.text || ''));
  if (vb) {
    // value box -> tosymbol -> prepend ?
    const vbOuts = destsOf(vb.id, 0);
    const symbolizer = vbOuts.map(id => byId[id]).find(b => b && b.maxclass === 'newobj' && /^tosymbol$/.test((b.text || '').trim()));
    const pub = symbolizer && destsOf(symbolizer.id, 0).map(id => byId[id]).find(b => b && /^prepend push all sound_/.test((b.text || '').trim()));
    if (pub) receiveToPublish++;
  }
}
receiveToPublish === 6 ? pass('6 receive -> value box -> tosymbol -> push (12 déclenchements sur 2 passages)') : fail(`${receiveToPublish}/6 receive câblés vers un push sûr`);

// Groupe image indépendant : sept valeurs, même double passage register/deliver.
const IMAGE_SEND_NAME = 'ch_img7';
const imageSends = boxes.filter(b => b.maxclass === 'newobj' && new RegExp(`^send\\s+${IMAGE_SEND_NAME}$`).test((b.text || '').trim()));
const imageReceives = boxes.filter(b => b.maxclass === 'newobj' && new RegExp(`^receive\\s+${IMAGE_SEND_NAME}$`).test((b.text || '').trim()));
imageSends.length === 1 ? pass(`send ${IMAGE_SEND_NAME} présent (1)`) : fail(`send ${IMAGE_SEND_NAME} attendu unique, trouvé ${imageSends.length}`);
imageReceives.length === 7 ? pass(`7 receive ${IMAGE_SEND_NAME} (un par header image)`) : fail(`7 receive ${IMAGE_SEND_NAME} attendus, trouvé ${imageReceives.length}`);
const imageTrigger = boxes.find(b => b.maxclass === 'newobj' && /^t b b$/.test((b.text || '').trim())
  && destsOf(b.id, 0).some(id => imageSends.some(s => s.id === id)));
const imageDelay = imageTrigger && destsOf(imageTrigger.id, 1).map(id => byId[id]).find(b => b && /^delay\s+300$/.test((b.text || '').trim()));
if (!imageTrigger) fail('trigger image t b b -> send ch_img7 manquant');
else if (!imageDelay || !destsOf(imageDelay.id, 0).some(id => imageSends.some(s => s.id === id))) fail('double passage image (delay 300 -> send ch_img7) manquant');
else pass('double passage image register/deliver présent');
let imageReceiveToPublish = 0;
for (const r of imageReceives) {
  const valueBox = destsOf(r.id, 0).map(id => byId[id]).find(b => b && b.maxclass === 'message');
  const symbolizer = valueBox && destsOf(valueBox.id, 0).map(id => byId[id]).find(b => b && /^tosymbol$/.test((b.text || '').trim()));
  const pub = symbolizer && destsOf(symbolizer.id, 0).map(id => byId[id]).find(b => b && /^prepend push all sound_image_/.test((b.text || '').trim()));
  if (pub) imageReceiveToPublish++;
}
imageReceiveToPublish === 7 ? pass('7 receive image -> value box -> tosymbol -> push (14 déclenchements sur 2 passages)') : fail(`${imageReceiveToPublish}/7 receive image câblés vers un push sûr`);

// Groupe visibilité texte : six valeurs, même double passage register/deliver.
const TEXT_VISIBILITY_SEND_NAME = 'ch_vis6';
const textVisibilitySends = boxes.filter(b => b.maxclass === 'newobj' && new RegExp(`^send\\s+${TEXT_VISIBILITY_SEND_NAME}$`).test((b.text || '').trim()));
const textVisibilityReceives = boxes.filter(b => b.maxclass === 'newobj' && new RegExp(`^receive\\s+${TEXT_VISIBILITY_SEND_NAME}$`).test((b.text || '').trim()));
textVisibilitySends.length === 1 ? pass(`send ${TEXT_VISIBILITY_SEND_NAME} présent (1)`) : fail(`send ${TEXT_VISIBILITY_SEND_NAME} attendu unique, trouvé ${textVisibilitySends.length}`);
textVisibilityReceives.length === 6 ? pass(`6 receive ${TEXT_VISIBILITY_SEND_NAME} (un par préférence)`) : fail(`6 receive ${TEXT_VISIBILITY_SEND_NAME} attendus, trouvé ${textVisibilityReceives.length}`);
const textVisibilityTrigger = boxes.find(b => b.maxclass === 'newobj' && /^t b b$/.test((b.text || '').trim())
  && destsOf(b.id, 0).some(id => textVisibilitySends.some(s => s.id === id)));
const textVisibilityDelay = textVisibilityTrigger && destsOf(textVisibilityTrigger.id, 1).map(id => byId[id]).find(b => b && /^delay\s+300$/.test((b.text || '').trim()));
if (!textVisibilityTrigger) fail('trigger visibilité t b b -> send ch_vis6 manquant');
else if (!textVisibilityDelay || !destsOf(textVisibilityDelay.id, 0).some(id => textVisibilitySends.some(s => s.id === id))) fail('double passage visibilité (delay 300 -> send ch_vis6) manquant');
else pass('double passage visibilité texte register/deliver présent');
let textVisibilityReceiveToPublish = 0;
for (const r of textVisibilityReceives) {
  const valueBox = destsOf(r.id, 0).map(id => byId[id]).find(b => b && b.maxclass === 'message');
  const symbolizer = valueBox && destsOf(valueBox.id, 0).map(id => byId[id]).find(b => b && /^tosymbol$/.test((b.text || '').trim()));
  const pub = symbolizer && destsOf(symbolizer.id, 0).map(id => byId[id]).find(b => b && /^prepend push all sound_.*_visible$/.test((b.text || '').trim()));
  if (pub) textVisibilityReceiveToPublish++;
}
textVisibilityReceiveToPublish === 6 ? pass('6 receive visibilité -> value box -> tosymbol -> push (12 déclenchements sur 2 passages)') : fail(`${textVisibilityReceiveToPublish}/6 receive visibilité câblés vers un push sûr`);

// 7. chaque formatter va vers ch.client + print.
for (const h of REQUIRED_HEADERS) {
  const pub = formatterForHeader(h);
  if (!pub) continue;
  const outs = lines.filter(l => l.patchline.source[0] === pub.id).map(l => l.patchline.destination[0]);
  const toClient = outs.some(id => byId[id] && byId[id].maxclass === 'bpatcher' && /ch\.client/i.test(byId[id].name || ''));
  const toPrint = outs.some(id => byId[id] && /print\s+CollabHub-Web-Sender/.test(byId[id].text || ''));
  if (!toClient) fail(`${h}: push non câblé vers ch.client`);
  if (!toPrint) fail(`${h}: push non câblé vers print CollabHub-Web-Sender`);
}
for (const h of IMAGE_HEADERS) {
  const pub = formatterForHeader(h);
  if (!pub) continue;
  const outs = lines.filter(l => l.patchline.source[0] === pub.id).map(l => l.patchline.destination[0]);
  const toClient = outs.some(id => byId[id] && byId[id].maxclass === 'bpatcher' && /ch\.client/i.test(byId[id].name || ''));
  const toPrint = outs.some(id => byId[id] && /print\s+CollabHub-Web-Sender/.test(byId[id].text || ''));
  if (!toClient) fail(`${h}: push non câblé vers ch.client`);
  if (!toPrint) fail(`${h}: push non câblé vers print CollabHub-Web-Sender`);
}
for (const h of TEXT_VISIBILITY_HEADERS) {
  const pub = formatterForHeader(h);
  if (!pub) continue;
  const outs = lines.filter(l => l.patchline.source[0] === pub.id).map(l => l.patchline.destination[0]);
  const toClient = outs.some(id => byId[id] && byId[id].maxclass === 'bpatcher' && /ch\.client/i.test(byId[id].name || ''));
  const toPrint = outs.some(id => byId[id] && /print\s+CollabHub-Web-Sender/.test(byId[id].text || ''));
  if (!toClient) fail(`${h}: push non câblé vers ch.client`);
  if (!toPrint) fail(`${h}: push non câblé vers print CollabHub-Web-Sender`);
}

// 8. boutons individuels conservés (un par header -> value box)
const indButtons = boxes.filter(b => b.maxclass === 'button');
indButtons.length >= 1 ? pass(`${indButtons.length} bouton(s) (global + individuels)`) : fail('aucun bouton');

// 9. HEARTBEAT (Lot 3B) : sound_heartbeat, metro 10000, start/stop sur connected
const HB = 'sound_heartbeat';
const hbPub = boxes.find(b => b.maxclass === 'message' && new RegExp(`^push all ${HB}\\s+1$`).test((b.text || '').trim()));
hbPub ? pass('header technique sound_heartbeat (push all sound_heartbeat 1)') : fail('push all sound_heartbeat 1 manquant');
const metro = boxes.find(b => b.maxclass === 'newobj' && /^metro\s+10000$/.test((b.text || '').trim()));
metro ? pass('metro 10000 présent') : fail('metro 10000 manquant (fréquence heartbeat 10 s)');
// connected vient de "route serverMessage connected" (outlet 1) -> un newobj route ... connected
const routeConn = boxes.find(b => b.maxclass === 'newobj' && /^route\s+serverMessage\s+connected$/.test((b.text || '').trim()));
routeConn ? pass('route serverMessage connected présent (signal connected)') : fail('route serverMessage connected manquant');
// démarrage/arrêt : connected (route outlet 1) doit piloter le metro via un toggle (ou directement)
if (routeConn && metro) {
  const connDests = lines.filter(l => l.patchline.source[0] === routeConn.id && l.patchline.source[1] === 1).map(l => l.patchline.destination[0]);
  const drivesMetro = connDests.some(id => {
    const t = byId[id];
    if (!t) return false;
    if (t.maxclass === 'toggle') {
      // toggle -> metro ?
      return lines.some(l => l.patchline.source[0] === id && l.patchline.destination[0] === metro.id);
    }
    return id === metro.id; // branché directement
  });
  drivesMetro ? pass('connected (route out1) pilote le metro (via toggle ou direct)') : fail('connected ne démarre/arrête pas le metro');
}
// le push heartbeat va vers ch.client + print (comme les contenus)
if (hbPub) {
  const outs = lines.filter(l => l.patchline.source[0] === hbPub.id).map(l => l.patchline.destination[0]);
  const toClient = outs.some(id => byId[id] && byId[id].maxclass === 'bpatcher' && /ch\.client/i.test(byId[id].name || ''));
  const toPrint = outs.some(id => byId[id] && /print\s+CollabHub-Web-Sender/.test(byId[id].text || ''));
  if (!toClient) fail('sound_heartbeat push non câblé vers ch.client');
  if (!toPrint) fail('sound_heartbeat push non câblé vers print CollabHub-Web-Sender');
  if (toClient && toPrint) pass('sound_heartbeat push -> ch.client + print');
}
// sound_heartbeat ne doit PAS apparaître parmi les push de contenu ($1)
const hbAsContent = boxes.find(b => b.maxclass === 'message' && /push all sound_heartbeat \$1/.test(b.text || ''));
hbAsContent ? fail('sound_heartbeat ne doit pas utiliser $1 (valeur constante 1)') : pass('sound_heartbeat poussé en valeur constante (pas $1)');

console.log(ok ? '\nVALIDATION OK ✅' : '\nVALIDATION ÉCHEC ❌');
process.exit(ok ? 0 : 1);
