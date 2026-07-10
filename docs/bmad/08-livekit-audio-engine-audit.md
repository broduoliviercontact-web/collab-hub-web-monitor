# 08 — Audit du moteur audio LiveKit et plan de migration (Lot 4A)

Objectif : auditer le moteur audio de l'ancien projet `ableton-blackhole-radio`,
identifier les modules réutilisables, vérifier la génération des tokens LiveKit,
et préparer l'architecture d'intégration dans `collab-hub-web-monitor`. **Ce lot
est un audit et un plan — aucun code fonctionnel n'est ajouté**, l'interface
publique n'est pas modifiée, aucune release n'est créée.

## Chemin de l'ancien projet

- `/Users/zub/ableton-blackhole-radio` (le nom réel est « blackhole », du device
  audio virtuel BlackHole — l'intitulé « blackall » de la mission est une
  variante orthographique).
- Dépôt GitHub : `broduoliviercontact-web/ableton-blackhole-radio`.
- Branche courante : `feat/radio-midi-message-bridge` (ahead 2 de l'origin,
  working tree clean). Le projet **ne sera plus utilisé en production**.

## Architecture actuelle de l'ancien projet

Monorepo `apps/` (CommonJS, TypeScript via tsx) :

```
apps/
├── server/                      # Backend Express (TypeScript) — hébergé séparément (Render)
│   └── src/
│       ├── index.ts             # app Express + CORS + montage routes /api/*
│       ├── config.ts            # env zod-validated (LIVEKIT_*, PERFORMER_PASSWORD*)
│       ├── livekit.ts           # AccessToken + grants (server-only)
│       ├── performerAuth.ts     # vérif mot de passe timing-safe
│       └── routes/
│           ├── token.ts         # POST /api/token
│           ├── auth.ts          # POST /api/performer-auth/check
│           ├── config.ts        # GET /api/config-check (booléens seulement)
│           ├── broadcastMessage.ts
│           └── health.ts
├── web/                         # Frontend React 19 + Vite (vanilla livekit-client)
│   ├── vercel.json              # SPA statique (output dist, rewrite -> index.html)
│   └── src/
│       ├── audio/               # audioMeter, mediaDevices, listenerVolume, listenerAnalysis, audioReceiverStats
│       ├── livekit/livekitClient.ts   # fetchToken -> Room.connect
│       ├── api/                 # token, base, config, performerAuth, broadcastMessage
│       ├── hooks/               # useLocalAudioCapture, useLiveKitBroadcast, useLiveKitListen, useAudioDevices, ...
│       ├── utils/identity.ts    # identity stable par session (sessionStorage)
│       ├── components/, pages/  # UI React (PerformerGate, Performer, RadioPage, ...)
│       └── App.tsx, main.tsx
└── .env (gitignoré), .env.example (valeurs factices)
```

**Topologie de déploiement actuelle** :

- `web/` → **Vercel** (SPA statique, React). Aucune fonction serverless dans le
  projet web (`vercel.json` = SPA rewrite uniquement).
- `server/` → **hôte séparé** (Render, cf. commentaires `base.ts` /
  `.env.example`). Détient `LIVEKIT_*` + `PERFORMER_PASSWORD`.
- Le frontend appelle `/api/token` sur le backend via `VITE_API_BASE`
  (`apps/web/src/api/base.ts`). En dev, Vite proxye `/api` vers `localhost:3001`.

> **Différence cible** : `collab-hub-web-monitor` est une SPA statique Vite
> **vanilla JS** (pas de React), déployée sur Vercel, **sans backend séparé**.
> Le token endpoint doit devenir une **fonction serverless Vercel** dans le même
> projet (`api/livekit/token.js`), éliminant l'hôte Render séparé.

## Fichiers audités

Backend (server-only, détient les secrets) :
- `server/src/config.ts` — chargement/env validation (zod).
- `server/src/livekit.ts` — construction du `AccessToken` + grants.
- `server/src/routes/token.ts` — `POST /api/token`.
- `server/src/routes/auth.ts` — `POST /api/performer-auth/check`.
- `server/src/routes/config.ts` — `GET /api/config-check` (booléens).
- `server/src/performerAuth.ts` — vérification timing-safe du mot de passe.
- `server/src/index.ts` — Express + CORS.

