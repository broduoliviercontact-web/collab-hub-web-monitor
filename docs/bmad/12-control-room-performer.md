# 12 — Control Room performer complète (Lot 4E)

Objectif : créer une vraie page `/control-room` pour le performer — sélection de
source audio, permission micro, capture, VU-mètre, master gain, diffusion
LiveKit (publisher Lot 4C) avec mot de passe performer, statut **ON AIR**,
erreurs en français, reconnexion, arrêt et nettoyage. **Aucune release, aucun
tag, version `1.0.1` inchangée.** Le moteur audio (Lot 4B) et le publisher
(Lot 4C) sont **réutilisés, pas dupliqués**.

## Contraintes respectées

- `PERFORMER_PASSWORD` jamais exposé ; mot de passe jamais stocké (pas de
  localStorage/sessionStorage), jamais loggué, vidé de l'`<input>` après succès,
  transmis uniquement à `requestLiveKitToken` (via `publisher.connect`).
- Token LiveKit jamais stocké côté client (en mémoire dans le publisher, jamais
  dans le snapshot, jamais dans le DOM).
- Aucune API key / API secret dans le navigateur (variables serveur uniquement).
- Aucun secret demandé dans le navigateur (seul le mot de passe performer est
  saisi, jamais les clés).
- Aucun token statique ; aucune publication automatique au chargement ; aucun
  démarrage de micro/diffusion sans action + confirmation utilisateur.
- Patch Max, 5 headers Collab-Hub, design public : inchangés (page séparée,
  shell `control-room.html` `noindex`).
- Version `1.0.1` inchangée ; ni tag ni release.
- Aucun React ; aucun backend supplémentaire (endpoint Lot 4C réutilisé) ;
  moteur audio non dupliqué.

## Architecture

```
control-room.html              (shell minimal, noindex, script /src/main.js)
src/main.js                    (routeur : pathname -> publicPage | controlRoomPage)
  ├─ src/publicPage.js         (corps extrait de l'ancien main.js, statique)
  └─ import() dynamique -> src/control-room/controlRoomPage.js
       ├─ src/control-room/controlRoomState.js    (PUR : état composite, libellés, erreurs)
       ├─ src/control-room/controlRoomController.js (orchestre audioEngine + publisher)
       ├─ src/control-room/controlRoomView.js     (PUR : DOM build/render/meter/wire)
       ├─ src/audio/audioEngine.js                (Lot 4B, réutilisé)
       ├─ src/audio/livekitPublisher.js           (Lot 4C, réutilisé)
       ├─ src/livekit/tokenClient.js              (Lot 4C, réutilisé)
       └─ src/livekit/livekitBrowser.js           (seul import de livekit-client)
```

## Routage single-entry (§3)

`src/main.js` est désormais un routeur : `pathname` (sans slash final) →
`/control-room` ? import dynamique `controlRoomPage.js` : sinon `mountPublicPage()`
(import statique, bundle principal, **pas de régression** vs Lot 4D). Vercel
re écrit `/control-room` (et `/control-room/`) vers `control-room.html`
(`vercel.json`). `control-room.html` est un second point d'entrée Vite
(`build.rollupOptions.input`) → shell minimal, DOM construit côté client.

### Impact bundle

- **Page publique (`/`)** : bundle principal `main-*.js` (~51 ko, **sans**
  `livekit-client`), comme Lot 4D. Le chunk `controlRoomPage` n'est chargé qu'en
  naviguant sur `/control-room`.
- **Page Control Room (`/control-room`)** : chunk dynamique `controlRoomPage-*.js`
  (~539 ko / ~143 ko gzip, contient `livekit-client`), chargé à la demande.
  Avertissement Vite « chunk > 500 ko » attendu (dépendance livekit-client).

## Machine d'état composite (§5)

`deriveCompositeState(audioState, pubState, hasDevices)` produit un état unique :

```
idle -> requesting_permission -> permission_granted / selecting_device
      -> starting_capture -> capturing
      -> requesting_token -> connecting -> publishing -> live
      -> reconnecting (Reconnecting) ; stopping -> stopped ; error
```

Priorité : `error` (publisher ou audio) > états publisher actifs (`live`,
`connecting`, `publishing`, `requesting_token`, `reconnecting`, `stopping`) >
états audio (`capturing`, `permission_granted`, …). `permission_granted` sans
device → `selecting_device`. `COMPOSITE_STATES` liste les 14 états.

**ON AIR** = `composite === 'live'` (i.e. `publisher.state === 'live'`).

## Contrôleur (§7)

`createControlRoomController({ audioEngine, publisher, now })` :

