# 03 — Validation Lot 1 (et correctif Lot 1.1)

Manuel de validation du MVP Collab-Hub Web Monitor. Documente la procédure de
test end-to-end Max → navigateur, les résultats observés, et la limite serveur
qui a motivé le correctif d'observation idempotente (Lot 1.1).

## Environnement de validation

- Serveur public Collab-Hub **v0.3.4** : `https://server.collab-hub.io`
- Namespace **`/hub`** (aligné sur le défaut du CH-Client Max, `config.json`).
- Patch émetteur : `max/CollabHub_Web_Text_Sender.maxpat` (clé Max `lines`,
  conforme aux patches officiels Collab-Hub).
- Page web : à la racine du projet (`npm run dev`), URL publique sans
  paramètre ; diagnostic via `?debug=1`.

## Procédure de validation manuelle

1. `cp .env.example .env` (vérifier
   `VITE_COLLAB_HUB_NAMESPACE=hub`), `npm install`, `npm run dev`.
2. La page se connecte à `/hub`, affiche **« Connecté »** ; un `serverMessage`
   annonce la version 0.3.4 (visible en `?debug=1`).
3. Ouvrir `max/CollabHub_Web_Text_Sender.maxpat` (voir `max/README.md`).
4. Connecter le CH-Client à `https://server.collab-hub.io`, attendre la version
   0.3.4 identique côté Max et côté web.
5. Cliquer **ENVOYER LES 5 CHAMPS** dans Max (le patch envoie chaque champ deux
   fois : register puis deliver — voir « Sémantique publish »).
6. Vérifier la mise à jour temps réel des trois blocs.

## Cas de test et résultats attendus

| # | Cas | Attendu | Statut |
|---|---|---|---|
| 1 | 5 headers publiés | les 3 blocs se remplissent | ✅ |
| 2 | Espaces et accents (`"Premier morceau"`, `"Été à Paris"`) | préservés tels quels | ✅ |
| 3 | `sound_link` = URL `https://…` valide | lien « En savoir plus » visible, `target="_blank"`, `rel="noopener noreferrer"` | ✅ |
| 4 | `sound_link` = `javascript:alert(1)` / `data:…` / vide | lien masqué, href remis à `#` | ✅ |
| 5 | Modifier uniquement le titre dans Max | seul le titre change (isolation des champs) | ✅ |
| 6 | Namespace `/hub` (web aligné sur Max) | contrôles reçus ; un web sur `/` ne recevrait rien | ✅ |
| 7 | Compteur de contrôles (`?debug=1`) | incrémente à chaque `control` reçu | ✅ |

### Message réel observé

```json
{ "header": "sound_title", "values": ["zuber"], "from": "CH-Max-Client_138" }
```

`values` est un **tableau** ; `normalizeValue` fait un `join(' ')` (un élément
ici). `from` n'est pas affiché au public.

## Sémantique publish (register / deliver)

La **1re publication** d'un header l'enregistre seulement (apparaît dans
`availableControls`) et ne pousse **pas** d'événement `control` aux observers —
même si l'observer est déjà abonné (prouvé par `scripts/diagnostics/probe-order.mjs`).
Seule une publication **suivante** déclenche `control` `{from, header, values}`.
Le patch Max envoie donc chaque champ deux fois : `t b b` (sortie 0 =
enregistrement immédiat, sortie 1 = livraison après `delay 300`) → `send
ch_pub5` → 5 `receive ch_pub5` (un par header) → `publish all <header> $1`.
Mécanisme fiabilisé au Lot 2C (l'ancien `pipe 0 50 100 150 200` ne tirait que
l'outlet 0 → un seul header par passage). Voir `docs/bmad/04-production-stabilization.md`.

## Comportement des observers et limite serveur (Lot 1.1)

### Problème observé

`observedControls` (côté serveur) montrait des **doublons d'observers** et des
entrées **`null`** : `CH-Web_533`, `CH-Web_748`, plusieurs `null`. Causes :

- plusieurs onglets ouverts = plusieurs usernames = plusieurs observers ;
- chaque (re)connexion réémettait `observeControl` pour les 5 headers
  **sans dédoublonnage** (`socketClient.js` émettait sur `connect` ET
  `reconnect`, sans Set) ;
- le panneau `?debug=1` attachait ses **propres** listeners `connect`/`control`
  (doublons) et le bouton « Observer les 5 champs » réémettait à chaque clic.

### Limite serveur (non corrigeable côté client)

Les entrées `null` dans `observedControls` proviennent du **serveur public
v0.3.4** : lorsqu'un socket se déconnecte, son entrée d'observer persiste
(parfois vidée en `null`). **On ne peut pas nettoyer ces anciennes valeurs
depuis le client** — c'est un comportement du serveur public 0.3.4. Le correctif
ne fait que **ne pas en créer de nouvelles**.

### Correctif client (observation idempotente)

`src/collabHub/observeGuard.js` (pur, testable en Node) :

- `createObserveGuard({ emit })` : un `Set` local par connexion ; un header
  n'est émis (`observeControl`) qu'**une seule fois** par `socket.id`.
- `setConnected(false)` (vrai `disconnect`) **vide** le `Set` ; après un nouveau
  `connect`, on **réobserve exactement une fois** les 5 headers.
- `wireSocket(socket, guard, …)` : **un seul listener** par événement
  (`connect`, `reconnect`, `reconnect_attempt`, `disconnect`, `connect_error`,
  `control`) — plus de listeners dupliqués. Sur `reconnect`, le `disconnect`
  préalable a vidé le guard → l'observation reste idempotente (5 émissions par
  connexion, jamais 10).
