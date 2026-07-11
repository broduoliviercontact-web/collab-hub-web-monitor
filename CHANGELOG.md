# Changelog

## [1.1.2] - 2026-07-11

### Fixed
- **Listener LiveKit robuste multi-client + iOS** : le bug runtime persistant
  après v1.1.1 (listener connecté à `room main`, même `roomID`, mais état final
  `waiting_for_track`, `participantCount=0`, `trackSid=null`, `performer=null`,
  aucune erreur ; un autre listener pouvait parfois jouer correctement ; iOS ne
  jouait pas) est corrigé à la racine.
  - **Race `TrackSubscribed`** : `TrackSubscribed` peut se déclencher *pendant*
    `await room.connect()`, avant que l'état ne passe à `connected`. Le garde
    `if (destroyed || !isConnected) return;` rejetait l'évènement → piste perdue.
    Le garde devient `if (destroyed || !room || userStopped) return;` (le
    `!isConnected` est supprimé) : la piste est acceptée dès que la Room existe,
    y compris pendant `connecting`. Reste idempotent via `selectProgramTrack`.
  - **Réconciliation des participants existants** : nouvelle fonction pure
    `reconcileRemoteParticipants()` (testable via `scanRemoteAudio(room)`)
    appelée après `room.connect()`, `ParticipantConnected`, `TrackPublished`,
    `TrackSubscriptionStatusChanged`, `Reconnected`, plus retry borné
    `[100, 300, 750] ms` puis arrêt (pas de polling infini). Recalcule
    `participantCount` depuis `room.remoteParticipants.size`, itère tous les
    participants et leurs `audioTrackPublications`, priorise program-audio
    (deux passes), attache `pub.track` si présent. Idempotent (pas de double
    attach) ; anti-spam via un `Set` de `requestedSubscriptions`.
  - **`setSubscribed(true)` explicite** : une publication audio avec
    `track === null` (publiée mais non souscrite) déclenche `pub.setSubscribed(true)`
    si la méthode existe, puis reste en attente de `TrackSubscribed`. Nouveaux
    évènements injectables câblés : `TrackPublished`,
    `TrackSubscriptionStatusChanged`, `AudioPlaybackStatusChanged`.
  - **`participantCount` corrigé** : `participantCount =
    room.remoteParticipants?.size ?? 0` après connexion et à chaque
    réconciliation (pas seulement sur `ParticipantConnected`) — le diagnostic
    reflète désormais les participants déjà présents.
  - **iOS/Safari `room.startAudio()`** : `startAudio()` appelle
    `room.startAudio()` (instance method de `livekit-client ^2.20.1`) dans le
    geste utilisateur puis `audioSink.play()` ; si aucune piste n'est encore
    là, `audioUnlocked=true` et l'attachement + replay se font au
    `TrackSubscribed` suivant. Fallback **ACTIVER LE SON** : si Safari refuse
    l'autoplay (`NotAllowedError`) → `waiting_for_user`, `autoplayBlocked=true`,
    bouton dédié affiché ; second geste → `room.startAudio()` + `play()` →
    `playing`.
  - **Microtask ordering** : `attemptPlay` pouvait passer à `playing` pendant
    `connect()` puis se faire écraser par la continuation de `connect()`
    (`connected`). Garde `if (state === 'connecting') setState('connected');`
    — on ne régresse pas un état déjà avancé.
- **Diagnostics** (snapshot + panneau `?debug=1`, aucun token/secret) :
  `audioUnlocked`, `roomCanPlaybackAudio`, `existingParticipants`,
  `existingAudioPublications`, `subscribedAudioPublications`,
  `reconciliationCount`, `lastTrackEvent`, `lastTrackPublishedAt`,
  `lastTrackSubscribedAt`.