Frontend (public, jamais de secret) :
- `web/src/hooks/useLocalAudioCapture.ts` — capture `getUserMedia` (contraintes musique).
- `web/src/hooks/useLiveKitBroadcast.ts` — pipeline Web Audio fader + publication.
- `web/src/hooks/useLiveKitListen.tsx` — listener raw `livekit-client` + reconnexion.
- `web/src/audio/audioMeter.ts` — VU-mètre Web Audio (RMS/peak/dB).
- `web/src/audio/mediaDevices.ts` — énumération/sélection devices, heuristiques BlackHole/Loopback.
- `web/src/audio/listenerVolume.ts` — volume/trim -30 dB (pur, testable).
- `web/src/livekit/livekitClient.ts` — `fetchToken` → `Room.connect`.
- `web/src/api/token.ts`, `base.ts`, `config.ts` — client API + détection URL factice.
- `web/src/utils/identity.ts` — identity stable par session (`<prefix>-<6 chars>`).

## Dépendances

Backend (`apps/package.json`) :
- `livekit-server-sdk` ^2.17.0 — `AccessToken`, `VideoGrant` (signing token, server-only).
- `express` ^5.2.1, `cors` ^2.8.6, `dotenv` ^17.4.2, `zod` ^4.4.3 — HTTP/env/validation.
- Dev : `tsx`, `typescript` ^7, `@types/*`.

Frontend (`apps/web/package.json`) :
- `livekit-client` ^2.20.1 — `Room`, `RoomEvent`, `Track`, `AudioPresets`, `isAudioTrack` (le seul paquet LiveKit côté navigateur).
- `react` ^19.2.7 / `react-dom` ^19.2.7 — **UI React (à ne pas porter en vanilla)**.
- `audiomotion-analyzer` ^4.5.4 — analyseur spectral du listener (spécifique au rendu UI radio).
- Dev : `vite` ^8, `@vitejs/plugin-react`, `oxlint`, `typescript`.

**Réellement nécessaires pour la migration** :
- `livekit-client` (navigateur) — obligatoire.
- `livekit-server-sdk` (serverless token) — obligatoire.
- `zod` (validation entrée token) — recommandé (déjà léger, robuste).

**Inutiles / spécifiques à l'ancien projet** :
- `react` / `react-dom` / `@vitejs/plugin-react` — `collab-hub` est vanilla JS.
- `audiomotion-analyzer` — analyseur spectral UI radio (non requis pour un simple VU-mètre + diffusion audio).
- `express` / `cors` — remplacés par une fonction serverless Vercel (pas de serveur HTTP à monter).
- `dotenv` — non nécessaire en serverless Vercel (env injectée automatiquement).
- `broadcastMessage` (server + web) — fonctionnalité « messages radio » **hors périmètre audio** (non migrée dans le moteur audio ; à traiter séparément si besoin).

> Versions : **ne mettre à jour aucune dépendance dans ce lot**. La migration
> (Lots 4B+) installera `livekit-client` + `livekit-server-sdk` aux versions
> courantes de l'ancien projet (² 2.20 / ² 2.17).

## Flux token actuel

1. Le frontend génère une **identity côté client** (`utils/identity.ts`,
   `<prefix>-<6 chars>` aléatoire, stable en `sessionStorage`).
2. `livekitClient.connectToRoom` appelle `api/token.fetchToken`
   (`POST {API_BASE}/api/token`) avec `{ roomName, identity, role, performerPassword? }`.
3. `routes/token.ts` valide le body (zod), vérifie le **mot de passe performer**
   uniquement si `role === 'performer'` (`performerAuth.checkPerformerAccess`,
   comparaison `timingSafeEqual`).
4. `livekit.ts` crée `new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity })`,
   ajoute les grants via `grantsFor(role, roomName)`, retourne
   `{ token: await token.toJwt(), url: LIVEKIT_URL }`.
5. Le frontend reçoit `{ token, url }` et fait `room.connect(url, token)`.

**Où sont utilisées les variables serveur** (jamais côté navigateur) :
- `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` → `livekit.ts` (signing du token).
- `LIVEKIT_URL` → renvoyé au client dans la réponse token (`url`), jamais le key/secret.
- `PERFORMER_PASSWORD` (+ optionnel `PERFORMER_PASSWORDS`) → `performerAuth.ts` (vérification).

Aucune variable `LIVEKIT_*` n'est préfixée `VITE_` ni importée côté web — le
seul `VITE_*` est `VITE_API_BASE` (URL publique du backend, non secrète). Le
secret n'est jamais envoyé au navigateur. ✅

## Durée de vie des tokens

- `AccessToken` créé **sans TTL explicite** (`livekit.ts`) → utilise la valeur
  par défaut du SDK (`livekit-server-sdk`). **Non configuré explicitement**.