- `observeHeaderOnce` / `observeKnownHeadersOnce` / `forget` (réobserver après
  un `unobserve` explicite, diagnostic) / `isObserved` / `observedCount`.

`socketClient.js` expose désormais une API `{ socket, observeHeaderOnce,
observeKnownHeadersOnce, isObserved, observedCount, forget }` au lieu du socket
brut. `diagnosticPanel.js` n'attache plus de listeners `connect`/`disconnect`/
`connect_error`/`control` (doublons) — il reçoit le statut et les contrôles via
`setStatus()` / `logControl()` appelés par `main.js`, et réutilise le guard pour
ses boutons. Le bouton « Observer les 5 champs » se désactive et affiche
« 5 champs observés » une fois les 5 abonnés ; il se recalcule à chaque
(re)connexion.

### Ce qui reste attendu (non-bogue)

- Un **nouvel onglet** crée un **nouvel** observer côté serveur (username
  différent) — c'est le comportement normal, pas un doublon.
- Les `null` historiques côté serveur ne disparaissent pas (limite 0.3.4).

## Tests automatisés

```bash
npm test        # 21 tests, zéro dépendance (node:test + node:assert)
npm run check   # test + validate-maxpat + build
```

Lot 1.1 ajoute 7 tests couvrant l'observation idempotente :
- header observé 2× → 1 émission ;
- 5 headers × 2 → 5 émissions (tous marqués observés) ;
- `disconnect` vide le suivi → réobservable après `reconnect` ;
- `observeKnownHeadersOnce` n'observe pas un header inconnu ;
- un header « extra » est oublié après `disconnect` (changement de socket.id) ;
- `wireSocket` : un listener par événement + réobservation idempotente sur
  reconnect (5 puis 0, reset, 5) ;
- `forget()` permet de réobserver après `unobserve`.

## Validation du patch Max

```bash
node max/validate-maxpat.mjs   # ou via npm run check
```

Vérifie : JSON valide, ids uniques, `lines` vers boxes existants (inlets/outlets
dans les limites), bpatcher `ch.client.maxpat`, `print CollabHub-Web-Sender`, les
5 headers, `t b b`, `send ch_pub5` + `delay 300` + 5 `receive ch_pub5` (double
passage register/deliver, 10 déclenchements), bouton global + boutons
individuels, chaque publish câblé vers `ch.client` + `print`, et **l'absence**
de l'ancien `pipe 0 50 100 150 200`.

> **Clé Max `lines`** : les patches officiels Collab-Hub (`ch.client.maxpat`,
> `simple.maxpat`) utilisent la clé `lines` (tableau d'objets `{patchline:…}`),
> pas `patchlines`. Le patch émetteur et le validateur ont été alignés sur
> `lines` au Lot 1.1 (correction de format, comportement du patch inchangé).

## Critères de sortie Lot 1

- ✅ Page publique responsive, 3 blocs, statut de connexion, sans framework.
- ✅ Réception temps réel des 5 headers depuis Max (namespace `/hub`).
- ✅ Sécurité : `textContent` uniquement, URL validée http/https, jamais
  `innerHTML`.
- ✅ Pas de perte de la dernière valeur à la reconnexion.
- ✅ Diagnostic `?debug=1` (chunk dynamique, hors chemin public).
- ✅ 21 tests unitaires passent ; `vite build` réussit ; `validate-maxpat` OK.
- ✅ BMAD : `01-product-brief.md`, `02-architecture.md`, `03-lot-1-validation.md`.

## Hors périmètre (reporté)

Lot 2 non commencé. Aucune nouvelle fonctionnalité produit au Lot 1.1.
Persistance, historique, login, multi-pages : hors MVP.