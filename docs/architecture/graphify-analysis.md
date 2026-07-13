# Graphify — Analyse architecturale (10 requêtes)

Résultats des 10 requêtes Graphify exécutées sur le graphe généré
(`graphify-out/graph.json`, commit `c28b261`, 563 nœuds / 1051 arêtes /
53 communautés). Réponses tirées **uniquement** du graphe produit par la
pipeline réelle (AST + sémantique), via `graphify query` / `graphify path`.

---

## Q1 — Nœuds centraux du projet

Les *god nodes* (nœuds les plus connectés) :

1. `Collab-Hub Web Monitor (project overview)` — 16 arêtes (README, hub documentaire)
2. `mountPublicPage()` — 15 arêtes (entrée page publique)
3. `handler()` — 11 arêtes (handlers serverless login/session)
4. `KNOWN_HEADERS` — 11 arêtes (5 champs `sound_*`, cœur protocole)
5. `handler()` — 10 arêtes (handler `token.js`)
6. `connectCollabHubPublisher()` — 9 arêtes
7. `mountControlRoom()` — 9 arêtes
8. `STREAM_HEADERS` — 8 arêtes (headers `stream_*`)
9. `connectCollabHub()` — 8 arêtes
10. `scripts` — 9 arêtes

**Lecture** : le hub est documentaire (README), les points d'entrée sont
`mountPublicPage` (public) et `mountControlRoom` (performer). Le cœur métier
est le protocole Collab-Hub (`KNOWN_HEADERS`, `STREAM_HEADERS`,
`connectCollabHub` / `connectCollabHubPublisher`).

---

## Q2 — Chemin complet Ableton → BlackHole → LiveKit → listener

`graphify path "audioEngine.js" "livekitPublisher.js"` puis
`"livekitPublisher.js" "livekitListener.js"` :

```
audioEngine.js  --(imports)-->  livekitPublisher.js   [capture → publication]
livekitPublisher.js  --(program-audio)-->  livekitListener.js   [diffusion → réception]
```

Chaîne fonctionnelle (hyperedge **LiveKit program-audio pipeline**) :
`audio_engine` (capture BlackHole/Loopback via `audioDevices`) → `publisher`
(`createLiveKitPublisher`, piste `program-audio`) → `control_room_page`
(ON AIR, vumètre) → `stream_presence_publisher` (compteur auditeurs) →
`listener_engine` (`createLiveKitListener`, souscription piste, `room.startAudio` iOS).

Note : le shortest-path non orienté passe par `runTests.mjs` (qui importe les
deux bouts) — le chemin **fonctionnel** réel est porté par l'hyperedge
program-audio ci-dessus.

---

## Q3 — Chemin Max → Collab-Hub → page publique

`graphify path "CollabHub_Web_Text_Sender.maxpat (Max patch)" "Public Now-Playing page (5 fields, real-time)"` :

```
CollabHub_Web_Text_Sender.maxpat  --cites [EXTRACTED]-->  Collab-Hub Web Monitor (project overview)
                                                       --references [EXTRACTED]-->  Public Now-Playing page
```

Hyperedge **Max patch → Collab-Hub namespace /hub → web public page protocol
chain** : `max_readme_collabhub_web_text_sender` → `readme_namespacehub` →
`readme_publicpage` → `max_readme_registerdeliver`. Le patch publie les 5
headers via le client Collab-Hub Max, le namespace `/hub` achemine, la page
 publique `mountPublicPage` reçoit via `connectCollabHub` + `routeControl`.

---

## Q4 — Modules qui touchent aux secrets

`graphify query "...secrets, tokens, passwords, cookies, API keys, session secrets"` :

- **Serverless API** (communauté 4) : `api/control-room/login.js`,
  `session.js`, `api/livekit/token.js`, `src/server/controlRoomSession.js`
  (`safeEqualPassword`, `validateSessionConfig`, `isSecureEnv`,
  `createSessionValue`, `verifySessionValue`, `readSessionCookie`,
  `setCookieString`, HMAC-SHA256 cookie).
- **Control Room gate** (communauté 12) : `controlRoomGate.js`,
  `controlRoomGatePage.js`, `controlRoomView.js` (`buildLoginDOM`,
  `renderLogin`, `wireLogin`), `sessionClient.js` (`checkSession`).

**Lecture** : les secrets sont confinés au périmètre serverless + gate
(communautés 4 et 12). Aucune valeur de secret n'est dans le graphe — seuls
les noms de variables et les noms de fonctions de manipulation apparaissent.

---

## Q5 — Modules dépendant de `livekit-client`

`graphify query "...depend on livekit-client SDK"` → **communauté 5** entière
(Public Listener & LiveKit Client) :

- `src/listener/listenerSection.js` (`mountListenerSection`)
- `src/livekit/tokenClient.js` (`requestLiveKitToken`)
- `src/listener/listenerUI.js` (`buildListenerDOM`, `renderListenerState`,
  `wireListenerControls`)
- `src/listener/listenerAudioElement.js` (`createListenerAudioElement`)
- `src/livekit/livekitListener.js` (`createLiveKitListener`)
- `src/livekit/livekitBrowser.js` (`trackKinds`, import dynamique du SDK)
- + `mountPublicPage` (gate `VITE_LIVEKIT_ENABLED`, import dynamique)

