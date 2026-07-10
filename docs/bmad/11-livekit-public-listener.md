# 11 — Moteur listener LiveKit et écoute publique (Lot 4D)

Objectif : créer le moteur listener (rôle `listener`, room `main`, abonnement
audio uniquement), l'adaptateur `<audio>` DOM, une petite section publique
d'écoute additive, et le diagnostic associé. **Aucune publication, aucun micro
demandé côté listener, aucune Control Room performer, aucune release.** Le
performer reste non câblé à l'UI (Lot 4E).

## Contraintes respectées

- Patch Max, 5 headers Collab-Hub, design : inchangés (section additive).
- Aucun secret exposé ; `livekit-server-sdk` jamais importé côté navigateur.
- Mot de passe performer jamais demandé côté listener (token listener sans mot
  de passe).
- `canPublish:false` pour le listener (grants du endpoint Lot 4C, inchangés).
- Token uniquement en mémoire (jamais localStorage/sessionStorage).
- Pas de son lancé sans geste utilisateur (autoplay géré, non contourné).
- Pas de vidéo (pistes vidéo ignorées).
- Page `/control-room` non créée ; version `1.0.1`, tag/release : inchangés.
- Aucun React, aucun backend supplémentaire ; endpoint Lot 4C réutilisé tel quel.

## Architecture

```
src/main.js
  └─ if (VITE_LIVEKIT_ENABLED)  import() dynamique
       src/listener/listenerSection.js        (orchestrateur + UI)
         ├─ src/listener/listenerUI.js         (PUR : DOM build/render/wire, isLiveKitEnabled)
         ├─ src/listener/listenerAudioElement.js (adaptateur <audio>, audioSink)
         ├─ src/livekit/livekitListener.js     (moteur, injectable, SANS DOM)
         ├─ src/livekit/livekitBrowser.js      (seul import de livekit-client)
         └─ src/livekit/tokenClient.js         (POST /api/livekit/token, Lot 4C)
```

Séparation : le **moteur** (`livekitListener`) ne dépend ni du DOM ni de
livekit-client (tout est injecté : `RoomClass`, `roomEvents`, `trackKinds`,
`audioSink`, `tokenClient`) → testable en Node. L'**adaptateur DOM**
(`listenerAudioElement`) isole l'élément `<audio>`. L'**UI pure** (`listenerUI`)
construit/rend/câble la section. L'**orchestrateur** (`listenerSection`) est le
seul module navigateur qui importe `livekit-client` (via `livekitBrowser`).

## Import dynamique & activation (§11)

`VITE_LIVEKIT_ENABLED` (variable publique, pas de secret) :

- `"true"` → section active ; `import('./listener/listenerSection.js')` dynamique
  → le SDK `livekit-client` n'est chargé qu'alors (chunk séparé).
- absent / `"false"` → section masquée, **aucun** chargement du SDK.
- valeur inconnue → `false` + `console.warn` discret (`isLiveKitEnabled`).

`isLiveKitEnabled` vit dans `listenerUI.js` (pur, testé). Importé statiquement
par `main.js` (mini, sans livekit-client) ; seul `listenerSection` reste
dynamique. Rollup constant-fold `isLiveKitEnabled(<littéral>)` lorsque la
variable d'env est définie au build → **dead-code elimination** du bloc listener
entier (SDK compris) tant que la variable est absente/`"false"`.

### Impact bundle (§22)

- **Variable absente / `"false"` (défaut, CI, Vercel tant que non activée)** :
  le bloc listener est éliminé à la compilation → `livekit-client` absent du
  build, aucun chunk listener. Bundle public ~inchangé (hors ajout léger du
  gate + diagnostic LiveKit dans `main.js`/`diagnosticPanel`, qui restent
  no-op sans listener). Vérifié : aucun `trackSubscribed`/`RemoteAudioTrack`
  dans le bundle par défaut.
- **Variable `"true"`** : chunk dynamique `listenerSection-<hash>.js` créé
  (~518 ko / ~136 ko gzip, contient `livekit-client`), chargé uniquement à
  l'activation. Bundle principal +~3 ko (gate + UI). Avertissement Vite
  « chunk > 500 ko » attendu (dépendance livekit-client, à la demande).

## Token listener (§5)

`requestLiveKitToken({ role: 'listener' })` (Lot 4C, sans mot de passe). Le
endpoint renvoie `{ token, url, room:'main', identity, role, expiresIn }`. Le
token reste en mémoire dans le moteur, jamais loggué, jamais stocké. Aucune
valeur secrète n'est renvoyée au navigateur (clé API = `iss` du JWT, publique par
conception LiveKit ; secret jamais présent).

## Connexion (§5)

1. `requestLiveKitToken({ role: 'listener' })` ;
2. `new RoomClass(roomOptions)` ;
3. listeners Room enregistrés **avant** `room.connect` ;
4. `room.connect(url, token)` → `connected` ;
5. `waiting_for_track` (le performer peut être absent).

