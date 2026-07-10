# Collab-Hub Web Monitor

Page web publique affichant en temps réel le morceau en cours, pilotée depuis
Max/MSP via Collab-Hub. Une fiche programme / cartouche éditoriale sobre, pas
un dashboard technique.

## Objectif

Permettre au public (présent ou distant) de suivre le contexte du morceau
diffusé : **titre**, **auteur**, **sous-titre**, **note descriptive** et un
**lien** optionnel. Ces cinq champs sont publiés depuis Max via le patch émetteur
`max/CollabHub_Web_Text_Sender.maxpat` et reçus en temps réel par cette page,
sans rechargement.

## Architecture

Client Vite + JavaScript vanilla (pas de React). `socket.io-client` est la seule
dépendance runtime.

```
src/
├── main.js                      # point d'entrée public ; câble socket -> état -> rendu
├── collabHub/
│   ├── socketClient.js          # connexion Socket.IO, fallback auth, API observation
│   ├── observeGuard.js          # observation idempotente par socket.id (pur, testable)
│   └── messageRouter.js         # normalisation + routage des headers (pur, testable)
├── state/
│   └── soundState.js            # état courant des 5 champs (pur, testable)
├── ui/
│   ├── renderSoundInfo.js       # rendu DOM + sécurité du lien (pur, testable)
│   └── renderConnectionStatus.js# indicateur de connexion
├── diagnostic/
│   └── diagnosticPanel.js       # panneau ?debug=1 (chunk dynamique)
└── styles/
    └── main.css                 # design sombre, responsive, reduced-motion
test/
└── runTests.mjs                 # tests unitaires (node:test, zéro dépendance)
scripts/diagnostics/             # probes Collab-Hub (faits de protocole, rejouables)
docs/bmad/                       # product brief + architecture + validation
```

Séparation : **connexion** (`collabHub/socketClient`) · **routage**
(`collabHub/messageRouter`) · **état** (`state/soundState`) · **rendu DOM**
(`ui/*`) · **styles** (`styles/main.css`). Les modules purs (router, state,
render) ne dépendent ni de `import.meta.env` ni du `document` global — testables
en Node.

## Variables d'environnement

Copier `.env.example` en `.env`. Aucun secret.

| Variable | Rôle | Défaut |
|---|---|---|
| `VITE_COLLAB_HUB_URL` | Serveur Collab-Hub (sans namespace ni slash final) | `https://server.collab-hub.io` |
| `VITE_COLLAB_HUB_NAMESPACE` | Namespace Socket.IO — **doit valoir `hub`** (voir ci-dessous) | `hub` |
| `VITE_DIAG_ONANY` | (diagnostic) `onAny` au démarrage | `1` |

## Namespace `/hub` (important)

Le serveur public v0.3.4 sert **deux namespaces séparés** `/` et `/hub` : un
contrôle publié sur l'un n'est **pas** reçu sur l'autre. Le CH-Client Max fixe
son namespace via `config.json` (défaut `hub`), non modifiable au runtime. Pour
que la page reçoive les contrôles publiés par Max, elle doit utiliser le même
namespace : **`VITE_COLLAB_HUB_NAMESPACE=hub`** (défaut du projet). Ne pas
remettre à vide.

## Lancement local

```bash
cp .env.example .env       # vérifier VITE_COLLAB_HUB_NAMESPACE=hub
npm install
npm run dev                # http://localhost:5173 (ou port suivant)
```

## Test avec Max

1. Lancer la page web (`npm run dev`). Elle se connecte à `/hub` et affiche
   « Connecté » ; un `serverMessage` indique la version 0.3.4.
2. Ouvrir `max/CollabHub_Web_Text_Sender.maxpat` (voir `max/README.md` pour
   l'installation du package Collab-Hub).
3. Connecter le CH-Client à `https://server.collab-hub.io`, attendre la version
   0.3.4 (identique côté Max et côté web).
4. Cliquer **ENVOYER LES 5 CHAMPS** dans Max.
5. Vérifier la mise à jour temps réel des trois blocs.
6. Modifier uniquement le titre dans Max -> seul le titre change sur la page.
7. Tester une URL valide (`https://…`) -> lien « En savoir plus » ; une URL
   `javascript:`/vide -> lien masqué.
8. Couper puis rétablir le réseau -> la dernière valeur reste affichée, les
   nouvelles valeurs arrivent après reconnexion.
9. Tester le rendu mobile via les DevTools.
10. Ouvrir le mode diagnostic : `http://localhost:5173/?debug=1`.

Procédure détaillée et dépannage Max : `max/README.md`.

## Mode diagnostic

`?debug=1` active un panneau de diagnostic (sans toucher à l'UI publique) :
état de connexion, socket id, erreurs, événements reçus en JSON brut, compteur
de contrôles, observation manuelle des 5 headers, toggle `onAny`. Ce panneau
est un chunk JS séparé (chargé uniquement avec `?debug=1`). URL publique par
défaut : aucun paramètre -> seulement les trois blocs + le statut.

Le bouton « Observer les 5 champs » est **idempotent** : il s'active tant que
les 5 headers ne sont pas abonnés pour le socket courant, puis affiche
« 5 champs observés » et se désactive (l'observation automatique à la connexion
a déjà abonné les 5 en mode normal). Les boutons individuels ne réémettent pas
un header déjà observé pour le même `socket.id`.

Les **probes** qui ont établi les faits du protocole (namespace `/hub`,
sémantique register/deliver, isolation `/` vs `/hub`) sont conservés dans
`scripts/diagnostics/` (voir `scripts/diagnostics/README.md`).

## Build

```bash
npm run build     # sortie dans dist/ (statique, déployable Vercel/Netlify)
npm run preview   # prévisualiser le build
npm run check     # test + validation maxpat + build  (vérification complète)
```

## Tests

```bash
npm test          # node --test test/runTests.mjs  (21 tests, zéro dépendance)
```

Couvrent : normalisation (tableau 1 ou n éléments, scalaire, absent), routage
(header inconnu ignoré / connu routé), sécurité du lien (http/https accepté,
javascript/data/vide refusé), rendu du bon élément, isolation des champs,
état, et **observation idempotente** (un header émis une fois par socket.id,
reset au disconnect, réobservation unique à la reconnexion, un listener par
événement, `forget` après unobserve). Voir `docs/bmad/03-lot-1-validation.md`.

## Limites connues

- La **1re publication** d'un header l'enregistre seulement et ne pousse pas la
  valeur ; le patch Max envoie chaque champ deux fois (register + deliver).
- Aucune persistance ni historique : au rechargement de la page, on repart des
  valeurs par défaut jusqu'à la prochaine publication.
- Le serveur public v0.3.4 est vieillissant ; un changement d'URL/protocole
  imposerait d'ajuster `.env`.
- L'auth invitée `/api/v1/auth/guest` est absente du serveur public (404) ; on
  se connecte en anonyme (fallback). Sur un serveur v0.5, le token serait utilisé
  automatiquement.
- **Observers côté serveur** : `observedControls` peut contenir des entrées
  `null` et des doublons de usernames (multi-onglets, comportement du serveur
  public 0.3.4). On ne peut pas nettoyer ces anciennes valeurs depuis le client
  — on évite seulement d'en créer de nouvelles via l'observation idempotente
  (`src/collabHub/observeGuard.js`). Un nouvel onglet crée légitimement un
  nouvel observer (username différent).
- Le diagnostic `?debug=1` est accessible à quiconque connaît l'URL (sans
  login) — acceptable pour un outil de spike, à retirer/protéger en production.