### Tests
- 330 → 350 (+20) : `scanRemoteAudio` (4) + F.1–F.15 couvrant les 12 cas
  obligatoires (race `TrackSubscribed` pendant `connect()`, participant présent
  avant connect, pub audio avec piste immédiate, pub `track=null` →
  `setSubscribed(true)`, `TrackSubscribed` après réconciliation, 2 listeners
  successifs, `Reconnected` relance la réconciliation, pas de double attach,
  iOS `room.startAudio()` dans le geste, autoplay refusé → `waiting_for_user` +
  bouton ACTIVER LE SON, second geste → `playing`, `participantCount` reflète
  les `remoteParticipants` existants) + retry borné + anti-spam + snapshot sans
  secret. `npm run check` vert.

### Validation runtime
- **3 listeners simultanés** sur réseaux différents (ordinateur Wi-Fi,
  partage de connexion, iOS) : tous se connectent et entendent le stream.
  Multi-listener OK, iOS OK, performer déjà ON AIR avant connexion OK, Track
  SID reçu, participant performer détecté, pas de double audio, aucune erreur
  bloquante.

## [1.1.1] - 2026-07-11

### Fixed
- **Multi-listener** : un second listener rejoignant une room où le performer
  diffuse déjà restait bloqué en `waiting_for_track` (aucun son, aucune erreur).
  Cause racine : les publications audio déjà publiées au moment de `connect()`
  n'étaient pas rattachées (`TrackSubscribed` peut se déclencher pendant la
  résolution de `room.connect()`, avant le câblage effectif des handlers —
  race). Après `room.connect()`, on inspecte désormais `room.remoteParticipants`
  → `trackPublications` et on rattache toute piste audio déjà présente
  (`attachExistingAudioTracks`, idempotent avec `TrackSubscribed` via
  `selectProgramTrack`). `setState('waiting_for_track')` ne se déclenche que si
  aucune piste n'a été rattachée.

### Tests
- 326 → 330 (+4) : 2e listener pendant qu'un performer publie déjà (sans
  `TrackSubscribed`), `TrackSubscribed` tardif sans double rattachement,
  participant déjà présent (`participants=0` attendu), aucun participant
  (comportement inchangé). `npm run check` vert.

## [1.1.0] - 2026-07-10

### Added
- Control Room performer (route `/control-room`) : capture audio locale, sélection BlackHole/Loopback, vumètre, gain master, publication LiveKit, statut ON AIR, reconnexion, diagnostic ;
- page publique enrichie d'une section « Direct Audio » (listener LiveKit) ;
- architecture multi-entry Vite (`index.html` + `control-room.html`, routeur single-entry) ;
- backend token LiveKit serverless (`api/livekit/token.js`) ;
- moteur audio local (permission, graphe Web Audio, gain, vumètre) ;
- publisher LiveKit (connecte le `MediaStream` post-fader à LiveKit) ;
- reconnexion native (performer et listener) ;
- diagnostic audio/LiveKit (`?debug=1`, sans secret).
- **Lot 4F.1** : accès Control Room protégé par session serveur signée
  (HMAC-SHA256, cookie `control_room_session`, 2 h, HttpOnly, SameSite=Strict,
  Secure en production) ; endpoints `POST /api/control-room/login`,
  `POST /api/control-room/logout`, `GET /api/control-room/session` ; gate page
  léger (~16 ko, sans `livekit-client`) chargé avant auth, Control Room lourde
  importée dynamiquement après auth ; bouton enceinte listener accessible
  (🔊/🔉/🔇, clic = mute, double-clic = atténuation −20 dB, bouton secondaire
  pour clavier/tactile) ; 55 tests (271 → 326).

### Changed
- `src/main.js` devient un routeur (pathname → page publique | Control Room) ;
- `vercel.json` ajoute le rewrite `/control-room` → `control-room.html` ;
- `vite.config.js` déclare un second point d'entrée HTML ;
- `livekitBrowser.js` re-exporte `LocalAudioTrack` + `AudioPresets`.
- **Lot 4F.1** : `POST /api/livekit/token` ne compare plus de mot de passe pour
  le rôle performer (vérifie le cookie de session à la place) ; le champ
  `password` du corps est ignoré ; le mot de passe est demandé une seule fois
  (à la connexion Control Room) ; `tokenClient` envoie `credentials:'same-origin'`.