**Lecture** : le SDK `livekit-client` n'est chargé que côté listener public,
import dynamique gated par `VITE_LIVEKIT_ENABLED` — aucun chargement si
désactivé. (Voir aussi `package.json` communauté 9 : dépendances
`livekit-client`, `livekit-server-sdk`, `socket.io-client`.)

---

## Q6 — Chemin login → cookie → token performer

`graphify path "login.js" "token.js"` :

```
login.js  --re_exports [EXTRACTED]-->  controlRoomSession.js
                                     <--imports_from [EXTRACTED]--  token.js
```

Flux (hyperedge **Token + grants + session security model**) :
`login.js` vérifie `PERFORMER_PASSWORD` via `safeEqualPassword`
(timingSafeEqual) → `controlRoomSession.js` signe le cookie HMAC-SHA256
(`createSessionValue`/`setCookieString`) → `session.js` valide la session
(`verifySessionValue`/`readSessionCookie`) → `token.js` délivre un token
LiveKit `performer` (grants performer, room `main`) après session valide.

---

## Q7 — Comment le compteur d'auditeurs arrive sur la page publique

`graphify query "How does the live listener count reach the public page"` :

```
livekitPublisher.js (countLiveListeners)        [communauté 8, Control Room]
  -> streamPresencePublisher.js (toCount)       [publie stream_listener_count]
  -> Collab-Hub socket (publishClient / socketClient / messageRouter / STREAM_HEADERS)
  -> publicPage.js mountPublicPage (routeStreamControl)
  -> streamStatus.js (getSnapshot, listenerCountKnown)
  -> streamStatusView.js (renderStreamStatus)   [affichage page publique]
```

**Lecture** : le compteur naît côté Control Room (`countLiveListeners` =
participants LiveKit distants d'identity `listener-*`), est publié via
Collab-Hub comme header `stream_listener_count`, reçu par la page publique,
routé par `streamStatus`, rendu par `streamStatusView`. Le graphe capture
bien la traversée Control Room → Collab-Hub → page publique.

---

## Q8 — Modules affectés par un changement du protocole Collab-Hub

`graphify query "...change to Collab-Hub protocol headers or register/deliver semantics"` :

- **Cœur protocole** : `messageRouter.js` (`KNOWN_HEADERS`, `STREAM_HEADERS`,
  `routeControl`), `publishClient.js` (`connectCollabHubPublisher`),
  `socketClient.js` (`connectCollabHub`), `observeGuard.js`.
- **Fraîcheur** : `freshness.js` (heartbeat, seuils).
- **Diagnostic/Ops** : `diagnosticPanel.js`, `headerTracker.js`,
  `diagnosticExport.js`, `diagnosticSanitizer.js`, `systemHealth.js`
  (`deriveSystemHealth`).
- **Control Room** : `controlRoomController.js`, `controlRoomPage.js`,
  `controlRoomView.js`, `streamPresencePublisher.js`, `livekitPublisher.js`.
- **Public** : `mountPublicPage`.

**Lecture** : le rayon d'impact d'un changement de protocole est large —
il traverse les communautés 0 (socket/routing), 6 (ops debug), 8 (control room),
11 (stream status). `KNOWN_HEADERS`/`STREAM_HEADERS` sont les points de
centralisation : un changement de header touche routeur + publisher +
listener + diagnostic + freshness simultanément.

---

## Q9 — God nodes détectés

(Voir Q1.) Les 10 god nodes confirment une architecture à deux points d'entrée
(`mountPublicPage`, `mountControlRoom`) unifiés par le protocole Collab-Hub
(`KNOWN_HEADERS`, `STREAM_HEADERS`, `connectCollabHub*`), avec un hub
documentaire (README) et un périmètre serverless (`handler`).

---

## Q10 — Connexions surprenantes ou fragiles

- `mountListenerSection()` --indirect_call--> `b()` (probe-order.mjs) :
  couplage de motifs entre le listener et les probes de diagnostic.
- `createBoundedEventLog()` --indirect_call--> `add()` via `runTests.mjs` :
  le ring buffer ops-debug et ses tests sont fortement liés.
- `Namespace /hub requirement` est `rationale_for` de **deux** artefacts
  (`ch.client.maxpat` + `probe-hub-ns.mjs`) : une décision documentée
  justifie plusieurs implémentations.
- **Aucun cycle d'import** : pas de dépendance circulaire détectée — le graphe
  est acyclique côté imports.
- **Point de fragilité implicite** : `KNOWN_HEADERS`/`STREAM_HEADERS`
  (god nodes) centralisent le protocole — toute évolution doit passer par
  eux (cf. Q8), ce qui est à la fois une force (point unique) et un point
  de fragilité (blast radius large).

---

## Cartographie §8 (domaines attendus vs communautés détectées)

| Domaine attendu | Communautés Graphify |
|---|---|
| Interface publique | C0 (socket/routing), C11 (stream status), C24 (rich sound_link), C2 (docs) |
| Control Room | C8 (publisher/count), C12 (auth gate), C7 (audio engine), C19 (state machines) |
| LiveKit | C5 (listener client), C4 (token/session serverless), C33/C34 (grants/server vars) |
| Collab-Hub | C0, C3 (concepts), C10 (max validator), C23 (publish semantics), C30 (observe guard) |
| Serverless & sécurité | C4, C15 (secret checker), C16 (license), C17 (tracked) |
| Tests & CI | C1 (test core), C18/C21/C22 (fakes), C32 (CI) |

Tous les domaines de l'architecture attendue (§8) sont détectés par Graphify.