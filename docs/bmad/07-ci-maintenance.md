# 07 — Maintenance et durcissement de la CI (Lot 3F)

Objectif : rendre la CI plus explicite et plus robuste, ajouter la vérification
automatique de la licence, éviter les doubles exécutions inutiles, vérifier les
métadonnées de release — **sans aucune modification fonctionnelle ni visuelle**,
et **sans publier de nouvelle release**.

## Contraintes respectées

Design, HTML/CSS public, protocole Collab-Hub, les cinq headers, le patch Max,
les variables Vercel, la version `1.0.1`, le tag `v1.0.1`, la release GitHub
`v1.0.1`, le contenu du ZIP v1.0.1 et la licence `GPL-3.0-only` : **inchangés**.
Aucune release `v1.0.2` créée dans ce lot.

## Objectifs

1. Ajouter la vérification de licence à GitHub Actions.
2. Rendre la CI plus explicite et plus robuste.
3. Éviter les doubles exécutions inutiles.
4. Vérifier les métadonnées de release (package + licence).
5. Ne modifier aucune fonctionnalité applicative ni aucun élément visuel.
6. Ne publier aucune nouvelle release.

## Étapes CI (`.github/workflows/ci.yml`)

Ordre, chaque contrôle exécuté **une seule fois** (pas de `npm run check` en
CI, pour ne pas dupliquer test + validate-maxpat + build) :

1. `actions/checkout@v4` — Checkout repository
2. `actions/setup-node@v4` — Node.js 24, cache `npm`
3. `npm ci` — Install dependencies
4. `node scripts/check-tracked-files.mjs` — Check tracked files (aucun fichier
   sensible suivi par Git via `git ls-files`)
5. `node scripts/check-license.mjs` — **Check license metadata (GPL-3.0-only)** (nouveau, Lot 3F)
6. `npm test` — Run tests (57 tests, `node:test`)
7. `node max/validate-maxpat.mjs` — Validate Max patch
8. `npm run build` — Build application (Vite)
9. Verify build output — `dist/index.html` + au moins un asset JS + au moins un
   asset CSS (messages d'erreur explicites)
10. `actions/upload-artifact@v4` — Upload `dist` (uniquement sur `push` main ou
    `workflow_dispatch`)

## Contrôles licence (`scripts/check-license.mjs`)

Refactoré en Lot 3F : fonctions pures exportées (`verifyMetadata`,
`loadRepo`, `LICENSE_MARKERS`, `REQUIRED`) + CLI gardé (ne s'exécute que lancé
directement, pas à l'import pour les tests).

Vérifie de façon stable (sans requête réseau, sans comparaison octet par octet,
sans dépendre du nombre de lignes ni d'espaces fragiles) :

- `LICENSE` existe et n'est pas vide ;
- `LICENSE` contient `GNU GENERAL PUBLIC LICENSE`, `Version 3, 29 June 2007`,
  `END OF TERMS AND CONDITIONS` ;
- `LICENSE` ne contient pas l'identifiant SPDX `GPL-3.0-or-later` ;
- `package.json` `name === "collab-hub-web-monitor"` ;
- `package.json` `version === "1.0.1"` ;
- `package.json` `license === "GPL-3.0-only"` ;
- `package-lock.json` cohérent avec `package.json` (root name/version et
  `packages[""]` name/version/license) ;
- `README.md` contient `GPL-3.0-only`.

Échec : code de sortie non nul + message lisible listant chaque erreur.

## Permissions

Minimales et explicites :

```yaml
permissions:
  contents: read
```

Aucune permission d'écriture ajoutée (`contents: write`, `actions: write`,
`packages: write`, `pull-requests: write`). L'upload d'artifact
(`actions/upload-artifact@v4`) ne nécessite **pas** de permission d'écriture sur
le dépôt.

## Concurrence

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Objectif : annuler un ancien run CI si un nouveau commit arrive sur la même
branche ; ne pas annuler un workflow d'une autre branche ; ne pas provoquer de
collision entre workflows différents (le `github.workflow` dans le groupe
isole chaque workflow).

## Tests du script de licence

9 tests ajoutés (`test/runTests.mjs`) → **57 tests au total** (48 + 9). Ils
appellent `verifyMetadata` (fonction pure) sur des fixtures en mémoire —
**sans modifier le vrai `package.json`**, sans Git, sans réseau, sans mock
complexe :

- métadonnées valides → ok ;
- marqueur GPL manquant → échec ;
- mauvais `name` → échec ;
- mauvaise `version` → échec ;
- `GPL-3.0-or-later` rejeté (package + texte LICENSE) ;
- README sans `GPL-3.0-only` → échec ;
- `package-lock.json` incohérent → échec ;
- `LICENSE` absente → échec ;
- constantes exportées stables.

## Scripts npm

Ajoutés (valeur pour le développement local ; la CI, elle, lance chaque étape
séparément) :

```json
"check:license": "node scripts/check-license.mjs",
"check:tracked": "node scripts/check-tracked-files.mjs",
"check": "npm test && npm run check:license && npm run check:tracked && node max/validate-maxpat.mjs && npm run build"
```

Aucune dépendance modifiée. La CI n'utilise **pas** `npm run check` (évite de
dupliquer test + validate-maxpat + build).

## Procédure de test (locale)

```bash
npm ci
npm test                         # 57 tests
node scripts/check-license.mjs   # licence + métadonnées
node scripts/check-tracked-files.mjs
node max/validate-maxpat.mjs
npm run build
npm run check                    # tout enchaîné (local)
git diff --check
```

Vérifier : 57 tests passent ; check-license vert ; check-tracked-files vert ;
validate-maxpat OK ; build OK ; assets JS/CSS inchangés (mêmes hashes → aucun
changement visuel) ; version reste `1.0.1` ; licence reste `GPL-3.0-only`.

## Limites

- Le contrôle `check-tracked-files.mjs` repose sur `git ls-files` : il suppose
  un dépôt Git (vrai en CI et en local ; un export sans `.git` ne le validerait
  pas).
- `check-license.mjs` ne compare pas le texte de la `LICENSE` octet par octet
  avec une référence officielle (par choix : éviter un test fragile dépendant de
  la mise en page). Il vérifie les marqueurs caractéristiques de la GNU GPL v3.
- Aucune release automatique n'est créée par la CI ; l'artifact `dist` est
  conservé 7 jours, uniquement sur `main` / `workflow_dispatch`.
- Ce lot est une maintenance postérieure à la release v1.0.1 ; une éventuelle
  v1.0.2 sera décidée séparément.