- Abonné à `audioEngine.subscribe` + `publisher.subscribe` → recalcule le
  snapshot composite à chaque changement d'un sous-moteur.
- Actions : `requestPermission`, `refreshDevices`, `selectDevice`, `startCapture`,
  `stopCapture`, `setGain(pct 0..100 -> /100)`, `readMeter`, `startBroadcast(password)`,
  `stopBroadcast`, `retry(password)` (= `startBroadcast`), `stopAll`, `destroy`,
  `getSnapshot`, `subscribe`.
- `startBroadcast(password)` : garde anti double-clic (`broadcasting`), valide
  `publisher non actif` + `audioState==='capturing'` + `outputStream présent` +
  `password non vide` → `publisher.connect({ password, outputStream })`. En cas
  d'échec renvoie `{ ok:false, code }` sans lever. **La capture est préservée
  sur erreur** (le performer peut réessayer sans recapturer).
- **Le mot de passe est un paramètre local** : jamais stocké, jamais dans le
  snapshot, jamais loggué. Le contrôleur ne le conserve pas au-delà de l'appel.
- **Snapshot sans secret** : `composite, audioState, publisherState, onAir,
  permission, devices, selectedDeviceId/Label, settings, gain, meter,
  hasOutputStream, canBroadcast, broadcastLabel, roomName, identity, trackSid,
  connected, published, reconnectCount, liveSince, error{code,message},
  lastActionResult{ok,code}, updatedAt`. **Jamais** : password, token, apiKey,
  apiSecret.
- Erreur prioritaire : publisher en erreur (`lastError`) sinon audio (`error`),
  message via `describeError(code)`.

## Vue (§16)

`buildControlRoomDOM` construit `main.card.cr-room` avec 7 sections :

1. **Connexion** — `<input type=password autocomplete=off>` + **DÉMARRER LA
   DIFFUSION**.
2. **Source audio** — **AUTORISER LE MICRO** (caché si permission accordée),
   `<select>` des devices (désactivé en capture), **RAFRAÎCHIR**, état permission.
3. **Capture** — **DÉMARRER / ARRÊTER LA CAPTURE** (visibles selon état).
4. **Niveau** — VU-mètre (barre RMS, marqueur peak, zone clipping, texte dBFS).
5. **Master** — slider `0..100` + pourcentage.
6. **Diffusion** — point + libellé de statut, badge **ON AIR**, **ARRÊTER LA
   DIFFUSION**, room/identity/track.
7. **Statut** — état composite + message d'erreur + dernier résultat d'action.

