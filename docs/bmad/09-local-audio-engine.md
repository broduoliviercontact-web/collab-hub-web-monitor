# 09 — Moteur audio local de la Control Room (Lot 4B)

Objectif : implémenter le moteur audio local du performer **sans LiveKit** :
permission, énumération/sélection d'entrées, capture `getUserMedia`, graphe Web
Audio, gain master, vumètre, `MediaStream` final prêt pour LiveKit, arrêt
propre — et sa logique testable sans périphérique réel. **Aucune connexion
réseau, aucun endpoint token, aucun secret, aucun LiveKit installé.** L'UI
publique et le patch Max ne sont pas modifiés ; aucune release.

## Contraintes respectées

- `livekit-client` / `livekit-server-sdk` **non installés**.
- Aucun endpoint token créé, aucun secret LiveKit ajouté.
- Page publique, patch Max, version `1.0.1`, tag/release : **inchangés**.
- Aucune publication audio sur le réseau ; la Control Room visuelle complète
  n'est pas créée (aucun import de `src/audio/*` depuis `src/main.js`).
- Bundle public identique (44 modules, mêmes hashes d'assets).

## Architecture

```
src/audio/
  constants.js     # codes d'erreur, bornes de gain, seuils vumètre, mots-clés virtuels, états
  audioErrors.js   # normalisation DOMException -> {code, message} ; permission/overconstrained
  audioDevices.js  # permission, énumération, normalisation, préférence, devicechange
  audioCapture.js  # buildAudioConstraints (pur) + captureAudio (échelle de fallback)
  audioGraph.js    # createAudioGraph : source -> gain -> analyser + destination
  audioMeter.js    # computeMeterLevel (pur) + createAudioMeter (read/reset)
  audioEngine.js   # createAudioEngine : façade + machine d'état
```

Séparation : **pur/testable** (`constants`, `audioErrors`, parties pures de
`audioDevices`/`audioCapture`/`audioMeter`, `computeMeterLevel`,
`buildAudioConstraints`, `clampGain`) · **accès navigateur** (`captureAudio`,
`createAudioGraph`, `createAudioMeter`) · **façade état** (`audioEngine`).
Toute dépendance navigateur (`mediaDevices`, `AudioContextClass`, `now`) est
**injectable** → testable en Node sans navigateur, sans BlackHole, sans micro,
sans Internet, sans LiveKit.

## audioEngine — API

```js
const eng = createAudioEngine({ mediaDevices, AudioContextClass, now });
eng.requestPermission();     // -> permission_granted (devices peuplés) ou error(permission_denied)
eng.listDevices();           // -> [ {deviceId, groupId, label, isDefault, isVirtual} ]
eng.selectDevice(deviceId);  // mémorise la sélection (ne redémarre pas la capture)
eng.startCapture();          // -> capturing (anti double-capture)
eng.stopCapture();           // idempotent -> stopped
eng.setMasterGain(value);    // borne [0,1], applique au graphe si actif
eng.readMeter();             // -> {rms, peak, db, clipping} (ou silence si pas de graphe)
eng.getOutputStream();       // MediaStream final (destinationNode.stream) pour LiveKit plus tard
eng.getSnapshot();           // état immuable (copie) pour l'UI
eng.subscribe(listener);     // -> unsubscribe ; notifié à chaque changement d'état
eng.destroy();               // idempotent : stop + ferme ctx + retire devicechange + vide listeners
```

## Machine d'état

```
idle -> requesting_permission -> permission_granted -> starting -> capturing -> stopping -> stopped
                                                                                       ^
  error (depuis n'importe quel état actif) --------------------------------------------+
```

Règles :
- `startCapture` dans `starting`/`capturing` = **no-op** (jamais deux streams).
- `stopCapture` idempotent (no-op en `idle`/`stopped`).
- `destroy` idempotent.
- Une erreur (`permission_denied`, `device_not_found`, `device_busy`,
  `constraints_failed`, `capture_failed`, `track_ended`) passe en `error` ;
  une nouvelle `startCapture` repart depuis `error` (réinitialisable).
- `selectedDeviceId` conservé **en mémoire uniquement** (aucune persistance
  locale dans ce lot).

## Contraintes getUserMedia (`buildAudioConstraints`)

```js
{
  audio: {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 2 },
  },
  video: false,
}
```

Traitements voix **désactivés** (EC/NS/AGC `false`) pour préserver le signal
musical. `channelCount` idéal stéréo, `deviceId` `exact` quand un device est
choisi. Pas de `sampleRate` forcé (laissé au navigateur — évite un
`OverconstrainedError` supplémentaire).

## Stratégie de fallback (`captureAudio`)

Échelle du plus contraint au moins contraint :
1. contraintes complètes (EC/NS/AGC off + `channelCount {ideal:2}`) ;
2. retirer `channelCount` (certains drivers refusent l'idéal) ;
3. contraintes simples avec `deviceId` exact (sans flags de traitement) ;
4. `audio: true` en dernier recours (perte du choix de device).

**Seul `OverconstrainedError` déclenche un fallback.** Les erreurs de
permission (`NotAllowedError`, `PermissionDeniedError`, `SecurityError`) sont
**remontées immédiatement** (jamais masquées) ; `NotFoundError` (device absent)
et `NotReadableError` (device occupé) sont aussi remontées sans fallback (un
`audio:true` de dernier recours y pickerait un autre device — contraire au
respect de la sélection). Après épuisement sur des `OverconstrainedError` :
`constraints_failed`.

`captureAudio` retourne `{ stream, track, settings, constraintsUsed, stop }`.
Une callback `onEnded` détecte la fin inattendue de la piste
(débranchement/arrêt externe).

## Sélection de périphérique (`findPreferredAudioDevice`)

Priorité :
1. `deviceId` précédemment sélectionné s'il existe encore ;
2. périphérique virtuel (label contient `blackhole`, `loopback`, `soundflower`,
   `vb-audio`, `virtual`) — **BlackHole n'est qu'un cas**, détection indicative
   multi-mots-clés ;
3. périphérique par défaut (`deviceId === 'default'`/`''` ou label « Default ») ;
4. première entrée disponible.

Normalisation : `{ deviceId, groupId, label, isDefault, isVirtual }`.
`requestAudioPermission` débloque les labels via un stream **jetable** dont on
stoppe immédiatement toutes les pistes (aucune conservation de flux, aucune
persistance de permission).

## Graphe Web Audio (`createAudioGraph`)

```
MediaStream source -> MediaStreamAudioSourceNode -> GainNode -> MediaStreamAudioDestinationNode
                                                          -> AnalyserNode (tap de mesure)
```

- Le flux publié plus tard par LiveKit sera `destinationNode.stream`.
- **Aucune connexion à `context.destination`** → aucun monitoring local audible,
  anti-Larsen garanti par construction (testé).
- `AnalyserNode` (fftSize 1024) est un **tap** post-gain : le vumètre mesure le
  signal réellement publié (post-fader).
- `AudioContextClass` injectable (tests). `close()` idempotent, `disconnect`
  protégé contre les erreurs, `AudioContext` fermé à l'arrêt.

## Gestion du gain

`setMasterGain(value)` borne dans **[0, 1]** (0 = silence, 1 = niveau source,
**jamais d'amplification** au-dessus de 1) via `clampGain`, puis
`gainNode.gain.value`. Applique au graphe si actif, mémorisé sinon.

## VU-mètre (`audioMeter`)

`computeMeterLevel(buf)` (pur) : RMS, peak, dBFS (`20·log10(rms)`, `-Infinity`
au silence), clipping (`peak > 0.99`). `createAudioMeter(analyserNode)` :
`read()` tire `getByteTimeDomainData` et renvoie le niveau ; `reset()` remet à
zéro. **Aucun `setInterval`/`requestAnimationFrame` interne** — le contrôleur
futur décidera de la fréquence de lecture. Aucune dépendance DOM (l'analyser
est injectable/fakeable).

## Arrêt et nettoyage

- `stopCapture` : stoppe toutes les pistes du stream de capture, ferme le
  graphe (déconnexion des nodes + `AudioContext.close()`), libère le vumètre.
- `destroy` : idempotent ; en plus de `stopCapture`, retire le listener
  `devicechange` et vide les subscribers.
- Anti fuite : une seule capture, un seul graphe ; `internalStop` utilisé avant
  toute transition d'erreur pour ne pas laisser de ressources ouvertes.

## devicechange

`watchAudioDeviceChanges` abonne un listener unique (retiré dans `destroy`).
Sur `devicechange` : rafraîchissement de la liste, puis :
- device sélectionné **disparu pendant `idle`** → retombe sur un fallback
  (`findPreferredAudioDevice(devices, null)`) **sans redémarrer la capture** ;
- device sélectionné **disparu pendant `capturing`/`starting`** → arrêt +
  `error(device_not_found)` ;
- **aucun redémarrage automatique sans action utilisateur**.

## Erreurs normalisées (`audioErrors.js`)

| Code | Cause |
|---|---|
| `permission_denied` | `NotAllowedError` / `PermissionDeniedError` / `SecurityError` |
| `device_not_found` | `NotFoundError` (ou device disparu en capture, ou aucune piste) |
| `device_busy` | `NotReadableError` (device déjà utilisé) |
| `constraints_failed` | `OverconstrainedError` (échelle épuisée) |
| `capture_failed` | Autre erreur inconnue |
| `track_ended` | Fin inattendue de la piste (`ended`) |

Aucune valeur secrète, aucun log de détail secret.

## Tests

30 tests ajoutés (`test/runTests.mjs`) → **87 au total** (57 + 30), avec fakes
injectés (`makeFakeMediaDevices`, `FakeAudioContext`, `makeFakeAnalyser`).
Couvrent : permission ok/refusée + piste jetable stoppée, énumération
audioinput uniquement, préférence BlackHole/deviceId/défaut, contraintes EC/NS/
AGC off + `channelCount {ideal:2}`, fallback sans `channelCount`, permission non
masquée par fallback, capture démarre, settings exposés, double-start = un seul
stream, stop arrête les pistes + ferme l'AudioContext + idempotent, gain borné
0/1, outputStream exposé, **pas de monitoring vers `context.destination`**,
RMS/peak/dBFS/clipping/silence, `track ended` → `error(track_ended)`,
`devicechange` rafraîchit + listener unique retiré au `destroy`, `destroy`
libère tout, `getSnapshot` ne divulgue ni stream/track/graphe ni objet interne.

Aucun test ne nécessite un navigateur réel, BlackHole, un micro, Internet ou
LiveKit.

## Dépendances

**Aucune ajoutée.** Web Audio (`AudioContext`,
`MediaStreamAudioSourceNode`, `GainNode`, `AnalyserNode`,
`MediaStreamAudioDestinationNode`) et `MediaDevices` (`getUserMedia`,
`enumerateDevices`, `devicechange`) suffisent. `package.json` inchangé
(`socket.io-client` seule dépendance runtime). Aucune dépendance React, aucune
dépendance LiveKit.

## Banc de test manuel

Non créé (non indispensable). `npm test` valide toute la logique via fakes.
Le banc navigateur réel (BlackHole + Ableton) viendra au Lot 4E (Control Room
complète, diagnostic `?debug=1`). Aucun `audio-test.html` ajouté — conformément
à « si ce banc n'est pas nécessaire, ne pas le créer ».

## Limites Safari / Chrome

- **Safari** : `enumerateDevices` peut renvoyer des `deviceId` vides avant
  permission (d'où l'appel `requestAudioPermission` pour débloquer les labels) ;
  `devicechange` n'est supporté qu'à partir de versions récentes (le moteur ne
  plante pas s'il est absent — `watchAudioDeviceChanges` se dégrade
  silencieusement). `AudioContext` peut démarrer `suspended` : `graph.resume()`
  est appelé après construction (nécessite un geste utilisateur en amont).
- **Chrome** : expose un device `default` (et souvent un doublon label « Default
  - … ») ; `isDefaultDevice` le reconnaît. `channelCount {ideal:2}` accepté ;
  certains drivers BlackHole mono peuvent ignorer l'idéal (d'où le fallback).
- Le `sampleRate` n'est pas forcé : évite un `OverconstrainedError` (l'ancien
  projet forçait 48000 — retiré ici, à réévaluer au Lot 4E si un device l'exige).

## Préparation pour LiveKit (Lot 4C)

- `getOutputStream()` fournit le `MediaStream` post-fader à publier
  (`livekitRoom.publishTrack(outputStream.getAudioTracks()[0], { audioPreset:
  musicHighQualityStereo, dtx:false, forceStereo:true })`).
- `setMasterGain` réglage en direct sans republication (gain du graphe).
- Le vumètre (`readMeter`) mesure le signal publié (post-fader) → VU « ON AIR »
  fidèle.
- La machine d'état expose `state` pour piloter l'UI Control Room et les
  transitions vers la connexion LiveKit (Lot 4C/4E).
- **Aucune référence LiveKit** dans ces modules : l'intégration se fera par un
  `livekitPublisher` (Lot 4C) qui consomme `getOutputStream()` sans coupler le
  moteur audio au transport réseau.

## Limites restantes

- Moteur audio local seul : **non câblé** à l'UI (aucun import depuis
  `src/main.js`), aucune connexion LiveKit, aucun endpoint token.
- Aucune persistance de la sélection de device (mémoire uniquement) —
  volontaire dans ce lot.
- Pas de banc navigateur réel (Lot 4E).
- `sampleRate` non forcé (à réévaluer au Lot 4E).
- La protection « un seul performer » et le TTL token relèvent du Lot 4C.