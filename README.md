# Collab-Hub Web Monitor

[![CI](https://github.com/broduoliviercontact-web/collab-hub-web-monitor/actions/workflows/ci.yml/badge.svg)](https://github.com/broduoliviercontact-web/collab-hub-web-monitor/actions/workflows/ci.yml)

## Release stable

- **Version** : v1.0.1 (2026-07-10).
- **Production** : https://collab-hub-web-monitor.vercel.app
- **Release GitHub** : https://github.com/broduoliviercontact-web/collab-hub-web-monitor/releases/tag/v1.0.1
- **ZIP Max téléchargeable** : `CollabHub-Web-Monitor-Max-v1.0.1.zip` (joint à
  la release) — contient le patch Max, le README-Max, le fichier `LICENSE` et
  `VERSION.txt`.
- **Procédure rapide** : installer le client Collab-Hub Max → ouvrir le patch
  → connecter à `https://server.collab-hub.io` → remplir les 5 champs → cliquer
  **ENVOYER LES 5 CHAMPS** → ouvrir le site web → vérifier « Connecté — Max
  actif ». Détails : `docs/release/v1.0.1.md` et `max/README.md`.

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
│   └── messageRouter.js         # normalisation + routage, KNOWN/HEARTBEAT headers (pur)
├── state/
│   ├── soundState.js            # état courant des 5 champs (pur, testable)
│   ├── persist.js               # persistance locale localStorage (Lot 3A, pur, testable)
│   └── freshness.js             # état technique fraîcheur + heartbeat (Lot 3B, pur)
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
| `VITE_COLLAB_HUB_AUTH_MODE` | `anonymous` (socket direct, pas d'auth) ou `guest` (voir ci-dessous) | `anonymous` |
| `VITE_DIAG_ONANY` | (diagnostic) `onAny` au démarrage | `1` |

## Mode d'authentification (`VITE_COLLAB_HUB_AUTH_MODE`)

- **`anonymous`** (défaut, mode production) : le navigateur ouvre un socket
  Socket.IO **directement** sur Collab-Hub, **sans aucune requête** vers
  `/api/v1/auth/guest`. C'est le mode attendu pour le serveur public v0.3.4,
  dont la route d'auth invitée n'existe pas (404). La page n'émet donc ni
  `OPTIONS` ni `POST` vers `/api/v1/auth/guest`.
- **`guest`** : tente `POST /api/v1/auth/guest` et utilise le `accessToken`
  renvoyé (mode pour un serveur v0.5 disposant de cette route) ; en cas
  d'échec réseau/404, retombe sur l'anonyme.
- **Toute autre valeur** (ou variable absente) : fallback **safe** vers
  `anonymous` + un `console.warn` discret. On ne déclenche jamais de fetch
  inattendu sur le site public.

La logique vit dans `src/collabHub/authMode.js` (`resolveAuthMode`,
`resolveAuth`, `buildSocketUrl`), testable en Node (Lot 2C).

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
11. Heartbeat Max : une fois le CH-Client connecté, le patch publie
    `sound_heartbeat` toutes les 10 s -> le statut passe à **« Connecté — Max
    actif »** (sous 25 s). Sans heartbeat pendant > 25 s -> **« Connecté — Max
    silencieux »**. Voir « Heartbeat & fraîcheur » ci-dessous.

Procédure détaillée et dépannage Max : `max/README.md`.

## Heartbeat Max & fraîcheur du contenu (Lot 3B)

La page distingue trois choses : la **connexion au serveur** Collab-Hub, la
**activité réelle du patch Max** (heartbeat), et l'**ancienneté du contenu**
affiché.

- **Heartbeat Max** : le patch publie `publish all sound_heartbeat 1` toutes
  les 10 s, uniquement tant que le CH-Client est connecté (zone `HEARTBEAT` du
  patch, `metro 10000` piloté par `connected`). C'est un **header technique** :
  jamais affiché comme contenu, jamais persisté, ne déclenche pas l'animation
  des blocs.
- **Statut public** (réutilise l'indicateur existant, libellés courts) :
  - `Connecté — Max actif` : serveur connecté ET heartbeat reçu depuis < 25 s.
  - `Connecté — Max silencieux` : serveur connecté mais heartbeat > 25 s
    (ou jamais reçu).
  - `Reconnexion…` / `Déconnecté` : le statut serveur est prioritaire.
- **Seuils** (`src/state/freshness.js`, testables) :
  `MAX_ACTIVE_THRESHOLD_MS = 25000`, `CONTENT_FRESH_THRESHOLD_MS = 300000`
  (5 min). Aucun timestamp détaillé affiché au public.
- **Contenu ancien** : l'attribut `data-content-fresh="true|false"` est posé sur
  la carte (`main.card`) ; le contenu ancien est très légèrement estompé
  (opacity), **jamais masqué**. Aucune animation continue agressive.
- **Après rechargement** : le contenu est restauré depuis `localStorage` et daté
  (donc potentiellement « ancien ») ; `maxLastSeenAt` **n'est pas restauré** ->
  Max reste « silencieux » jusqu'au premier heartbeat reçu.

Logique dans `src/state/freshness.js` (pur, horloge injectable, testable en
Node). Détails : `docs/bmad/06-heartbeat-and-freshness.md`.

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

## Persistance locale (Lot 3A)

Les dernières valeurs reçues sont sauvegardées dans `localStorage` (clé
versionnée `collabHubSoundState:v1`) afin qu'un **rechargement de page ne
réinitialise pas immédiatement l'affichage** : on restaure d'abord le dernier
contenu, puis les publications en temps réel le mettent à jour.

- **À chaque contrôle reçu** : l'état mémoire est mis à jour, puis persisté avec
  un `updatedAt` (timestamp ISO).
- **Au chargement** : `loadSoundState` lit `localStorage` et **valide
  strictement** la structure. Seuls les cinq headers connus et de type string
  sont restaurés ; tout le reste (JSON corrompu, version inconnue, header
  inconnu, type non string, champ trop long) est **ignoré** → fallback sur les
  valeurs par défaut. `sound_link` est **repassé par la validation URL
  existante** au rendu (http/https uniquement, `javascript:`/`data:`/vide →
  lien masqué).
- **Sécurité** : aucune donnée HTML, aucun `innerHTML` (rendu via
  `textContent`/`setAttribute`), rien n'est envoyé vers un serveur. En cas
  d'erreur d'accès au storage, l'application ne casse pas.
- **Diagnostic `?debug=1`** : « Dernière restauration locale », « Dernier état
  sauvegardé », et un bouton **« Effacer l'état local »** (avec confirmation).
  Non affiché sur la page publique.

Logique dans `src/state/persist.js` (pur, storage injectable, testable en Node).
Détails : `docs/bmad/05-local-persistence.md`.

## Build

```bash
npm run build     # sortie dans dist/ (statique, déployable Vercel/Netlify)
npm run preview   # prévisualiser le build
npm run check     # test + validation maxpat + build  (vérification complète)
```

## Intégration continue (CI)

`.github/workflows/ci.yml` tourne sur chaque `push` (main) et chaque `pull_request`
vers main, ainsi qu'en `workflow_dispatch`. Ubuntu + Node.js 24 + cache npm.

Étapes (chacune exécutée une seule fois) : `npm ci` → contrôle des fichiers
sensibles suivis par Git (`scripts/check-tracked-files.mjs` via `git ls-files`) →
**contrôle des métadonnées de licence GPL-3.0-only** (`scripts/check-license.mjs`)
→ `npm test` → `node max/validate-maxpat.mjs` → `npm run build` → vérification de
`dist/index.html` + au moins un asset JS et CSS (messages d'erreur explicites). La
CI vérifie donc : fichiers sensibles, métadonnées GPL-3.0-only (LICENSE, package,
README), tests, patch Max, build, artefacts générés. Pas de `npm run check` en CI
(pour ne pas dupliquer test + validate-maxpat + build, déjà lancés séparément).
Le dossier `dist` est uploadé en artifact `collab-hub-web-monitor-dist`
(rétention 7 jours) uniquement sur `main` ou `workflow_dispatch` — aucune release
automatique.

Permissions minimales (`contents: read` uniquement). Concurrence :
`cancel-in-progress` sur le groupe `ci-${{ github.workflow }}-${{ github.ref }}`
(un nouveau commit sur la même branche annule l'ancien run ; pas de collision
entre workflows ni entre branches).

[Badge CI](https://github.com/broduoliviercontact-web/collab-hub-web-monitor/actions/workflows/ci.yml)
en tête de ce README.

## Déploiement Vercel

L'application est une **SPA statique** (Vite, sans backend, sans fonctions
serverless). Vercel ne sert que les assets ; le navigateur se connecte
**directement** à Collab-Hub via WebSocket (aucune dépendance à Vercel pour le
temps réel).

- **Production** : https://collab-hub-web-monitor.vercel.app
- **Dépôt GitHub connecté** : `broduoliviercontact-web/collab-hub-web-monitor`
  (chaque push sur `main` redéploie automatiquement).
- **Framework Preset** : Vite · **Root Directory** : racine du dépôt ·
  **Build Command** : `npm run build` · **Output Directory** : `dist`.

### Variables d'environnement Vercel

À configurer dans le projet Vercel (Production + Preview). **Aucune n'est
secrète** — ce sont des valeurs publiques, cuites dans le bundle au build.

| Variable | Valeur |
|---|---|
| `VITE_COLLAB_HUB_URL` | `https://server.collab-hub.io` |
| `VITE_COLLAB_HUB_NAMESPACE` | `hub` (sans slash initial — le code stripped les slashes) |
| `VITE_COLLAB_HUB_AUTH_MODE` | `anonymous` (socket direct, pas de `/api/v1/auth/guest`) |

> `VITE_COLLAB_HUB_NAMESPACE` est **obligatoire** : sans elle, le bundle
> construirait avec un namespace vide (racine `/`) et ne recevrait aucun
> contrôle publié par Max (qui utilise `/hub`). La valeur `hub` correspond à
> celle qui fonctionne localement (`.env`).
>
> `VITE_COLLAB_HUB_AUTH_MODE=anonymous` garantit que le site public ne génère
> **ni `OPTIONS` ni `POST`** vers `/api/v1/auth/guest` (route absente du
> serveur v0.3.4). À ne passer en `guest` que sur un serveur disposant de
> l'auth invitée.

### Test distant (Max → site Vercel)

1. Ouvrir le site public : https://collab-hub-web-monitor.vercel.app (sans
   paramètre) → « Connecté » ; le `serverMessage` annonce
   `Collab-Hub Version: 0.3.4. You're in Namespace /hub`.
2. Connecter le CH-Client Max à `https://server.collab-hub.io`, attendre la
   version 0.3.4 (identique côté Max et côté site).
3. Cliquer **ENVOYER LES 5 CHAMPS** dans Max → les trois blocs se remplissent
   en temps réel (titre, auteur, sous-titre, description, lien).
4. Modifier uniquement le titre dans Max → seul le titre change (isolation).
5. `?debug=1` : https://collab-hub-web-monitor.vercel.app/?debug=1 → panneau
   de diagnostic (JSON brut, compteur de contrôles, observation idempotente,
   persistance locale + bouton « Effacer l'état local »).
6. Recharger la page → **le dernier contenu reçu est restauré** depuis
   `localStorage` (persistance Lot 3A), puis mis à jour par les publications en
   temps réel. Bouton « Effacer l'état local » en `?debug=1` pour repartir des
   défauts.
7. Couper/rétablir le réseau → la dernière valeur reste affichée, les nouvelles
   arrivent après reconnexion (réobservation idempotente des 5 headers).

Procédure détaillée et dépannage Max : `max/README.md`. Validation complète :
`docs/bmad/03-lot-1-validation.md`.

## Tests

```bash
npm test          # node --test test/runTests.mjs  (57 tests, zéro dépendance)
```

Couvrent : normalisation (tableau 1 ou n éléments, scalaire, absent), routage
(header inconnu ignoré / connu routé), sécurité du lien (http/https accepté,
javascript/data/vide refusé), rendu du bon élément, isolation des champs,
état, **observation idempotente** (un header émis une fois par socket.id,
reset au disconnect, réobservation unique à la reconnexion, un listener par
événement, `forget` après unobserve), **mode d'auth** (anonymous/guest/
inconnu, `/hub` conservé), **persistance locale** (restauration, corruption,
version inconnue, header inconnu, type non string, `sound_link` invalidé masqué,
sauvegarde après contrôle, timestamp, effacement, storage absent), et
**fraîcheur/heartbeat** (heartbeat met à jour maxLastSeenAt sans toucher au
contenu ni persister, seuils Max actif/silencieux et contenu récent/ancien,
contenu restauré ancien, serveur prioritaire, horloge injectable). Voir
`docs/bmad/03-lot-1-validation.md`, `docs/bmad/05-local-persistence.md` et
`docs/bmad/06-heartbeat-and-freshness.md`.

## Limites connues

- La **1re publication** d'un header l'enregistre seulement et ne pousse pas la
  valeur ; le patch Max envoie chaque champ deux fois (register + deliver) via
  `t b b` + `send ch_pub5` / `delay 300` / 5 `receive ch_pub5` (voir
  `max/README.md`).
- Persistance **locale uniquement** (Lot 3A) : le dernier contenu est restauré
  depuis `localStorage` au rechargement, mais il n'y a **pas d'historique** ni de
  multi-postes (chaque navigateur a son propre état). Données validées
  strictement à la lecture ; données corrompues/incompatibles -> valeurs par
  défaut. Voir `docs/bmad/05-local-persistence.md`.
- **Fraîcheur** (Lot 3B) : `maxLastSeenAt` n'est pas restauré après rechargement
  -> Max apparaît « silencieux » jusqu'au 1er heartbeat reçu (≤ 10 s après la
  connexion Max). « Max actif » n'apparaît qu'après réception d'un heartbeat
  livré (register/deliver : ~0,3 s après la connexion Max dans le patch). Se
  reporter à `docs/bmad/06-heartbeat-and-freshness.md`.
- Le serveur public v0.3.4 est vieillissant ; un changement d'URL/protocole
  imposerait d'ajuster `.env`.
- L'auth invitée `/api/v1/auth/guest` est absente du serveur public v0.3.4
  (404). En mode `anonymous` (défaut production), la page n'émet **aucune**
  requête d'auth : socket direct. Le mode `guest` n'est pertinent que sur un
  serveur v0.5 disposant de cette route.
- **Observers côté serveur** : `observedControls` peut contenir des entrées
  `null` et des doublons de usernames (multi-onglets, comportement du serveur
  public 0.3.4). On ne peut pas nettoyer ces anciennes valeurs depuis le client
  — on évite seulement d'en créer de nouvelles via l'observation idempotente
  (`src/collabHub/observeGuard.js`). Un nouvel onglet crée légitimement un
  nouvel observer (username différent).
- Le diagnostic `?debug=1` est accessible à quiconque connaît l'URL (sans
  login) — acceptable pour un outil de spike, à retirer/protéger en production.

## Moteur audio LiveKit (en développement)

Une couche audio temps réel est en cours d'intégration, **désactivée par défaut**
(`VITE_LIVEKIT_ENABLED=false` : aucun bouton, aucun indicateur, aucun chargement
du SDK LiveKit sur la page publique). Elle vise à diffuser le son du performer
(Ableton → BlackHole/Loopback → navigateur) vers un listener public via LiveKit
Cloud, indépendamment du flux métadonnées Collab-Hub qui reste inchangé.

État :

- **Moteur audio local** (`src/audio/`, Lot 4B) — permission, capture, graphe Web
  Audio, gain, vumètre (testé, non importé par `src/main.js`).
- **Endpoint token serverless** (`api/livekit/token.js`, Lot 4C) — tokens
  temporaires (room `main`, identity serveur, TTL 2h, grants par rôle). Variables
  serveur **uniquement** dans Vercel (`LIVEKIT_URL`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET`, `PERFORMER_PASSWORD` — jamais préfixées `VITE_`, jamais
  dans le bundle).
- **Publisher** (`src/audio/livekitPublisher.js`, Lot 4C) — connecte le
  `MediaStream` du moteur à LiveKit (injectable, testé sans réseau).
- **Listener public** (`src/livekit/livekitListener.js` + `src/listener/`,
  Lot 4D) — moteur listener (abonnement audio uniquement, autoplay, volume,
  mute, reconnexion native), adaptateur `<audio>`, section publique additive
  « DIRECT AUDIO ». **Gâte par `VITE_LIVEKIT_ENABLED`** via import dynamique :
  tant que la variable est absente/`false`, le SDK `livekit-client` est éliminé du
  build (aucun chargement). Le performer n'est pas encore câblé à l'UI.

Détails et configuration Vercel : `docs/bmad/10-livekit-token-and-publisher.md`
et `docs/bmad/11-livekit-public-listener.md`. La diffusion n'est **pas** une
fonctionnalité publique active tant que `VITE_LIVEKIT_ENABLED` reste `false` ;
la Control Room performer viendra dans un lot ultérieur.

## Licence

- **Licence** : GNU General Public License v3.0 only.
- **SPDX** : `GPL-3.0-only`.
- **Titulaire** : Olivier Brodu.
- **Année** : 2026.
- **Copyright** : Copyright (C) 2026 Olivier Brodu.

Le code source, le patch Max et la documentation du dépôt sont couverts par la
GNU General Public License v3.0 only, sauf mention contraire. Voir le fichier
[`LICENSE`](./LICENSE) à la racine du dépôt pour le texte officiel complet.

`SPDX-License-Identifier: GPL-3.0-only`