### Fixed
- Aucun correctif de code apporté pendant le Lot 4F : la revue de code et les
  vérifications automatisées n'ont révélé aucun défaut (grants, TTL, contraintes
  musique, autoplay, reconnexion, secrets). Les tests runtime physiques
  (Ableton+BlackHole, Chrome/Safari/mobile, coupure réseau, devicechange,
  qualité audio) restent à valider manuellement — voir
  `docs/bmad/13-livekit-stabilization-and-release.md`.
- **Lot 4F.1** : le mot de passe performer n'est plus transmis à chaque demande
  de token (cause racine : session serveur, pas de garde-fou client).

### Security
- tokens LiveKit temporaires (TTL 2 h, `Cache-Control: no-store`) ;
- secrets serveur uniquement (`LIVEKIT_URL`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET`, `PERFORMER_PASSWORD` — jamais préfixés `VITE_`) ;
- mot de passe performer jamais stocké / loggué / reflété (transmis uniquement
  à l'endpoint, vidé après succès) ;
- listener sans droit de publication (`canPublish:false`) ;
- performer sans droit de souscription (`canSubscribe:false`) ;
- contrôle automatique des secrets (`scripts/check-livekit-secrets.mjs` dans
  `npm run check`).
- **Lot 4F.1** : session Control Room signée HMAC-SHA256
  (`CONTROL_ROOM_SESSION_SECRET`, distincte, jamais `VITE_`) ; `PERFORMER_PASSWORD`
  jamais utilisée comme clé de signature ; comparaisons timing-safe (mot de
  passe + MAC) ; 401 génériques ; aucun mot de passe / secret / token loggué ou
  reflété ; `check-livekit-secrets` refuse `VITE_CONTROL_ROOM_SESSION_SECRET`.

## [1.0.1] - 2026-07-10

### Added
- licence GNU General Public License v3.0 only ;
- fichier `LICENSE` à la racine (texte officiel complet, non modifié) ;
- licence incluse dans le package Max téléchargeable ;
- identifiant SPDX `GPL-3.0-only` dans les métadonnées pertinentes.

### Changed
- nom du package npm interne remplacé par `collab-hub-web-monitor` ;
- version du package mise à jour vers 1.0.1 ;
- documentation de distribution mise à jour.

### Fixed
- absence de licence explicite dans la release v1.0.0.

## [1.0.0] - 2026-07-10

### Added
- affichage temps réel des cinq champs (titre, auteur, sous-titre, description, lien) depuis Max/MSP via Collab-Hub ;
- patch Max/MSP émetteur `CollabHub_Web_Text_Sender.maxpat` ;
- bouton global « ENVOYER LES 5 CHAMPS » en double passage (register + deliver) ;
- persistance locale du dernier contenu (`localStorage`, clé `collabHubSoundState:v1`) ;
- heartbeat Max (`sound_heartbeat` toutes les 10 s) ;
- fraîcheur du contenu (statut Max actif/silencieux, contenu récent/ancien) ;
- diagnostic `?debug=1` (panneau séparé, observation idempotente, persistance) ;
- CI GitHub Actions (`.github/workflows/ci.yml`) : tests, validation Max, build, contrôle des fichiers sensibles ;
- déploiement Vercel (SPA statique, Git auto-redeploy).

### Fixed
- fallback auth anonymous (socket direct, aucune requête `/api/v1/auth/guest` sur le serveur public v0.3.4) ;
- bouton global Max (`pipe 0 50 100 150 200` remplacé par `t b b` + `send/receive ch_pub5` + `delay 300`, 10 déclenchements déterministes) ;
- validation des URLs (`http`/`https` uniquement, `javascript:`/`data:`/vide → lien masqué) ;
- reconnexion et observation idempotente (un header observé une fois par `socket.id`, réobservation unique à la reconnexion).

### Security
- pas de `innerHTML` (rendu via `textContent`/`setAttribute`) ;
- validation `http`/`https` des liens, revalidation au rendu après restauration `localStorage` ;
- contrôle des fichiers sensibles suivis par Git (`scripts/check-tracked-files.mjs`) ;
- aucun secret dans le dépôt (`.env*` gitignoré sauf `.env.example`).