// Vérifie la présence et la cohérence de la licence GPL-3.0-only (Lot 3E/3F).
// Contrôles factuels, indépendants de la mise en page du texte de la licence.
// Fonctions pures exportées -> testables sans toucher aux vrais fichiers ;
// le CLI ne s'exécute que lorsque le script est lancé directement.
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Marqueurs attendus dans le texte officiel de la GNU GPL v3 (Lot 3E).
export const LICENSE_MARKERS = [
  'GNU GENERAL PUBLIC LICENSE',
  'Version 3, 29 June 2007',
  'END OF TERMS AND CONDITIONS',
];

export const REQUIRED = {
  name: 'collab-hub-web-monitor',
  version: '1.0.1',
  license: 'GPL-3.0-only',
};

// Vérifie les métadonnées à partir de données déjà chargées (pure, testable).
// license / readme : strings ou null (absent). pkg / lock : objets parsés.
// Retourne { ok, errors } ; ok=true si errors est vide.
export function verifyMetadata({ license, pkg, readme, lock }) {
  const errors = [];

  // --- LICENSE ---
  if (!license) {
    errors.push('LICENSE absent ou vide');
  } else {
    if (!license.trim()) errors.push('LICENSE est vide');
    for (const m of LICENSE_MARKERS) {
      if (!license.includes(m)) errors.push(`LICENSE ne contient pas "${m}"`);
    }
    if (license.includes('GPL-3.0-or-later')) {
      errors.push(`LICENSE contient l'identifiant SPDX "GPL-3.0-or-later"`);
    }
  }

  // --- package.json ---
  if (!pkg) {
    errors.push('package.json non fourni');
  } else {
    if (pkg.name !== REQUIRED.name) errors.push(`package.json name === "${REQUIRED.name}" (got "${pkg.name}")`);
    if (pkg.version !== REQUIRED.version) errors.push(`package.json version === "${REQUIRED.version}" (got "${pkg.version}")`);
    if (pkg.license !== REQUIRED.license) errors.push(`package.json license === "${REQUIRED.license}" (got "${pkg.license}")`);
    if (pkg.license === 'GPL-3.0-or-later') errors.push('package.json license ne doit pas être "GPL-3.0-or-later"');
  }

  // --- README ---
  if (!readme) {
    errors.push('README.md absent ou vide');
  } else if (!readme.includes(REQUIRED.license)) {
    errors.push(`README.md ne contient pas "${REQUIRED.license}"`);
  }

  // --- package-lock.json cohérent avec package.json ---
  if (lock && pkg) {
    if (lock.name && lock.name !== pkg.name) errors.push(`package-lock.json name (${lock.name}) != package.json name (${pkg.name})`);
    if (lock.version && lock.version !== pkg.version) errors.push(`package-lock.json version (${lock.version}) != package.json version (${pkg.version})`);
    const root = lock.packages && lock.packages[''];
    if (root) {
      if (root.name && root.name !== pkg.name) errors.push(`package-lock packages[""].name (${root.name}) != package.json name`);
      if (root.version && root.version !== pkg.version) errors.push(`package-lock packages[""].version (${root.version}) != package.json version`);
      if (root.license && root.license !== pkg.license) errors.push(`package-lock packages[""].license (${root.license}) != package.json license`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// Charge les fichiers réels depuis `root` (utilisé par le CLI uniquement).
export function loadRepo(root) {
  const read = (p) => existsSync(`${root}/${p}`) ? readFileSync(`${root}/${p}`, 'utf8') : null;
  const license = read('LICENSE');
  const readme = read('README.md');
  let pkg = null, lock = null;
  try { pkg = JSON.parse(read('package.json')); } catch (e) { /* garde null */ }
  try {
    const raw = read('package-lock.json');
    if (raw) lock = JSON.parse(raw);
  } catch (e) { /* garde null */ }
  return { license, pkg, readme, lock };
}

function main() {
  const { ok, errors } = verifyMetadata(loadRepo(process.cwd()));
  if (ok) {
    console.log(`OK  : licence GPL-3.0-only, métadonnées du package et README cohérents.`);
    process.exit(0);
  }
  console.error('FAIL : vérification de licence / métadonnées :');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

// CLI uniquement quand lancé directement (pas lors d'un import de test).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}