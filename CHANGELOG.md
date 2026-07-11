# Changelog

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