- **Risque** : la valeur par défaut du SDK peut être longue (de l'ordre de
  plusieurs heures) ; un token volé reste valide jusqu'à expiration.
- **Recommandation cible** : forcer un TTL court et explicite (ex. 1–2 h) dans
  le nouveau endpoint (`AccessToken(..., { ttl })` ou `token.setTtl()`).

## Grants performer (actuels)

`grantsFor('performer', roomName)` →
```js
{ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true }
```
- `canPublish: true` ✅ (audio).
- `canSubscribe: true` — **différent de la cible** (mission veut `false` sauf nécessité).
- Pas de `canPublishData` explicite (défaut SDK).
- `canPublishSources` laissé à défaut (commentaire `ponytail:` dans le code).

## Grants listener (actuels)

`grantsFor('listener', roomName)` →
```js
{ roomJoin: true, room: roomName, canPublish: false, canSubscribe: true }
```
- `canPublish: false` ✅ (les listeners ne publient pas).
- `canSubscribe: true` ✅.
- Conforme à la cible.

## Room actuelle

- `roomName` = `'main'` (hardcodé côté web : `useLiveKitBroadcast` ligne 167,
  `RadioPage` `ROOM_NAME = 'main'`, `Performer.tsx`).
- Le serveur accepte n'importe quel `roomName` (validé `min(1)` par zod) — pas
  forcé à `'main'` côté serveur.
- **Cible** : forcer `room = 'main'` côté serveur (ignorer/écraser le
  `roomName` client) pour éviter qu'un client ne rejoigne une autre room.

## Configuration des identités

- **Générées côté client** (`utils/identity.ts`) : `performer-<6>` /
  `listener-<6>`, stables par session (`sessionStorage`, clé `abr:identity`).
- `Math.random().toString(36)` — **non cryptographique** ; unicité probabiliste.
- **Cible** : générer l'identity **côté serveur** dans le endpoint token
  (`crypto.randomUUID()` ou prefix + random sécurisé) pour garantir l'unicité
  et empêcher un client de forger une identity. La réponse token renverra
  `identity` (mission §11).

## Gestion du mot de passe

- `PERFORMER_PASSWORD` (unique) + `PERFORMER_PASSWORDS` (liste CSV optionnelle)
  → `parseAllowedPasswords` (trim, filtre les vides).
- `checkPerformerAccess` : 503 si aucun mot de passe configuré, 401 si
  absent/incorrect, comparaison **timing-safe** (`timingSafeEqual`).
- Le mot de passe n'est **jamais retourné ni loggé**. Route dédiée
  `/api/performer-auth/check` pour valider sans émettre de token (porte UI
  `PerformerGate`).
- **Cible** : réutiliser telle quelle la logique `performerAuth`
  (`parseAllowedPasswords` + `checkPerformerAccess`), portée en serverless.

## Chaîne Web Audio (performer / broadcaster)

`useLiveKitBroadcast.ts` — pipeline **exactement conforme à la cible §8** :

```
MediaStream local (getUserMedia)
  → AudioContext
  → MediaStreamAudioSourceNode
  → GainNode (fader master, 0–1, jamais > 1)
  → MediaStreamAudioDestinationNode
  → LiveKit publishTrack(dest.stream.getAudioTracks()[0], { audioPreset: musicHighQualityStereo, dtx: false, forceStereo: true })
```

- On publie la **track issue du destination** (post-fader), **jamais la track
  brute** → le gain affecte bien le flux publié. ✅
- `setMasterVolume` : `gain.gain.setTargetAtTime(g, ctx.currentTime, 0.01)` —
  réglage en direct sans republication. ✅
- `postFaderStream` (dest.stream) exposé pour le **VU-mètre post-fader** →
  mesure le signal réellement publié. ✅
- Pas de monitoring local audible par défaut. ✅
- Publication : `AudioPresets.musicHighQualityStereo`, `dtx: false`,
  `forceStereo: true` — qualité musique stéréo. ✅

## Sélection des périphériques

`mediaDevices.ts` :
- `isMediaDevicesSupported()`, `requestAudioPermission()` (stream jetable puis
  stop), `getAudioInputDevices()` (énumère `audioinput`).
- Heuristiques : `isBlackHole`, `isLoopback`, `pickPreferredAudioInput`
  (priorité BlackHole > Loopback > premier), `looksLikeBuiltInMic`.
