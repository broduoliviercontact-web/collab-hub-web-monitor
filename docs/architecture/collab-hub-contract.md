# Contrat de frontière Collab-Hub

Source de vérité du protocole Collab-Hub côté web (issue #9). Décrit la frontière
commune et les primitives partagées entre les deux clients — la **page publique**
(observer) et la **Control Room** (publisher) — sans fusionner leurs
responsabilités. Le protocole réseau (événement `control`, sémantique
register/deliver, namespace) est **inchangé** ; ce document le formalise.

## Périmètre

Deux clients, même serveur, même namespace, même résolution d'auth :

| Client | Rôle | Module |
|---|---|---|
| `connectCollabHub` | Observer (page publique) : reçoit les 5 contenus + le heartbeat + les headers de flux. | `src/collabHub/socketClient.js` |
| `connectCollabHubPublisher` | Publisher (Control Room) : publie les headers de présence flux (register/deliver). | `src/collabHub/publishClient.js` |

Primitives partagées : `src/collabHub/config.js` (config + options socket),
`messageRouter.js` (headers + routage), `observeGuard.js` (observation idempotente
+ câblage socket), `authMode.js` (résolution auth/URL/namespace).

## Configuration (source unique)

`resolveCollabHubConfig({ env, usernamePrefix })` → `{ serverUrl, namespace, authMode, username }`.

- `serverUrl` : `VITE_COLLAB_HUB_URL` (défaut `https://server.collab-hub.io`), slashs finaux retirés.
- `namespace` : `VITE_COLLAB_HUB_NAMESPACE` (défaut `hub` en production), slashs bordures retirés → `/hub`.
- `authMode` : `VITE_COLLAB_HUB_AUTH_MODE` (production : `anonymous`).
- `username` : `<prefix>_<rand>` — `CH-Web` (page publique), `CH-CR` (Control Room).

`buildSocketOptions({ auth, username })` → options Socket.IO partagées : transport
websocket uniquement, reconnexion auto (backoff 1 s → 5 s max), `auth` + `query.username`.

### Auth

- **anonymous** (défaut, production v0.3.4) : socket direct, **aucune** requête
  `/api/v1/auth/guest` (la route renvoie 404 sur le serveur public). `auth = {}`.
- **guest** : `POST /api/v1/auth/guest` → token utilisé ; fallback anonyme si échec
  réseau/CORS. Code path gardé pour un serveur v0.5 futur, non déployé.

Le publisher reste **anonyme par construction** (n passe pas `authMode`) : il publie
des headers de présence flux publics, aucun token guest nécessaire.

## Headers (source unique)

`src/collabHub/messageRouter.js` est l'unique point de définition et d'export.

| Constante | Headers | Rôle |
|---|---|---|
| `KNOWN_HEADERS` | `sound_title`, `sound_author`, `sound_subtitle`, `sound_description`, `sound_link` | Contenu (5 champs affichés + persistés) |
| `HEARTBEAT_HEADER` | `sound_heartbeat` | Signal d'activité Max (jamais affiché, jamais persisté) |
| `STREAM_HEADERS` | `stream_onair`, `stream_level`, `stream_peak`, `stream_updated_at`, `stream_listener_count` | Présence flux (Control Room → page publique, avant LiveKit). Publics, sans secret. |
| `OBSERVABLE_HEADERS` | `KNOWN_HEADERS` + `HEARTBEAT_HEADER` | Observés au démarrage par la page publique |

`routeControl(data, onUpdate)` ne route que les `KNOWN_HEADERS` (normalise
`values`). Les `STREAM_HEADERS` sont routés par `routeStreamControl` (state/streamStatus).

## Contrats

### observe (page publique)

`observeGuard` : un header n'est émis (`observeControl`) qu'**une seule fois par
socket.id**. Le suivi est vidé lors d'un vrai disconnect ; après un nouveau
connect, on réobserve exactement une fois chaque header.

- `wireSocket` câble un seul listener par événement (`connect`, `reconnect`,
  `reconnect_attempt`, `disconnect`, `connect_error`, `control`).
- Au `connect` : `guard.setConnected(true)` → observe `OBSERVABLE_HEADERS` →
  `onStatus('connected')` (ordre important : observer avant le statut pour que le
  diagnostic voie déjà les 5 headers).
- Au `disconnect` : `guard.setConnected(false)` vide le suivi → `onStatus('disconnected')`.
- L'état affiché n'est pas effacé lors d'une reconnexion (seul le suivi est vidé) ->
  pas de perte de la dernière valeur.

### register / deliver (Control Room)

Le protocole Collab-Hub **n'a pas** d'événement `registerControl`/`deliverControl`
séparé. L'unique événement est `socket.emit('control', { mode:'publish',
target:'all', header, values })` avec une sémantique register/deliver :

1. La **1re publication** d'un header l'**enregistre** seulement
   (`availableControls` serveur) et ne pousse **aucune** valeur aux observers.
2. Seules les publications **subséquentes** livrent la valeur (événement `control`
   reçu côté observer).

Le publisher implémente ce cycle explicitement :

- Au `connect` : `registered.clear()` (nouveau socket.id → l'état serveur a pu
  repartir) → `registerInitial()` (un `emit('control', publish, valeur neutre [0])`
  par header de flux) → flush différé des valeurs en attente.
- `publish(header, values)` : si pas connecté → file d'attente (dernière valeur
  conservée) ; si pas enregistré → register puis livre après délai prudent
  (`REGISTER_FLUSH_MS = 50`) ; si déjà enregistré → deliver direct.
- **Idempotent par socket.id** : le Set `registered` évite tout re-register à
  chaque tick ; `registerCount`/`deliverCount` suivent les passages.

### reconnect (les deux côtés)

Pattern commun, états propres à chaque côté (non fusionnés — voir « Non-fusion ») :

- **Observer** : disconnect vide `observed` ; connect réobserve `OBSERVABLE_HEADERS`.
- **Publisher** : disconnect vide `registered` ; connect réenregistre + flush.

La logique de reconnect **diffère de manière porteuse** : le publisher ne câble que
`connect`/`disconnect` (socket.io fire `connect` à chaque reconnexion) et ne doit
**pas** binder `onConnect` sur `reconnect` séparément, sous peine de double
register (clear + registerInitial deux fois → émissions dupliquées). L'observer,
lui, bind `connect` + `reconnect` (idempotent via le guard). Ne pas forcer un
câblage commun — cela casserait le cycle register/deliver.

## Diagnostics (homogènes)

Les deux clients exposent `getDiagnostics()` avec des champs communs alignés :

- `connected` (bool), `socketId` (string | null)
- Observer : `observedHeaders`, `observedCount`
- Publisher : `registeredHeaders`, `pendingHeaders`, `lastRegisterAt`,
  `lastDeliverAt`, `registerCount`, `deliverCount`, `publishErrors`,
  `lastPublishedValues`, `lastError`

Aucun secret transporté (headers publics, valeurs 0..1 / bool / timestamp / compte).

## Probes — sources de vérité protocolaires

Les probes Node headless (`scripts/diagnostics/`) prouvent les faits du protocole
sur le serveur public v0.3.4. Ils restent la source de vérité ; ce document la
formalise. À rejouer depuis la racine : `node scripts/diagnostics/<probe>.mjs`.

| Probe | Fait prouvé |
|---|---|
| `probe-hub-ns.mjs` | Namespace `/hub` connecte en websocket ; `socket.nsp === '/hub'`. Alignement Max↔web. |
| `probe-observe.mjs` | L'observer reçoit les 5 headers observés. |
| `probe-order.mjs` | `observeControl` avant publication : l'observer reçoit la 1re valeur poussée. |
| `probe-e2e2.mjs` | Cycle register/deliver complet : 1re publication = register (pas de push), publication subséquente = delivery aux observers ; isolation namespace `/hub` vs racine. |

Voir `scripts/diagnostics/README.md` pour le détail.

## Ce qui ne change pas

- Protocole réseau : événement `control` unique, sémantique register/deliver.
- Namespace `/hub`.
- Patch Max (`max/`).
- Grants LiveKit, sécurité/session, persistance locale.
- Aucune fusion artificielle des deux clients en un objet géant : frontière commune
  + primitives partagées uniquement.