`renderControlRoom(snap, els, {debug})` : écritures DOM pures depuis le
snapshot. `renderMeter(meter, els)` : barre RMS `%`, peak `%`, dBFS (ou `-∞`,
`—`), classe `is-clipping`. `updateBroadcastEnabled(els)` : DÉMARRER désactivé
sauf si `canBroadcast` **et** mot de passe saisi (le mot de passe n'est jamais
dans le snapshot → l'UI le lit elle-même). `wireControlRoom` câble les contrôles.

Aucune valeur secrète n'est écrite dans le DOM (le mot de passe n'est jamais
reflété ; le token n'apparaît nulle part).

## Page (§17)

`controlRoomPage.js` (entrée dynamique) :

- Crée le `audioEngine` réel (Lot 4B) et le `publisher` réel (Lot 4C) avec
  `Room`, `LocalAudioTrack`, `Track.Source.Microphone`,
  `AudioPresets.musicHighQualityStereo` (128 kbps, DTX off, stéréo forcée) via
  `livekitBrowser`.
- `tokenClient = { requestLiveKitToken }` (endpoint Lot 4C, same-origin).
- Abonne le contrôleur → rendu vue + `updateBroadcastEnabled` + gestion
  VU-mètre.
- **VU-mètre** : `requestAnimationFrame` en capture ; `setInterval` ~100 ms si
  `prefers-reduced-motion`. Arrêté hors capture.
- **Mot de passe vidé** de l'`<input>` sur succès (`onStartBroadcast`).
- `?debug=1` : section Diagnostic affichant le snapshot composite en JSON
  (**jamais** token/mot de passe/clé/secret).
- `beforeunload` → `controller.destroy()` non bloquant (publisher.destroy +
  audioEngine.destroy), sans fetch supplémentaire.
- Rien n'est lancé au chargement : permission, capture, diffusion démarrent sur
  action utilisateur.

## Sécurité (§13/§18/§20)

- Mot de passe : `input type=password`, `autocomplete=off`, jamais de valeur par
  défaut, jamais localStorage/sessionStorage, jamais loggué, vidé après succès ou
  arrêt, transmis uniquement à `requestLiveKitToken`, **jamais dans le snapshot
  diagnostic**.
- Token : en mémoire dans le publisher, jamais exposé au contrôleur/vue/DOM.
- API key / API secret : variables serveur uniquement, jamais dans le bundle.
- Diagnostic `?debug=1` : snapshot composite uniquement (aucun token, mot de
  passe, clé, secret).
- `scripts/check-livekit-secrets.mjs` (Lot 4D) reste vert : scan VITE_ restreint
  au code, JWT global, `.env.example` skippé.

## Tests (§23/§24/§25)

- **État composite (10)** : `COMPOSITE_STATES`, dérivation idle/stopped/live/
  capturing/selecting_device/error, `broadcastStatus` (ON AIR uniquement),
  `isOnAir`, `describeError` (token_unauthorized/permission_denied/no_password/
  inconnu), `derivePermission`, `PUBLISHER_ACTIVE`.
- **Contrôleur (30)** : construction (manque audioEngine/publisher), snapshot
  initial, snapshot sans secret, requestPermission ok/échec, refreshDevices,
  selectDevice, startCapture ok/échec, stopCapture, setGain (50→0.5, bornes),
  startBroadcast sans capture/no_password/échec token/échec connect/déjà live,
  double-clic gardé, succès → ON AIR, stopBroadcast, retry, stopAll, destroy,
  subscriber audio/publisher, erreur publisher/audio prioritaire, aucun
  getUserMedia supplémentaire au publish, `canBroadcast`.
- **Vue (19)** : 7 sections, password type/autocomplete, rendu idle/live/error,
  permission denied/granted, capturing, devices peuplées, meter null/valeurs/
  clipping/-∞, gain, `updateBroadcastEnabled`, wire (diffusion/device/gain/
  authorize), `lastActionResult`, aucune valeur secrète dans le DOM.
- **Intégration (10)** : flux complet idle→live→arrêt, no_password, échec token
  + retry, transitions dans l'ordre, setGain, stopAll, destroy, snapshot sans
  password durant le flux, rendu vue cohérent live, reconnexion → RECONNEXION…,
  déconnexion involontaire → error + retry.

**271 tests au total** (196 + 75). Aucun test ne nécessite Internet, vrai
LiveKit, vraie API key/secret, navigateur ou micro.

## Configuration (§21)

- Vercel : `vercel.json` rewrite `/control-room`(/) → `control-room.html`.
- Variables serveur déjà configurées (Lot 4C) : `LIVEKIT_URL`,
  `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `PERFORMER_PASSWORD` (Production +
  Preview). **Ne jamais les préfixer `VITE_`.**
- `VITE_LIVEKIT_ENABLED` (publique) pilote la **page publique** (listener). La
  Control Room `/control-room` est servie indépendamment de ce flag (le performer
  y accède directement par URL).

## Procédure de test manuel (§24)

1. `vercel dev` (ou build + preview) avec les 4 variables serveur configurées ;
2. ouvrir `/control-room` ;
3. **AUTORISER LE MICRO** → permission accordée, devices listés ;
4. sélectionner la source (BlackHole/Loopback) ;
5. **DÉMARRER LA CAPTURE** → VU-mètre actif, `canBroadcast` ;
6. saisir le mot de passe performer → **DÉMARRER LA DIFFUSION** → **ON AIR** ;
7. `?debug=1` : vérifier le snapshot (aucun token/mot de passe/clé) ;
8. tester le master gain, le VU-mètre ;
9. **ARRÊTER LA DIFFUSION** → HORS ANTENNE (capture conservée) ;
10. tester la reconnexion (couper/rétablir le réseau) ; 11. fermer l'onglet
    (`beforeunload` → destroy).

Ne jamais partager les valeurs des variables serveur.

## Limites restantes

- Aucune release / tag promis ; fonctionnalité « en développement ».
- Chunk `controlRoomPage` > 500 ko (avertissement Vite, à la demande) ;
  `manualChunks` non configuré (hors périmètre).
- Pas de refresh token (TTL 2 h ; reconnexion native suffit en session courte).
- Un seul performer par room `main` (mot de passe + identity) ; pas de gestion
  multi-performers côté UI.
- Le changement de device en cours de capture n'est pas supporté (sélecteur
  désactivé en capture) — arrêter puis redémarrer la capture pour changer.
- Wiring du script `check-livekit-secrets` dans la CI reporté (édition web
  `.github/workflows/ci.yml`).
- Vulnérabilités `npm audit` (esbuild/vite, devDeps, préexistantes) non corrigées.