- `useLocalAudioCapture` : `getUserMedia({ audio: { deviceId: { exact },
  echoCancellation: false, noiseSuppression: false, autoGainControl: false,
  channelCount: 2, sampleRate: 48000 }, video: false })` — **conforme aux
  contraintes musique recommandées §7**. ✅
- `mapCaptureError` : mapping lisible des `DOMException` (NotAllowed,
  NotFound, NotReadable, Overconstrained, Security).

> Note : `channelCount: 2` + `sampleRate: 48000` sont des **contraintes
> idéales** ; un device/source qui ne les supporte pas peut lever
> `OverconstrainedError`. Prévoir un **fallback propre** (relancer sans
> `channelCount`/`sampleRate` stricts) dans le nouveau moteur — l'ancien ne
> fait pas ce fallback (il renvoie juste une erreur mappée).

## Gestion du gain

- Gain master = `GainNode` linéaire 0–1 (0 = mute, 1 = niveau source), **pas
  d'amplification au-dessus de 1** (`volumeToGain` clamp 0–100 → 0–1). ✅
- Volume listener (côté listener) = `el.volume` sur les `<audio>` (0–1),
  `getEffectiveVolume` intègre un trim PAD -30 dB (`DB_TRIM_GAIN` ≈ 0.0316).
  Ce volume listener **n'affecte que l'écoute locale**, pas la diffusion. ✅

## Gestion du vumètre

`audioMeter.ts` — `AudioMeter` (classe) : `AudioContext → MediaStreamSource →
AnalyserNode (fftSize 1024) → getByteTimeDomainData → RMS + peak + dBFS`, boucle
`requestAnimationFrame`, `stop()` libère rAF + nodes + ctx. Pur, réutilisable.
Le performer mesure le **post-fader** (signal publié) ; le listener peut taper
le `mediaStreamTrack` distant via `listenerAnalysis` sans toucher à l'écoute.

## Gestion de l'arrêt

- `useLocalAudioCapture.stop()` : stoppe toutes les tracks du stream, repasse
  `idle`. Arrêt propre au démontage (`useEffect` cleanup). ✅
- `useLiveKitBroadcast.stop()` : `unpublishTrack(track, false)` +
  `room.disconnect()` + déconnexion nodes + `track.stop()` + `ctx.close()`. ✅
- `useLiveKitListen.teardown()` : `detachAll`, `removeAllListeners`,
  `room.disconnect`, clear timer. ✅
- Anti double-clic : `startingRef` (broadcast) / `startingRef` (listener). ✅
- Capture perdue pendant un broadcast actif → arrêt auto (`useEffect` sur
  `localStream`). ✅ (évite « live sans track » / « room avec track morte ».)

## Gestion de reconnexion

- **Listener** : `RoomEvent.Reconnecting` / `Reconnected` ; sur
  `Disconnected` inattendu, retry **3 tentatives** backoff **1s/2s/4s** ;
  bouton `reconnect` manuel si épuisées. `userStoppedRef` distingue arrêt
  volontaire vs coupure. Pas de timer orphelin au démontage. ✅
- **Performer** : s'appuie sur la reconnexion native `livekit-client` (Room) ;
  pas de retry applicatif explicite au niveau du hook broadcast. La
  reconnexion p2p/room est gérée par le SDK ; **à compléter** dans le nouveau
  moteur par une gestion d'état `reconnecting` explicite (mission §9).

## Machine d'état actuelle vs cible

États broadcast actuels (`BroadcastStatus`) : `disconnected | connecting |
connected | publishing | live | error`. Listener (`ListenPhase`) :
`disconnected | connecting | connected | listening | error` (+ `lost`,
`reconnecting`, `needGesture` booléens).

**Machine d'état cible proposée (§9)** :

```
idle → permission_request → permission_granted → capturing
  → connecting → publishing → live
  → reconnecting ⇄ live    (perte réseau)
  → stopping → stopped
  → error (depuis n'importe quel état actif)
```

