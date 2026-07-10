// Vérifie la présence et la cohérence de la licence GPL-3.0-only (Lot 3E).
// Contrôles factuels, indépendants de la mise en page du texte de la licence.
import { readFileSync, existsSync } from 'node:fs';

const root = process.cwd();
let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`OK  : ${name}`); }
  else { console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); failures++; }
}

// LICENSE à la racine
const licensePath = `${root}/LICENSE`;
check('LICENSE présent à la racine', existsSync(licensePath));

if (existsSync(licensePath)) {
  const license = readFileSync(licensePath, 'utf8');
  check('LICENSE non vide', license.trim().length > 0);
  check('LICENSE contient "GNU GENERAL PUBLIC LICENSE"', license.includes('GNU GENERAL PUBLIC LICENSE'));
  check('LICENSE contient "Version 3, 29 June 2007"', license.includes('Version 3, 29 June 2007'));
  check('LICENSE contient "END OF TERMS AND CONDITIONS"', license.includes('END OF TERMS AND CONDITIONS'));
  // Pas d'identifiant SPDX "or-later" dans le texte (le SPDX GPL-3.0-or-later est un choix
  // distinct que nous ne voulons pas ; le texte GPL mentionne "or later" en prose, mais pas
  // l'identifiant SPDX "GPL-3.0-or-later").
  check(`LICENSE ne contient pas l'identifiant SPDX "GPL-3.0-or-later"`, !license.includes('GPL-3.0-or-later'));
}

// package.json
const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
check('package.json name === "collab-hub-web-monitor"', pkg.name === 'collab-hub-web-monitor', `got "${pkg.name}"`);
check('package.json version === "1.0.1"', pkg.version === '1.0.1', `got "${pkg.version}"`);
check('package.json license === "GPL-3.0-only"', pkg.license === 'GPL-3.0-only', `got "${pkg.license}"`);
check(`package.json ne contient pas "GPL-3.0-or-later"`, pkg.license !== 'GPL-3.0-or-later');

if (failures > 0) {
  console.error(`\n${failures} vérification(s) de licence ont échoué.`);
  process.exit(1);
}
console.log('\nLicence : GPL-3.0-only — tout est cohérent.');