Le listener **ne publie jamais** ; aucune méthode `publish`, aucun accès à
`localParticipant.publishTrack`, aucun `getUserMedia`, aucune permission micro.

## Machine d'état (§4)

```
idle → requesting_token → connecting → connected → waiting_for_track
        → track_available ─┐
        → waiting_for_user ┤ (autoplay bloqué) → startAudio() → playing
        → playing ←─────────┘
reconnecting ← (Reconnecting) ; (Reconnected) → playing | waiting_for_track | waiting_for_user
stopping → stopped ; error (token/connect/disconnected)
```

Snapshot : `{ state, roomName, identity, connected, participantCount,
hasAudioTrack, audioTrackSid, performerIdentity, autoplayBlocked, volume,
muted, reconnectCount, connectedAt, playingSince, lastError }`.
**Jamais** : token, objet Room, secret, MediaStream complet, HTMLAudioElement.

## Gestion des pistes distantes (§6)

Événements (`RoomEvent`) : `TrackSubscribed`, `TrackUnsubscribed`,
`ParticipantConnected`, `ParticipantDisconnected`, `Reconnecting`,
`Reconnected`, `Disconnected` (valeurs string injectées via `roomEvents`).

`TrackSubscribed(track, publication, participant)` :

- ignore `track.kind !== audio` (vidéo ignorée) ;
- sélection `selectProgramTrack` : priorité `track.name === "program-audio"` ;
  à défaut la première piste audio distante ; **jamais** plusieurs pistes
  programme simultanément (une piste nommée `program-audio` remplace une piste
  non-program courante, sinon la nouvelle est ignorée) ;
- `audioSink.attachTrack(track)` + application volume/muted ;
- `performerIdentity = participant.identity`, `audioTrackSid = track.sid` ;
- tentative `audioSink.play()` (voir autoplay).

`TrackUnsubscribed(track)` : si c'est la piste courante → `audioSink.detachTrack()`
+ vidage des références → `waiting_for_track`. Pas d'élément `<audio>` orphelin.

## Autoplay navigateur (§8)

`audioSink.play()` (=`HTMLAudioElement.play()`) peut rejeter `NotAllowedError` :

- non fatal → `autoplayBlocked = true`, état `waiting_for_user` ;
- l'UI montre un bouton **ÉCOUTER LE DIRECT** ; clic → `startAudio()` →
  `play()` → succès → `autoplayBlocked = false`, état `playing`.

Aucun contournement des règles navigateur, aucun `play()` en boucle. Autre
rejet (non-autoplay) → `track_available` (retry possible via `startAudio`).

## Volume et mute (§9)

- volume utilisateur borné `[0, 1]` (clamp), défaut `0.8` ;
- mute booléen, indépendant du volume, **ne déconnecte pas** la room ;
- appliqué à l'`audioSink` (`el.volume` / `el.muted`) à l'attachement et au
  changement. Le volume performer n'est jamais utilisé comme volume listener.

## Performer absent (§13)

Room vide → état `waiting_for_track`, `En attente du direct`, `lastError:null`.
Le listener reste connecté, reçoit la piste lorsqu'elle arrive (`TrackSubscribed`
peut arriver bien après la connexion). Pas de boucle de requêtes token, pas
d'erreur sur l'absence de piste. Le listener peut être ouvert avant le performer.

## Reconnexion (§14)

Reconnexion native LiveKit (pas de boucle manuelle) :

- `Reconnecting` → `reconnecting`, `reconnectCount++` ;
- `Reconnected` → `playing` si piste courante et `wasPlaying`, sinon
  `waiting_for_track` / `waiting_for_user` ; la piste est re-rattachée par un
  nouveau `TrackSubscribed` si besoin ;
- `Disconnected` involontaire → `error` (proposer **RÉESSAYER**). Pas de nouveau
  token immédiat.

## Arrêt (§15)

`stop()`/`disconnect()` : `audioSink.pause()` + `detachTrack()` + retirer les
listeners Room + `room.disconnect()` + vider identity/room → `stopped`.
`destroy()` idempotent. `beforeunload` → `destroy()` non bloquant, sans fetch
supplémentaire, sans log de token.

## Section publique (§10)

Section additive (carte `.lk-listener` insérée après la carte principale),
construite par `buildListenerDOM` (`listenerUI.js`). Reutilise les conventions
graphiques (variables CSS, bordures, typographie, `.status-dot`). Contenu :

- titre **DIRECT AUDIO** ;
- statut : `Hors ligne` / `Connexion…` / `En attente du direct` / `Direct
  disponible` / `Lecture en cours` / `Reconnexion…` / `Erreur audio` ;
- bouton principal **ÉCOUTER LE DIRECT** (ou **RÉESSAYER** en erreur) ;
- bouton **COUPER** / **RÉACTIVER** ;
- slider volume + niveau en pourcentage.

Le contenu Collab-Hub reste prioritaire ; pas de dashboard supplémentaire.

### Stratégie de connexion (§12)

