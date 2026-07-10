# 02 — Architecture

## Flux Max → Collab-Hub → navigateur

```
Max/MSP (CollabHub_Web_Text_Sender.maxpat)
   |  publish all <header> "<valeur>"   (bpatcher ch.client.maxpat)
   v
Collab-Hub server  https://server.collab-hub.io   (v0.3.4, namespace /hub)
   |  socket.io event "control"  { from, header, values }
   v
Navigateur (src/main.js)
   socketClient -> routeControl -> soundState -> renderField -> DOM
```

## Contrat de données

Événement Socket.IO entrant : `control`
```json
{ "header": "sound_title", "values": ["Premier morceau"], "from": "CH-Max-Client_138" }
```
- `header` : string, doit appartenir aux 5 headers connus.
- `values` : tableau (observé) — toujours normalisé en chaîne par
  `normalizeValue` (join espace si tableau, String si scalaire, "" si absent).
- `from` : expéditeur (non affiché au public).

Aucun HTML n'est reçu depuis Max. Texte uniquement. L'URL est transmise comme
texte et rendue/validée côté navigateur.

## Mapping des cinq headers

| Header | Bloc rendu | Élément DOM |
|---|---|---|
| `sound_title` | Bloc 1 — titre | `<h1 id="sound-title">` |
| `sound_author` | Bloc 1 — auteur | `<p id="sound-author">` |
| `sound_subtitle` | Bloc 2 | `<p id="sound-subtitle">` |
| `sound_description` | Bloc 3 — note | `<p id="sound-description">` |
| `sound_link` | Bloc 3 — lien | `<a id="sound-link">` dans `#sound-link-wrap` |

Routage : `routeControl(data, onUpdate)` (`src/collabHub/messageRouter.js`)
n'appelle `onUpdate` que pour `KNOWN_HEADERS`. Les autres headers sont ignorés
silencieusement (return false).

## Sécurité du lien (`sound_link`)

`isSafeHttpUrl(value)` (`src/ui/renderSoundInfo.js`) :
- accepte uniquement `http:` / `https:` (validé via `new URL()`).
- refuse `javascript:`, `data:`, vide, non-URL.
- URL valide -> `linkWrap.hidden = false`, `link.href = url` (setAttribute).
- vide ou invalide -> `linkWrap.hidden = true`, href remis à `#`.
- Invalide non vide -> `console.warn` discret (jamais affiché au public).

Aucune valeur n'est injectée via `innerHTML`. Uniquement `textContent`,
`setAttribute`, `hidden`. L'attribut `rel="noopener noreferrer"` et
`target="_blank"` sont fixes dans le HTML.

## Stratégie de reconnexion

- `socket.io-client` avec `reconnection: true` (délai 1 s, max 5 s).
- Statut exposé via `connect` / `disconnect` / `connect_error` /
  `reconnect_attempt` / `reconnect` -> `renderConnectionStatus`.
- **Observation idempotente** (`src/collabHub/observeGuard.js`) : un `Set` local
  par connexion (`socket.id`) garantit qu'un header n'est émis (`observeControl`)
  qu'**une seule fois** par connexion. Le `Set` est vidé lors d'un vrai
  `disconnect` ; après un nouveau `connect`, on réobserve exactement une fois
  les 5 headers (`observeKnownHeadersOnce`). `wireSocket` attache **un seul
  listener** par événement (pas de doublon connect/control). Sur `reconnect`, le
  `disconnect` préalable a vidé le guard -> 5 émissions par connexion, jamais 10.
- **L'état affiché n'est pas effacé à la déconnexion** : `soundState` reste en
  mémoire -> pas de perte de la dernière valeur. Les nouvelles valeurs
  arrivent dès la reconnexion (réabonnement + publications suivantes).
- **Limite serveur** : `observedControls` peut conserver des entrées `null` et
  des doublons (multi-onglets, serveur public 0.3.4). Non nettoyable côté
  client — l'observation idempotente évite seulement d'en créer de nouvelles.
  Voir `docs/bmad/03-lot-1-validation.md`.

## Mode diagnostic

Activé par query string `?debug=1` (option la plus simple : une seule page,
un seul socket). `src/main.js` détecte le paramètre et importe dynamiquement
`src/diagnostic/diagnosticPanel.js` (chunk séparé au build -> non chargé en
mode public). Le panneau n'attache **pas** de listeners `connect`/`control`
(doublons vs `socketClient`) : il reçoit le statut et les contrôles via
`setStatus()` / `logControl()` que `main.js` appelle, et réutilise le guard
idempotent pour ses boutons d'observation. Il attache uniquement `onAny` + les
événements Collab-Hub connus (listeners uniques). Le panneau `#diagnostic`
(hidden par défaut) affiche alors : état de connexion, socket id, erreurs,
événements reçus (JSON brut), compteur de contrôles, observation manuelle des
5 headers, toggle `onAny`.

## Dépendances

- Runtime : `socket.io-client` (^4.7).
- Build/dev : `vite` (^5.4).
- Tests : `node:test` + `node:assert` (intégrés à Node, zéro paquet ajouté).
- Aucune autre dépendance. Aucun secret. Aucun stockage local obligatoire.

## Décision namespace `/hub`

Le serveur public v0.3.4 sert **deux namespaces séparés** `/` et `/hub` (un
contrôle publié sur l'un n'est pas reçu sur l'autre — vérifié). Le CH-Client
Max fixe son namespace via `config.json` (défaut `hub`), non modifiable au
runtime. Pour un e2e fonctionnel **sans éditer les fichiers du package
Collab-Hub**, le web utilise le même namespace : `VITE_COLLAB_HUB_NAMESPACE=hub`.
Ceci corrige la conclusion initiale du spike (le `/hub` fonctionne en transport
websocket, contrairement au polling HTTP qui renvoyait 404).