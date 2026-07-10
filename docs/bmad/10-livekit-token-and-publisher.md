# 10 — Backend token serverless LiveKit + publisher audio (Lot 4C)

Objectif : installer les dépendances LiveKit, créer un endpoint serverless
Vercel générant des tokens temporaires, sécuriser les rôles performer/listener,
créer le publisher côté navigateur et connecter le `MediaStream` du moteur audio
local (Lot 4B) à LiveKit Cloud. **Aucune UI publique, aucun listener public,
aucune release.** Les secrets ne sont jamais exposés au navigateur.

## Contraintes respectées

- `livekit-client` ^2.20.1 + `livekit-server-sdk` ^2.17.0 ajoutés (seules deps
  LiveKit). Aucun React / Express / dotenv / cors / zod / framework serveur.
- Aucune variable `VITE_LIVEKIT_API_KEY` / `VITE_LIVEKIT_API_SECRET` (les secrets
  ne sont jamais préfixés `VITE_`, jamais dans le bundle).
- Aucun `.env` réel suivi ; `.env.example` ne contient que des placeholders
  factices (refusés par l'endpoint).
- Aucun token statique ; tokens temporaires générés à la demande.
- `roomName` / `identity` / `grants` / `ttl` jamais acceptés depuis le client
  (forcés/générés serveur).
- `canPublish:false` pour le listener ; `canSubscribe:false` pour le performer.
- Page publique, patch Max, design, version `1.0.1`, tag/release : inchangés.
- Moteur audio local (`src/audio/*` Lot 4B) non modifié fonctionnellement.

## Dépendances

| Paquet | Version | Rôle | Côté |
|---|---|---|---|
| `livekit-server-sdk` | ^2.17.0 | `AccessToken`, `VideoGrant` (signature JWT) | serveur (api/) |
| `livekit-client` | ^2.20.1 | `Room`, `LocalAudioTrack`, `Track`, `AudioPresets` | navigateur (injecté au Lot 4E) |

> `livekit-server-sdk` n'est importé que par `api/livekit/token.js` (hors graphe
> Vite). `livekit-client` n'est **pas importé** dans ce lot (le publisher est
> entièrement injectable) → bundle public **inchangé** (44 modules, mêmes
> hashes d'assets). L'import réel de `livekit-client` se fera au Lot 4E (Control
> Room), ce qui créera alors un chunk dédié non chargé sur la page publique.

`npm audit` signale 2 vulnérabilités **préexistantes** dans `esbuild`/`vite`
(dev server, devDeps) — **sans lien avec LiveKit**. Non corrigées ici (un
`audit fix --force` casserait Vite 5 → 8, changement majeur hors périmètre).

## Endpoint serverless — `api/livekit/token.js`

`POST /api/livekit/token` (Vercel Function, même projet que le frontend →
**same-origin**, `fetch("/api/livekit/token")`, **aucun CORS wildcard**).

- Méthode non POST → `405` + `Allow: POST`.
- Body JSON invalide → `400 { error: "invalid_request" }`.
- Rôle inconnu → `400 { error: "invalid_role" }`.
- Configuration serveur absente/invalide → `503 { error: "livekit_unavailable" }`
  (log serveur sans valeur secrète, uniquement les noms de variables).
- Performer : mot de passe absent **ou** incorrect → `401 { error: "unauthorized" }`
  (même réponse, pas de distinction).
- Listener : aucun mot de passe requis.

### Entrées

Performer : `{ "role": "performer", "password": "..." }`
Listener : `{ "role": "listener" }`

**Jamais acceptés depuis le client** : `roomName`, `identity`, `grants`, `ttl`,
`canPublish`, `canSubscribe`. Tout champ supplémentaire est ignoré.

### Valeurs forcées / générées serveur

- `ROOM_NAME = "main"` (constante).
- Identity : `performer-<UUID>` / `listener-<UUID>` via `crypto.randomUUID()`.
- TTL : `7200` s (2 h) explicite — ne dépend pas du TTL par défaut du SDK.
- Grants (AudioPresets) :

| Rôle | roomJoin | room | canPublish | canSubscribe | canPublishData |
|---|---|---|---|---|---|
| performer | true | main | true | false | false |
| listener | true | main | false | true | false |

Usage applicatif audio uniquement ; aucune permission vidéo supplémentaire.

### Réponse (200)

```json
{ "token": "<JWT>", "url": "<LIVEKIT_URL>", "room": "main",
  "identity": "<id>", "role": "performer|listener", "expiresIn": 7200 }
```

Headers : `Content-Type: application/json`, `Cache-Control: no-store`.
**Jamais renvoyés** : API Key, API Secret, mot de passe, grants détaillés.

> Note : le JWT contient `iss = LIVEKIT_API_KEY` (identifiant émetteur, standard
> LiveKit) — c'est l'API **Key** (publique par conception LiveKit), pas le
> **Secret** (jamais présent dans le token ni la réponse).

## Validation config (`validateConfig`)

Vérifie (sans exposer de valeur) : présence + non-vide de `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `PERFORMER_PASSWORD` ; `LIVEKIT_URL`
commence par `wss://` (ou `ws://` local) ; rejet des placeholders manifestes
(`wss://your-project.livekit.cloud`, `your-api-key`, `your-api-secret`,
`change-me`) ; `PERFORMER_PASSWORD` ≥ 8 caractères. Retourne `{ ok, missing,
reasons }`. Injectée (`env` param) → testable sans toucher `process.env`.

## Authentification performer (`safeEqualPassword`)

`crypto.timingSafeEqual` sur des `Buffer` ; longueurs différentes → `false`
sans lever (comparaison quand même effectuée pour lisser le timing). Aucune
distinction absent/incorrect → `401` générique. Le mot de passe n'est jamais
loggué ni retourné.

## Variables serveur

Lues dans `api/livekit/token.js` via `process.env` (Vercel Environment Variables) :

| Variable | Rôle | Préfixe VITE_ ? |
|---|---|---|
| `LIVEKIT_URL` | URL LiveKit Cloud (wss://) | non |
| `LIVEKIT_API_KEY` | clé API (émetteur JWT) | non |
| `LIVEKIT_API_SECRET` | secret (signature JWT) | non |
| `PERFORMER_PASSWORD` | mot de passe performer | non |

Publique (bundle) : `VITE_LIVEKIT_ENABLED=false` (section audio désactivée ;
non activée dans ce lot). **Aucune duplication de `LIVEKIT_URL` côté client** :
l'endpoint la renvoie dans `url`.

## tokenClient — `src/livekit/tokenClient.js`

`requestLiveKitToken({ role, password, fetchImpl, timeoutMs, path,
AbortControllerImpl })` :

- POST JSON same-origin (`credentials: same-origin`) ;
- timeout via `AbortController` (défaut 8 s) ;
- rôle invalide → rejeté **avant fetch** (pas d'appel réseau) ;
- validation stricte de `{ token, url, room, identity, role }` ;
- erreurs normalisées : `token_unauthorized`, `token_unavailable`,
  `token_invalid_response`, `token_network_error`, `token_timeout`,
  `token_failed` ;
- **token jamais loggué** ; **mot de passe jamais conservé** au-delà de la
  requête (présent uniquement dans le corps, absent de la valeur renvoyée) ;
- **aucun stockage** localStorage/sessionStorage du token ou du mot de passe.

`fetchImpl` injectable → testable sans réseau.

## Publisher — `src/audio/livekitPublisher.js`

`createLiveKitPublisher({ tokenClient, RoomClass, LocalAudioTrackClass,
trackSource, publishOptions, trackName, roomOptions, now })`.

**Entièrement injectable** : n'importe **pas** `livekit-client` (RoomClass,
LocalAudioTrackClass, trackSource injectés par l'appelant au Lot 4E). Testable
en Node sans navigateur, sans vrai LiveKit.

API : `connect({ password, outputStream }) · publish() · stop() · disconnect() ·
destroy() · getSnapshot() · subscribe(listener) · getState()`.

### Création de la piste (§12)

- `outputStream = audioEngine.getOutputStream()` ;
- récupère **exactement une** piste `getAudioTracks()` avec `readyState ===
  "live"` (sinon `no_audio_track` / `no_output_stream` / `track_ended`) ;
- `new LocalAudioTrackClass(mediaTrack, { name: "program-audio", source:
  trackSource })` — `trackSource` par défaut `"microphone"` (équivaut à
  `Track.Source.Microphone` de livekit-client ; choix documenté : source audio
  générique la plus compatible pour une piste audio issue d'un graphe Web Audio) ;
- **pas de nouveau `getUserMedia`** : la piste est celle du graphe Web Audio ;
- `room.localParticipant.publishTrack(localTrack, { dtx:false, forceStereo:true
  })` — `audioPreset: AudioPresets.musicHighQualityStereo` sera passé par
  l'appelant au Lot 4E (constante livekit-client).

### Machine d'état (§13)

```
idle -> requesting_token -> connecting -> connected -> publishing -> live
                                                              |
   reconnecting <------------------------------------------- (Reconnecting)
   error (token/connect/publish/disconnected/track_ended)    |
   stopping -> stopped
```

Snapshot : `{ state, roomName, identity, participantSid, trackSid, connected,
published, reconnectCount, lastError, connectedAt, liveSince }`.
**Jamais dans le snapshot** : token, password, API key/secret, objet Room,
MediaStream.

### Ordre de connexion (§14)

vérifier outputStream → token → créer Room → `room.connect` → créer
LocalAudioTrack → `publishTrack` → `live`. Échec à toute étape → `cleanup`
(unpublish + disconnect + retirer listeners) → `error` + erreur normalisée.

### Arrêt (§15)

`stop()` idempotent : unpublish **avec `stop=false`** (ne stoppe **pas** la piste
source), `disconnect` Room, retire les listeners, vide identity/roomName/trackSid
→ `stopped`. **Le publisher ne stoppe jamais le `MediaStream` de audioEngine ni
ne ferme l'`AudioContext`** : le moteur audio local reste propriétaire de sa
capture. Le publisher ne possède que le wrapper `LocalAudioTrack` + la connexion
Room.

### Reconnexion (§16)

Événements Room natifs (valeurs string de `RoomEvent`) : `reconnecting` → état
`reconnecting` + `reconnectCount++` ; `reconnected` → `live` si piste toujours
publiée/live (pas de republication automatique sans vérification) ; 
`disconnected` → `stopped` si arrêt volontaire (`userStopped`), sinon `error`.
**Pas de seconde Room**, **pas de boucle manuelle 1/2/4 s** : la reconnexion
native du SDK LiveKit est utilisée telle quelle.

## Ownership des ressources

| Ressource | Propriétaire | stop/destroy du publisher |
|---|---|---|
| `MediaStream` source + `AudioContext` | `audioEngine` (Lot 4B) | non arrêté |
| `LocalAudioTrack` wrapper | publisher | unpublish (stop=false) |
| Connexion `Room` | publisher | disconnect + retirer listeners |

## Protection multi-performers (§17)

**Stratégie choisie (option minimale acceptable)** : mot de passe serveur
(`PERFORMER_PASSWORD`, comparaison timing-safe) + identity unique générée serveur
(`performer-<UUID>`).

**Limite documentée** : si le mot de passe est partagé, plusieurs performers
peuvent encore obtenir un token `canPublish:true` et publier simultanément dans
`main` (identities différentes → pas d'expulsion LiveKit). Aucune protection
« un seul performer » n'est implémentée dans ce lot.

L'option recommandée (vérification d'un participant publiant existant via
`RoomServiceClient` côté serveur → refus `409`) n'est **pas** implémentée pour
éviter une architecture complexe et un appel réseau LiveKit par token (latence,
nouveaux modes d'échec). `RoomServiceClient` n'est jamais exposé au navigateur.
La décision ferme (refus `409` / éviction / acceptation) est reportée à un lot
ultérieur si le besoin de diffusion exclusive se confirme.

## Sécurité

- Secrets serveur uniquement (Vercel Environment Variables, jamais `VITE_`).
- Aucun secret dans le bundle navigateur (`livekit-client` non importé ici ;
  `livekit-server-sdk` hors graphe Vite).
- `.env.example` : placeholders factices uniquement.
- Logs serveur génériques (noms de variables, jamais de valeurs).
- Token/mot de passe jamais loggués côté client ; non stockés en localStorage.
- `Cache-Control: no-store` sur la réponse token.
- Script `scripts/check-livekit-secrets.mjs` (Lot 4C) : scanne les fichiers
  suivis et refuse `VITE_LIVEKIT_API_KEY/SECRET` et tout JWT littéral commité.
  Intégré à `npm run check` (`check:secrets`). Wiring dans la CI GitHub Actions
  reporté (modification de `.github/workflows/ci.yml` → nécessite édition web,
  pas le scope `workflow` du token actuel).

## Tests

- **Endpoint (20)** : 405/Allow, body invalide 400, rôle inconnu 400, performer
  sans/mauvais mot de passe 401, performer OK, listener OK, room forcée `main`,
  identity serveur, préfixes performer/listener, grants performer/listener, TTL
  7200, config/URL/secret absents 503, pas d'API key/secret dans la réponse,
  `Cache-Control: no-store`. JWT décodé (fake API key/secret signe un JWT
  inutilisable contre le vrai LiveKit) — **aucun vrai LiveKit Cloud**.
- **tokenClient (12)** : succès performer/listener, 401, 503, JSON invalide,
  token/URL absents, timeout, erreur réseau, password non conservé, token non
  loggué, rôle invalide rejeté avant fetch.
- **publisher (22)** : outputStream absent, aucune piste, piste ended, token
  demandé, connexion Room, publication, état live, double connect bloqué,
  double publish bloqué, stop unpublish (stop=false), stop disconnect, stop ne
  stoppe pas audioEngine, stop idempotent, erreurs token/connect/publish
  nettoient, reconnecting, reconnected, disconnect involontaire, destroy retire
  listeners, snapshot sans token/password. Fakes LiveKit injectés.

**141 tests au total** (87 + 54). Aucun test ne nécessite Internet, vrai
LiveKit, vraie API key/secret, navigateur ou micro.

## Configuration Vercel

Dans **Project Settings → Environment Variables**, ajouter (Production +
Preview, et Development si `vercel dev`) :

- `LIVEKIT_URL` (wss://…)
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `PERFORMER_PASSWORD` (≥ 8 caractères)

**Ne jamais** demander à Claude d'afficher les valeurs, ni les inscrire dans un
fichier suivi. Après ajout → **redeploy**. Vérification : `vercel dev` + POST
`/api/livekit/token` avec `{ "role": "listener" }` doit renvoyer un token ;
avec des placeholders → `503 livekit_unavailable`.

### Test local recommandé

`vercel dev` (CLI Vercel, **non installée comme dépendance projet** —
installation globale par l'utilisateur). Vite seul ne sert pas les fonctions
`api/`. Avec des variables factices, l'endpoint renvoie `503` sans révéler de
détail.

## Préparation Lot 4D (listener public)

Le listener réutilisera : `api/livekit/token.js` (rôle `listener`, sans mot de
passe), `tokenClient.js` (tel quel), et un futur `livekitListener` consommant
`TrackSubscribed` → `track.attach(<audio>)`, volume/mute/trim, reconnexion
native. La room `main` et les grants listener (`canSubscribe:true`) sont déjà en
place. Aucun changement de l'endpoint requis pour 4D.

## Limites restantes

- Publisher non câblé à l'UI (aucun import depuis `src/main.js`) ; `livekit-client`
  non importé dans ce lot.
- Pas de listener public, pas de Control Room visuelle, pas d'indicateur ON AIR.
- Pas de refresh token (TTL 2h ; reconnexion native suffit en session courte).
- Protection multi-performers = mot de passe + identity unique uniquement
  (partage possible).
- Wiring du script `check-livekit-secrets` dans la CI reporté (édition web
  `.github/workflows/ci.yml`).
- Vulnérabilités `npm audit` (esbuild/vite, devDeps, préexistantes) non corrigées.