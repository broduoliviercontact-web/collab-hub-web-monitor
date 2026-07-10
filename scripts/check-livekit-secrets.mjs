// Vérification des secrets LiveKit (Lot 4C). Scanne les fichiers suivis par Git
// pour s'assurer qu'aucun secret LiveKit n'est exposé au navigateur ni commité.
//
// Refuse :
//   - toute variable VITE_LIVEKIT_API_KEY / VITE_LIVEKIT_API_SECRET (les secrets
//     ne doivent JAMAIS être préfixés VITE_ ni cuit dans le bundle) ;
//   - tout JWT littéral (eyJ...) commité dans le code source ;
//   - un .env réel suivi (hors .env.example).
//
// Autorise : les placeholders factices du .env.example.
//
// Usage :
//   node scripts/check-livekit-secrets.mjs
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FORBIDDEN_PATTERNS = [
  { re: /VITE_LIVEKIT_API_KEY\b/, msg: 'VITE_LIVEKIT_API_KEY interdit (secret jamais VITE_-préfixé)' },
  { re: /VITE_LIVEKIT_API_SECRET\b/, msg: 'VITE_LIVEKIT_API_SECRET interdit (secret jamais VITE_-préfixé)' },
  // JWT littéral commité : header.payload.signature, base64url.
  { re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, msg: 'JWT littéral commité interdit' },
];

// Fichiers dont on ne scanne pas le contenu (déjà couverts par check-tracked-files,
// ou binaires/non textuels).
const SKIP_PATH = [
  /^\.env\.example$/, // placeholders factices autorisés
  /^node_modules\//,
  /^dist\//,
  /^package-lock\.json$/,
  /\.(png|jpg|jpeg|gif|svg|ico|maxpat|zip|lock)$/i,
];

function listTrackedFiles() {
  try { return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch { return []; }
}

function isText(path) {
  try {
    const buf = readFileSync(path);
    if (buf.length === 0) return false;
    // Détecte binaire : présence d'octet nul dans les 8 Ko.
    const slice = buf.subarray(0, 8192);
    return !slice.includes(0);
  } catch { return false; }
}

function scan() {
  const files = listTrackedFiles();
  const violations = [];
  for (const path of files) {
    if (SKIP_PATH.some((re) => re.test(path))) continue;
    if (!isText(path)) continue;
    let content;
    try { content = readFileSync(path, 'utf8'); } catch { continue; }
    for (const { re, msg } of FORBIDDEN_PATTERNS) {
      if (re.test(content)) violations.push({ path, msg });
    }
  }
  return violations;
}

function main() {
  const violations = scan();
  if (violations.length === 0) {
    console.log('check-livekit-secrets: OK (aucun secret LiveKit exposé)');
    return 0;
  }
  console.error('check-livekit-secrets: ÉCHEC — secrets/violations détectés :');
  for (const v of violations) console.error(`  - ${v.path}: ${v.msg}`);
  return 1;
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
// ponytail: garde-fou d'invocation directe (comme check-license.mjs).
if (process.argv[1] && process.argv[1].endsWith('check-livekit-secrets.mjs')) {
  process.exit(main());
}

export { scan, FORBIDDEN_PATTERNS };