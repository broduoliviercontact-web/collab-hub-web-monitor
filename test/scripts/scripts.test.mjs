// Tests for the scripts domain — split from the former monolithic test/runTests.mjs (issue #11).
// Behaviour is unchanged; tests and fakes were moved verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyMetadata, LICENSE_MARKERS, REQUIRED } from '../../scripts/check-license.mjs';

const VALID_LICENSE = ['GNU GENERAL PUBLIC LICENSE', 'Version 3, 29 June 2007',
  'END OF TERMS AND CONDITIONS', '...corps...'].join('\n');

const VALID_PKG = { name: REQUIRED.name, version: REQUIRED.version, license: REQUIRED.license };

const VALID_README = `# ...\nLicence : ${REQUIRED.license}\n...`;

test('check-license : métadonnées valides -> ok', () => {
  const r = verifyMetadata({ license: VALID_LICENSE, pkg: VALID_PKG, readme: VALID_README, lock: null });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

// 15. marqueurs manquants -> échec

test('check-license : marqueur GPL manquant -> échec', () => {
  const bad = VALID_LICENSE.replace('GNU GENERAL PUBLIC LICENSE', 'xxx');
  const r = verifyMetadata({ license: bad, pkg: VALID_PKG, readme: VALID_README, lock: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('GNU GENERAL PUBLIC LICENSE')));
});

// 16. mauvais nom de package -> échec

test('check-license : mauvais name -> échec', () => {
  const r = verifyMetadata({ license: VALID_LICENSE, pkg: { ...VALID_PKG, name: 'old-spike' }, readme: VALID_README, lock: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('name')));
});

// 17. mauvaise version -> échec

test('check-license : mauvaise version -> échec', () => {
  const r = verifyMetadata({ license: VALID_LICENSE, pkg: { ...VALID_PKG, version: '0.0.0' }, readme: VALID_README, lock: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('version')));
});

// 18. licence SPDX or-later -> échec (package + texte)

test('check-license : GPL-3.0-or-later rejeté (pkg + LICENSE)', () => {
  const r1 = verifyMetadata({ license: VALID_LICENSE, pkg: { ...VALID_PKG, license: 'GPL-3.0-or-later' }, readme: VALID_README, lock: null });
  assert.equal(r1.ok, false);
  const r2 = verifyMetadata({ license: VALID_LICENSE + '\nGPL-3.0-or-later', pkg: VALID_PKG, readme: VALID_README, lock: null });
  assert.equal(r2.ok, false);
});

// 19. README sans GPL-3.0-only -> échec

test('check-license : README sans mention GPL-3.0-only -> échec', () => {
  const r = verifyMetadata({ license: VALID_LICENSE, pkg: VALID_PKG, readme: '# pas de licence', lock: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('README')));
});

// 20. package-lock incohérent -> échec

test('check-license : package-lock incohérent -> échec', () => {
  const lock = { name: 'autre-chose', version: '9.9.9', packages: { '': { name: 'autre', version: '0.0.1', license: 'MIT' } } };
  const r = verifyMetadata({ license: VALID_LICENSE, pkg: VALID_PKG, readme: VALID_README, lock });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('package-lock')));
});

// 21. LICENSE absente -> échec

test('check-license : LICENSE absente -> échec', () => {
  const r = verifyMetadata({ license: null, pkg: VALID_PKG, readme: VALID_README, lock: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('LICENSE absent')));
});

// 22. constantes exportées stables

test('check-license : constantes stables', () => {
  assert.deepEqual(LICENSE_MARKERS, ['GNU GENERAL PUBLIC LICENSE', 'Version 3, 29 June 2007', 'END OF TERMS AND CONDITIONS']);
  assert.equal(REQUIRED.license, 'GPL-3.0-only');
  assert.equal(REQUIRED.name, 'collab-hub-web-monitor');
  assert.equal(REQUIRED.version, '1.1.2');
});