**Connexion au premier clic utilisateur** : pas de connexion automatique au
chargement. Le clic sur ÉCOUTER LE DIRECT déclenche `connect()` (token + Room) ;
la piste est jouée dès que possible grâce au geste. Si l'autoplay est bloqué
(geste expiré pendant la négociation), l'utilisateur clique à nouveau
(`startAudio()`).

## Sécurité (§16)

- token listener sans `canPublish` (grants endpoint Lot 4C) ;
- aucun secret dans le bundle (vérifié : `livekit-client` absent du build par
  défaut ; `livekit-server-sdk` hors graphe Vite) ;
- token uniquement en mémoire ;
- aucune API key/secret en localStorage ; aucune publication locale ;
- aucun `getUserMedia` / permission micro côté listener ;
- endpoint same-origin (`/api/livekit/token`) ;
- aucune valeur de mot de passe performer dans la page publique.
- `scripts/check-livekit-secrets.mjs` : scanne le code source (extensions JS/TS)
  pour `VITE_LIVEKIT_API_KEY/SECRET` et tout JWT littéral ; intégré à
  `npm run check`. (Le scan VITE_ est restreint au code : un identificateur cité
  en documentation n'est pas une fuite ; `.env.example` skippé, placeholders
  autorisés. Wiring CI reporté — édition web `ci.yml`.)

## Diagnostic (§20)

Dans `?debug=1` uniquement, section `LiveKit (listener)` alimentée par
`diagnosticPanel.refreshLivekit()` (timer central 1 s) via un fournisseur
`livekitDiag` passé par `main.js` : `enabled`, état, room, identity, participant
count, track SID, performer identity, volume, muted, autoplay bloqué, reconnect
count, dernière erreur. **Jamais** : token, API key, API secret, mot de passe
(le snapshot n'en contient pas).

## Tests (§17/§18/§19)

- **Moteur listener (30)** : token listener demandé, connexion Room, aucun
  publish, `connected`, attente piste, piste audio reçue, piste vidéo ignorée,
  priorité `program-audio`, 2e piste ignorée, détachement à unsubscribe,
  performer identifié, autoplay bloqué, `waiting_for_user`, `startAudio` succès,
  `playing`, volume borné 0/1, mute/unmute, reconnecting, reconnected,
  disconnect involontaire (error) / volontaire (stopped), destroy idempotent,
  snapshot sans token / sans Room, performer absent non erreur, piste arrivée
  après connexion, retry après erreur, aucun getUserMedia.
- **Adaptateur audio (12)** : création, pas de play à la construction,
  attach/detach, play succès/NotAllowedError, volume, mute, pause, destroy,
  retrait si propriétaire, conservation si élément fourni.
- **UI publique (13)** : `isLiveKitEnabled` false/absent/vide/inconnu(warning),
  bouton visible, premier clic → onPrimary, statuts attente/lecture, mute
  COUPER/RÉACTIVER, volume slider+pourcentage+onVolume, erreur+RÉESSAYER,
  carte séparée, diagnostic panel + extension LiveKit.

**196 tests au total** (141 + 55). Aucun test ne nécessite Internet, vrai
LiveKit, vraie API key/secret, navigateur ou micro.

## Configuration (§21)

`.env.example` documente `VITE_LIVEKIT_ENABLED=false` (variable publique, pas de
secret). Acceptable de laisser `false` en production jusqu'au test manuel ;
passer à `true` dans Vercel (Environment Variables) après validation, puis
redeploy.

## Procédure de test manuel (§24)

Avec `VITE_LIVEKIT_ENABLED=true` localement (`vercel dev`, CLI non installée
comme dépendance projet) et les 4 variables serveur configurées dans Vercel :

1. ouvrir la page ; 2. cliquer **ÉCOUTER LE DIRECT** ; 3. vérifier le token
listener (`?debug=1`) ; 4. `En attente du direct` sans performer ; 5. lancer un
publisher de test ; 6. vérifier la lecture ; 7. tester mute ; 8. tester volume ;
9. couper le publisher → retour `En attente du direct` ; 10. tester la
reconnexion. Ne jamais partager les valeurs des variables serveur.

## Limites restantes

- Performer (publisher Lot 4C) non câblé à l'UI ; pas de Control Room, pas
  d'indicateur ON AIR (Lot 4E).
- `VITE_LIVEKIT_ENABLED=false` par défaut : la section n'est pas active en
  production tant que la variable n'est pas passée à `true` dans Vercel + redeploy.
- Pas de refresh token (TTL 2 h ; reconnexion native suffit en session courte).
- Protection multi-performers = mot de passe + identity unique (partage
  possible) — inchangé depuis Lot 4C.
- Wiring du script `check-livekit-secrets` dans la CI reporté (édition web
  `.github/workflows/ci.yml`, pas le scope `workflow` du token actuel).
- Chunk `listenerSection` > 500 ko lorsque activé (avertissement Vite, à la
  demande) — `manualChunks` non configuré (hors périmètre).
- Vulnérabilités `npm audit` (esbuild/vite, devDeps, préexistantes) non corrigées.