Transitions à garantir :
- pas de `live` sans track publiée ;
- pas de bouton « ON AIR » actif quand la capture est arrêtée ;
- pas de room connectée avec track locale morte ;
- pas de double publication après double clic (`startingRef`).
L'ancien code couvre déjà la plupart (anti double-clic, arrêt auto, cleanup) ;
il manque surtout un état `reconnecting` explicite côté performer et un état
`permission_*` granulaire (l'ancien fusionne permission dans la capture).

## Modules réutilisables tels quels (logique pure, portable en vanilla)

- `web/src/audio/audioMeter.ts` — VU-mètre (classe, zéro React) → **réutilisable tel quel**.
- `web/src/audio/mediaDevices.ts` — énumération/sélection devices, heuristiques → **réutilisable tel quel**.
- `web/src/audio/listenerVolume.ts` — `getEffectiveVolume` / `DB_TRIM_GAIN` (pur) → **réutilisable tel quel**.
- `server/src/performerAuth.ts` — `parseAllowedPasswords` / `checkPerformerAccess` (pur Node) → **réutilisable tel quel** (dans la fonction serverless).
- `server/src/livekit.ts` — `grantsFor` / `createToken` (logique de signing) → **réutilisable avec adaptation** (forcer room `main`, TTL explicite, grants cible, identity serveur).
- `web/src/api/config.ts` (`looksFakeUrl`, `FAKE_CONFIG_HINT`) — détection URL factice → **réutilisable tel quel**.
- `web/src/utils/identity.ts` — logique identity → **à adapter** (déplacer côté serveur, `crypto.randomUUID`).

## Modules à adapter (logique bonne, wrapping React à retirer)

- `useLocalAudioCapture.ts` — contraintes musique + `mapCaptureError` excellentes ;
  **retirer le wrapping React** (useRef/useState/useEffect) → module vanilla
  `audioCapture.js` avec callbacks/état explicite. **Ajouter fallback** si
  `channelCount: 2`/`sampleRate: 48000` lèvent `OverconstrainedError`.
- `useLiveKitBroadcast.ts` — pipeline Web Audio fader + publication + cleanup
  **directement portable** en `livekitPublisher.js` vanilla ; retirer React,
  garder `startingRef` (anti double-clic), `setMasterVolume` (`setTargetAtTime`).
- `useLiveKitListen.tsx` — listener raw `livekit-client` (attach/detach
  `<audio>`, autoplay-gesture, retry 1/2/4s, volume/mute/trim) **directement
  portable** en `livekitListener.js` vanilla ; retirer React.
- `livekitClient.ts` (`connectToRoom`) — `fetchToken` → `Room.connect` →
  **réutilisable avec adaptation** (URL token du nouveau endpoint Vercel, pas
  de `VITE_API_BASE` ; chemin `/api/livekit/token`).
- `api/token.ts` (`fetchToken`) — **réutiliser la forme**, adapter le chemin et
  la réponse (`{ token, url, room, identity, role }`).

## Modules à réécrire / spécifiques à l'ancien projet

- `App.tsx`, `main.tsx`, `pages/*`, `components/*` (PerformerGate, Performer,
  RadioPage, RadioMessageForm, splitflap, etc.) — **UI React spécifique** → à
  réécrire en UI vanilla JS (control room + listener) dans `collab-hub`.
- `audiomotion-analyzer` (analyseur spectral) + `listenerAnalysis.ts` /
  `audioReceiverStats.ts` — **non requis** pour un VU-mètre simple + diffusion
  (à réécrire/omettre sauf besoin démontré).
- `server/src/index.ts` (Express + CORS) → **remplacé** par une fonction
  serverless Vercel (pas de serveur HTTP à monter ; CORS géré par Vercel/la
  fonction).
- `broadcastMessage` (server + web) — fonctionnalité « messages radio »,
  **hors périmètre audio** (non migrée dans le moteur audio).

## Risques de sécurité (signalés, non corrigés dans ce lot)

1. **TTL token non explicite** → dépend du défaut SDK (potentiellement long).
   Forcer un TTL court côté serveur dans le nouveau endpoint.
2. **Identity générée côté client** (`Math.random`, non crypto) → un client
   peut forger une identity / réutiliser celle d'un autre. Générer côté serveur
   (`crypto.randomUUID`).
3. **Pas de protection contre deux performers simultanés** : quiconque fournit
   le bon mot de passe obtient un token `canPublish: true`. Deux sessions
   performer (identities différentes) peuvent publier en même temps dans
   `main`. Voir §Coexistence ci-dessous.
4. **`canSubscribe: true` pour le performer** — plus large que nécessaire
   (cible : `false`). Réduire la surface.
5. **`roomName` accepté côté serveur** (non forcé à `main`) — un client peut
   demander un token pour une autre room. Forcer `room = 'main'` côté serveur.
6. **`canPublishData` non explicité** — s'assurer qu'il reste `false` sauf
   nécessité (mission §5).
7. **Mot de passe performer en clair dans le corps de la requête** — acceptable
   uniquement en HTTPS ; le nouveau endpoint doit n'être appelé qu'en HTTPS
   (Vercel le garantit). Ne jamais le loguer (l'ancien ne le logue pas ✅).
8. **Erreur 500 logge `err` côté serveur** (`routes/token.ts` `console.error`)
   — risqué si l'erreur contient une valeur secrète ; le nouveau endpoint doit
   logger un message générique sans détail secret.
9. **`.env` réel présent localement** dans l'ancien projet (gitignoré, non
   suivi) — ne **jamais** le copier ni lire ses valeurs pour la migration ;
   recopier les secrets manuellement via Vercel Environment Variables.

## Coexistence des rooms (§14)

- L'ancien projet ne sera plus utilisé → on peut reprendre `room = main`.
- **À vérifier avant activation** : qu'aucune automatisation ancienne ne se
  reconnecte, qu'aucun ancien client performer ne reste déployé.
- **Identité fixe = expulsion** : LiveKit expulse le participant précédent si
  deux clients rejoignent avec la **même identity**. L'ancien génère des
  identities aléatoires par session → pas d'expulsion, mais **pas de limite à
  un seul performer non plus**.
- **Deux listeners simultanés** : OK (identities différentes, `canSubscribe`).
- **Un seul performer** : **non garanti actuellement**.
- **Protection recommandée** (à documenter, implémentation différée) :
  - identity performer **unique** (générée serveur, ex. `performer-<uuid>`) ;
  - validation serveur du mot de passe (déjà présent) ;
  - limitation à un publisher unique : soit (a) refuser un second token
    performer tant qu'un participant `canPublish` est actif dans `main`
    (nécessite un appel à l'API LiveKit Server → complexité serveur
    supplémentaire), soit (b) accepter le risque et laisser LiveKit gérer
    (deux flux audio dans la room), soit (c) révoquer/déconnecter le précédent
    performer via l'API server. **À décider au Lot 4C** — ne pas implémenter
    dans ce lot d'audit.

## Architecture cible dans collab-hub-web-monitor

```
src/audio/
  audioDevices.js        # énumération, permission, heuristiques BlackHole/Loopback (de mediaDevices.ts)
  audioCapture.js        # getUserMedia contraintes musique + fallback (de useLocalAudioCapture.ts, sans React)
  audioGraph.js          # pipeline source→gain→analyser→destination (de useLiveKitBroadcast.ts)
  audioMeter.js          # VU-mètre RMS/peak/dB (de audioMeter.ts)
  broadcastState.js      # machine d'état idle→...→live→...→stopped/error (nouveau, §9)
  livekitPublisher.js    # Room + publishTrack post-fader (de useLiveKitBroadcast.ts, sans React)
  livekitListener.js     # Room + attach <audio> + reconnexion (de useLiveKitListen.tsx, sans React)

src/control-room/
  controlRoomController.js   # orchestre capture→graph→publisher, état ON AIR
  controlRoomView.js         # rendu DOM vanilla (sans toucher à l'UI publique existante)
  controlRoomState.js        # état UI control room

src/listener/
  listenerController.js      # orchestre token listener → room → écoute
  listenerAudio.js           # attach/detach <audio>, volume, mute, trim

api/livekit/token.js         # fonction serverless Vercel : POST /api/livekit/token
```

Séparation respectée : **logique pure** (`audioDevices`, `audioMeter`,
`listenerVolume`-equivalent, `broadcastState`, grants), **accès navigateur**
(`audioCapture`, `audioGraph`, vues), **accès LiveKit** (`livekitPublisher`,
`livekitListener`), **rendu UI** (`controlRoomView`, `listenerController`),
**endpoint serveur** (`api/livekit/token.js`), **configuration** (env Vercel).

> `collab-hub-web-monitor` étant un projet Vite **vanilla JS** (pas de
> `src/pages`, pas de framework), l'arborescence s'aligne sur la convention
> existante (`src/...` modules, `test/runTests.mjs`, `node:test`). La fonction
> `api/livekit/token.js` suit la convention Vercel Functions (dossier `api/`).

## Endpoint token cible (§11)

`POST /api/livekit/token` (fonction serverless Vercel).

Entrée performer :
```json
{ "role": "performer", "password": "<mot de passe>" }
```
Entrée listener :
```json
{ "role": "listener" }
```

Sortie (200) :
```json
{ "token": "<JWT temporaire>", "url": "<LIVEKIT_URL>", "room": "main", "identity": "<identity serveur>", "role": "performer|listener" }
```

Contraintes :
- mot de passe performer vérifié côté serveur (`performerAuth`, timing-safe) ;
- 503 si `PERFORMER_PASSWORD` absent, 401 si mauvais mot de passe ;
- `room` **forcé à `main`** côté serveur (le client ne choisit pas) ;
- `identity` **générée côté serveur** (`performer-<uuid>` / `listener-<uuid>`) ;
- grants cible : performer `{ roomJoin: true, room: 'main', canPublish: true,
  canSubscribe: false, canPublishData: false }` ; listener
  `{ roomJoin: true, room: 'main', canPublish: false, canSubscribe: true,
  canPublishData: false }` ;
- TTL **explicite et court** (ex. 1–2 h) ;
- réponse générique en cas d'erreur (pas de détail secret) ;
- logs génériques (jamais le mot de passe ni le secret) ;
- aucune `API_KEY` / `API_SECRET` renvoyée au client.

## Variables d'environnement (§12)

Secrets serveur (Vercel, **jamais** préfixés `VITE_`, jamais dans le bundle) :
- `LIVEKIT_URL` — URL LiveKit Cloud (wss://…).
- `LIVEKIT_API_KEY` — clé API.
- `LIVEKIT_API_SECRET` — secret API (signing token).
- `PERFORMER_PASSWORD` — mot de passe performer (+ optionnel
  `PERFORMER_PASSWORDS` CSV).

Publique (bundle, préfixée `VITE_`) :
- `VITE_LIVEKIT_ENABLED=true` — active la section audio (désactivée sinon).
- **Ne pas dupliquer** `LIVEKIT_URL` côté client : l'endpoint token la renvoie
  déjà dans la réponse (`url`). `VITE_API_BASE` n'est pas nécessaire (le
  endpoint vit dans le même projet Vercel → chemin relatif `/api/livekit/token`).

`.env.example` : **valeurs factices uniquement** (`wss://your-livekit-server.example.com`,
`api-key-here`, `api-secret-here`, `change-me`). **Jamais** les valeurs réelles
dans le dépôt.

## Réutilisation des secrets existants (§13)

- Les secrets LiveKit (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
  et `PERFORMER_PASSWORD` sont actuellement configurés dans l'environnement de
  l'ancien projet (Render backend pour le serveur ; `.env` local gitignoré).
- **Ne pas afficher, imprimer ni copier leurs valeurs** dans ce rapport, le
  code, `.env.example`, le navigateur ou GitHub.
- **Procédure de recopie manuelle** (à exécuter hors de ce lot) :
  1. Ouvrir le dashboard de l'ancien projet (Render / Vercel de l'ancien) →
     Environment Variables → relever `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
     `LIVEKIT_API_SECRET`, `PERFORMER_PASSWORD`.
  2. Ouvrir le projet `collab-hub-web-monitor` sur Vercel → Settings →
     Environment Variables → ajouter ces 4 variables (Production, et Preview si
     besoin) en mode **Encrypted**.
  3. Redéployer. Vérifier via `GET /api/livekit/config-check` (booléens
     seulement, à prévoir au Lot 4C) que tout est configuré.
- On **réutilise le même projet LiveKit Cloud** (mêmes identifiants serveur).
- Si les secrets n'existent que dans l'ancien Render, les recopier manuellement
  (aucun outil ne le fera automatiquement ici).

## Matrice de migration

| Élément ancien | Dest cible | Statut |
|---|---|---|
| `audioMeter.ts` | `src/audio/audioMeter.js` | réutilisable tel quel |
| `mediaDevices.ts` | `src/audio/audioDevices.js` | réutilisable tel quel |
| `listenerVolume.ts` | (dans `src/listener/listenerAudio.js`) | réutilisable tel quel |
| `useLocalAudioCapture.ts` | `src/audio/audioCapture.js` | adapter (sans React) + fallback contraintes |
| `useLiveKitBroadcast.ts` | `src/audio/{audioGraph,livekitPublisher,broadcastState}.js` | adapter (sans React) |
| `useLiveKitListen.tsx` | `src/listener/{livekitListener,listenerAudio}.js` | adapter (sans React) |
| `livekitClient.ts` | (intégré dans publisher/listener) | adapter (chemin token) |
| `api/token.ts` | client fetch `/api/livekit/token` | adapter (forme + réponse) |
| `utils/identity.ts` | (côté serveur, `api/livekit/token.js`) | réécrire (serveur, crypto) |
| `server/livekit.ts` | `api/livekit/token.js` | adapter (room main, TTL, grants cible) |
| `server/performerAuth.ts` | `api/livekit/token.js` (logique) | réutilisable tel quel |
| `server/index.ts` + Express | fonction serverless Vercel | réécrire |
| `server/routes/config.ts` | `api/livekit/config-check` (booléens) | adapter |
| UI React (pages/components) | `src/control-room/*`, `src/listener/*` | réécrire (vanilla) |
| `audiomotion-analyzer` / `listenerAnalysis` | — | non requis (omettre) |
| `broadcastMessage` (radio messages) | — | hors périmètre (ne pas migrer) |

## Tests à prévoir (matrice, §15) — pour les Lots 4B+

**Capture locale** : permission accordée / refusée ; device disparu ;
BlackHole détecté ; fallback mono (Overconstrained → relance sans channelCount/
sampleRate) ; arrêt libère les tracks ; AudioContext fermé.

**LiveKit performer** : token valide ; mot de passe incorrect (401) ; mot de
passe non configuré (503) ; connexion ; publication ; arrêt ; reconnexion ;
double clic (anti-republication) ; perte réseau ; room inexistante ; secret
absent (erreur générique).

**LiveKit listener** : token listener ; abonnement audio ; autoplay bloqué
(geste) ; bouton Écouter ; mute ; volume ; trim -30 dB ; reconnexion (1/2/4s) ;
performer absent ; track remplacée.

**Sécurité** : listener ne publie pas (`canPublish: false`) ; secret absent du
bundle (scan `VITE_`/`LIVEKIT_API_SECRET`) ; mot de passe absent des logs ;
API secret absent du client ; token expiré rejeté ; `room` forcé à `main` ;
identity générée serveur.

## Plan des Lots 4B à 4F

**Lot 4B — moteur audio local**
- permissions (`requestAudioPermission`) ; énumération/sélection devices
  (`audioDevices.js`) ; capture (`audioCapture.js`, contraintes musique +
  fallback `OverconstrainedError`) ; graph fader (`audioGraph.js`) ; vumètre
  (`audioMeter.js`) ; arrêt propre (tracks + AudioContext) ; tests unitaires
  (logique pure : `getEffectiveVolume`, heuristiques devices, mapping erreurs,
  `volumeToGain`, machine d'état).

**Lot 4C — backend token et publication LiveKit**
- fonction serverless `api/livekit/token.js` (Vercel) : `performerAuth`
  (timing-safe), room forcée `main`, identity serveur (`crypto.randomUUID`),
  grants cible, TTL explicite ; `livekitPublisher.js` (Room + publishTrack
  post-fader, preset musique stéréo, anti double-clic) ; reconnexion ;
  `config-check` booléens ; tests (validation entrée, grants, 401/503, secret
  absent du bundle, room forcée).

**Lot 4D — listener public**
- `livekitListener.js` + `listenerAudio.js` : token listener, abonnement audio
  (attach/detach `<audio>`), bouton Écouter (geste autoplay), volume, mute,
  trim -30 dB, statut « live », reconnexion 1/2/4s, performer absent, track
  remplacée. **Intégration sans casser l'UI publique existante** (section
  dédiée, `VITE_LIVEKIT_ENABLED`).

**Lot 4E — Control Room complète**
- `control-room/{controller,view,state}.js` : intégration capture→graph→
  publisher, états ON AIR, erreurs, diagnostic (`?debug=1`), tests réels
  BlackHole/Ableton.

**Lot 4F — stabilisation et release v1.1.0**
- tests navigateurs (Chrome/Safari/Firefox) ; documentation (README, docs) ;
  CI (ajout étapes audio/LiveKit si pertinent, contrôle secrets) ; release
  v1.1.0 (tag, ZIP Max inchangé, notes).

> Aucun lot ne modifie le design public existant ni le patch Max tant que ce
> n'est pas explicitement demandé. La section audio est **additive** et
> protégée par `VITE_LIVEKIT_ENABLED`.

## Limites restantes

- Audit only : aucun code LiveKit ajouté au bundle dans ce lot ; l'interface
  publique et le patch Max sont **inchangés**.
- Les secrets LiveKit ne sont **pas** encore présents dans le projet Vercel
  `collab-hub-web-monitor` (recopie manuelle requise, hors de ce lot).
- La protection « un seul performer » n'est pas décidée (Lot 4C).
- Le TTL token exact et le fallback `OverconstrainedError` précis seront
  fixés à l'implémentation (Lots 4B/4C).
- `audiomotion-analyzer` / `listenerAnalysis` / `broadcastMessage` sont
  volontairement exclus du périmètre audio.