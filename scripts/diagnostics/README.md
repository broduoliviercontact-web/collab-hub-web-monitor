# Scripts de diagnostic (probes Collab-Hub)

Probes Node headless (`socket.io-client`) utilisés pendant le spike pour établir
les faits du protocole du serveur public v0.3.4. **Sources de vérité** : chaque
probe prouve un fait précis et peut être rejoué.

Lancer depuis la racine du projet :

```bash
node scripts/diagnostics/<probe>.mjs
```

`socket.io-client` se résout via `node_modules/` à la racine. Aucun secret, aucune
auth (fallback anonyme). Les probes se déconnectent et quittent (`process.exit`).

## probes conservés

| Probe | Fait prouvé |
|---|---|
| `probe-hub-ns.mjs` | Le namespace **`/hub`** se connecte en transport **websocket** (comme `CH-ClientScript.js:257`) ; le polling HTTP `/hub/?EIO=4&transport=polling` renvoyait 404 mais le ws fonctionne — `socket.nsp === "/hub"`. Confirme l'alignement namespace Max↔web. |
| `probe-observe.mjs` | `observeControl` pour les 5 headers déclenche bien `observedControls` / `availableControls` côté serveur. Confirme le mécanisme d'abonnement et la liste des événements reçus. |
| `probe-order.mjs` | **Observer AVANT la 1re publication ne suffit pas** : la 1re publication n'enregistre que le header, aucun `control` n'est poussé. Prouve la sémantique register/deliver. |
| `probe-e2e2.mjs` | e2e définitif : `publish` (register) → `observeControl` → `publish` (deliver) → `control` reçu sur `/hub`. Prouve aussi l'**isolation** `/` vs `/hub` (le souscripteur root ne reçoit pas le contrôle publié sur `/hub`). |
| `probe-late-join-snapshot.mjs` | Spike `#48` : distingue trois cas réels sur `/hub` — arrivée d'un observer après un simple register, arrivée après un vrai deliver, puis reconnexion d'un observer. Permet de vérifier si le serveur **rejoue** la dernière valeur aux late joiners ou non. |

## probes supprimés (Lot 1.1)

- `probe-e2e.mjs` — première tentative e2e (émission `publish all` sans
  register-first), rendue obsolète par `probe-e2e2.mjs`.
- `probe-root.mjs` — namespace racine `/`, qui n'est plus la cible du projet
  (le web utilise `/hub` pour s'aligner sur le CH-Client Max).

## probe late-join snapshot

```bash
node scripts/diagnostics/probe-late-join-snapshot.mjs
```

Ce probe est le plus proche de l'issue `#48` :

- `PUB` publie une 1re fois `sound_title=v1` ;
- `SUB_A` arrive **après** ce register et observe le header ;
- `PUB` republie `sound_title=v2` ;
- `SUB_B` arrive **après** ce deliver et observe le même header ;
- `SUB_A_RECONNECTED` simule un retour après déconnexion.

Lecture :

- si `SUB_A` reçoit tout de suite un `control` après `observeControl`, le serveur
  rejoue déjà la valeur enregistrée ; sinon la 1re publication n'était bien
  qu'un register ;
- si `SUB_B` ou `SUB_A_RECONNECTED` reçoivent tout de suite un `control` après
  `observeControl`, le serveur offre un vrai snapshot/replay du dernier état ;
- s'ils ne reçoivent rien tant qu'aucune nouvelle publication n'est faite, alors
  il n'existe pas de snapshot utile côté serveur public.

## ce qu'on NE peut pas prouver côté client

Les probes connectent UN socket à la fois (sauf e2e2 qui en ouvre 3 sur
`/hub`+`/`). La **liste des observers côté serveur** (`observedControls` avec
entrées `null` et doublons de usernames sur multi-onglets/reconnects) est un
comportement du serveur public v0.3.4 : on ne peut pas nettoyer ces entrées
depuis le client — on se contente de ne pas en créer de nouvelles (observation
idempotente, voir `src/collabHub/observeGuard.js`).
