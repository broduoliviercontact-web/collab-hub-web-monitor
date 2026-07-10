// Vérifie qu'aucun fichier sensible n'est suivi par Git (Lot 3C).
// Fonctionne sur la liste renvoyée par `git ls-files` (fichiers réellement
// suivis), pas sur le working tree : un .env présent mais gitignore reste OK.
//
// Usage :
//   node scripts/check-tracked-files.mjs            # utilise `git ls-files`
//   node scripts/check-tracked-files.mjs <file>      # lit une liste depuis un fichier
//   git ls-files | node scripts/check-tracked-files.mjs -  # lit stdin "-"
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Patterns interdits (chemins suivis par Git). .env.example est autorisé.
const FORBIDDEN = [
  /^\.env$/,            // secrets réels
  /^\.env\.local$/,
  /^\.env\..+$/,        // .env.production, .env.dev, etc. (sauf .env.example)
  /^node_modules\//,
  /^dist\//,
  /\.DS_Store$/,
  /^\.claude\//,
  /^\.spike-research\//,
  /^\.vercel\//,
  /~$/,                // backups éditeur / fichiers temporaires
  /\.bak$/i,           // backups génériques
  /\.tmp$/i,           // fichiers temporaires
];

function isForbidden(path) {
  if (path === '.env.example') return false; // explicitement autorisé
  return FORBIDDEN.some((re) => re.test(path));
}

function readStdin() {
  // Sync read de stdin (entrée bornée par le tube git ls-files).
  // ponytail: fs.readFileSync(0) lit tout stdin en une fois.
  try { return readFileSync(0, 'utf8').split('\n').filter(Boolean); }
  catch { return []; }
}

const argv = process.argv.slice(2);
let files;
if (argv[0] === '-') files = readStdin();
else if (argv.length) files = readFileSync(argv[0], 'utf8').split('\n').filter(Boolean);
else files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);

const offenders = files.filter(isForbidden);
if (offenders.length === 0) {
  console.log(`OK  : ${files.length} fichiers suivis, aucun fichier sensible.`);
  process.exit(0);
}
console.error('FAIL : fichiers sensibles suivis par Git :');
for (const f of offenders) console.error('  - ' + f);
process.exit(1);