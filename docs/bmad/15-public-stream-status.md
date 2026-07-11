# Lot 4G — Indicateur public de flux direct + mini VU-mètre

Date : 2026-07-11. Statut : implémenté (commit `feat: add public live stream status and vu meter`).
**Pas de tag/release** tant que la validation manuelle n'est pas faite.

## Objectif

Afficher le statut du direct **AVANT** que l'utilisateur ne clique sur
« ÉCOUTER LE DIRECT » et sans utiliser la connexion listener LiveKit pour le
déterminer. La page publique sait si un performer est ON AIR, et affiche un mini
VU-mètre informatif, indépendamment de l'état de lecture du listener.

## UI publique (page d'accueil)

```
DIRECT AUDIO
Statut : EN DIRECT
Signal : présent
Niveau : [mini VU-mètre]
```

En dessous, la section « Écouter le direct » (bouton ÉCOUTER LE DIRECT + état
listener) reste **inchangée** (moteur listener v1.1.2, bouton, logique).

### États possibles

| Statut affiché    | Condition                                            |
|-------------------|------------------------------------------------------|
| EN DIRECT         | `stream_onair=1` ET timestamp frais (< 3 s)          |
| HORS ANTENNE      | `stream_onair=0` ET timestamp frais (< 3 s)          |
| STATUT INDISPONIBLE | aucun état reçu, OU stale (aucune màj depuis > 3 s) |

### Signal

| Signal  | Condition                                                      |
|---------|----------------------------------------------------------------|
| présent | EN DIRECT ET `stream_level > 0.01` (RMS, seuil documenté)      |
| silence | EN DIRECT ET `stream_level <= 0.01`                            |
| —       | HORS ANTENNE ou STATUT INDISPONIBLE                            |

**Anti-faux-EN-DIRECT** : un état est considéré frais seulement si un header de
flux a été reçu il y a moins de `STALE_MS` (3 s). Au-delà, on ignore la dernière
valeur (même `onair=1`) et on affiche STATUT INDISPONIBLE. La fraîcheur est
mesurée en **horloge locale de réception** (`receivedAt`), pas sur le timestamp
publié, pour rester insensible au skew d'horloge Control Room ↔ listener.

## Headers Collab-Hub (publics, aucun secret)

Publié par la Control Room, observé par la page publique (même serveur +
namespace que les 5 contenus : `VITE_COLLAB_HUB_URL` / `VITE_COLLAB_HUB_NAMESPACE`).

| Header             | Sémantique                                                      |
|--------------------|-----------------------------------------------------------------|
| `stream_onair`     | `1` uniquement si `publisher.state === live` (snapshot.onAir)  |
| `stream_level`     | RMS normalisé 0..1 (0 si hors antenne)                          |
| `stream_peak`      | peak normalisé 0..1 (0 si hors antenne)                         |
| `stream_updated_at`| timestamp epoch ms au moment de la publication                  |

**Ne casse pas les 5 headers existants** : `routeControl` reste réservé aux 5
contenus ; les headers de flux sont routés par `routeStreamControl`
(`state/streamStatus.js`). Aucune modification du patch Max ni du moteur
listener v1.1.2.

## Architecture (testable, logique métier hors DOM)

### `src/state/streamStatus.js` (pur, horloge injectable)
- `createStreamStatus({ now })` → `{ ingest(header, values), getSnapshot(), reset() }`.
- `getSnapshot()` → `{ onAir, level, peak, updatedAt, ageMs, fresh, signalPresent, signal, computedStatus }`.
- `routeStreamControl(data, stream)` : route un évènement `control` de flux (retourne `true` si header de flux).
- `clamp01`, `parseOnAir`, `parseTimestamp` : helpers purs exportés.
- Constantes : `STREAM_HEADERS`, `STALE_MS=3000`, `SIGNAL_THRESHOLD=0.01`, `STREAM_STATUS`, `STREAM_SIGNAL`.
- Aucun token/secret/password.

### `src/control-room/streamPresencePublisher.js` (injectable)
- `createStreamPresencePublisher({ now, throttleMs=400, emitter })` → `{ update, stop, getDiagnostics }`.
- `update(snapshot, meter)` : publie `onair=1` si `snapshot.onAir`, `level/peak` clampés (0 si hors antenne).
  Transition onair (start/stop) publiée **immédiatement** (hors throttle) ; sinon au rythme du throttle (défaut 400 ms). Pas d'envoi à chaque frame.
- `stop()` : reset immédiat `onair=0, level=0, peak=0, updatedAt=now`.
- `getDiagnostics()` → `{ lastPublishedAt, publishedOnAir, publishedLevel, publishedPeak, publishCount, throttleMs }`.
- Emitter no-op si Collab-Hub non configuré (publication désactivée propre).

### `src/collabHub/publishClient.js` (wrapper fin socket.io)
- `connectCollabHubPublisher({ serverUrl, namespace, username, authMode })` → `{ socket, publish(header, values), isConnected, destroy }`.
- Réutilise `authMode.js` (même résolution URL/namespace/auth que la page publique).
- `publish` → `socket.emit('control', { mode:'publish', target:'all', header, values })` (protocole register/deliver, cf. `scripts/diagnostics/probe-e2e2.mjs`).

### `src/ui/streamStatusView.js` (pur, `document` injecté)
- `buildStreamStatusDOM(document, mountAfter)` → `{ section, els }`. Construit le bloc DIRECT AUDIO.
- `renderStreamStatus(snap, els)` : écritures DOM pures (largeurs via `setAttribute('style','width:..%')`). **reduced-motion safe** : aucune transition inline (le CSS global désactive les transitions sous `prefers-reduced-motion`).

## Câblage

### Page publique (`src/publicPage.js`)
- Si `VITE_LIVEKIT_ENABLED=true` : crée `streamStatus`, construit le bloc DIRECT AUDIO après la `card`, observe `STREAM_HEADERS` après (re)connexion (guard idempotent), route les headers de flux dans `handleControl` (avant `routeControl`), rend le statut à chaque header reçu + à chaque tick 1 s (fraîcheur). La section listener se monte **après** le bloc flux.
- Si LiveKit désactivé : pas de bloc flux (cohérent avec l'absence de section listener).
- Diagnostic `?debug=1` : 8 champs flux (onAir, level, peak, updatedAt, ageMs, fresh, signalPresent, computedStatus).

### Control Room (`src/control-room/controlRoomPage.js`)
- Connexion Collab-Hub en mode publication + `streamPresencePublisher`. Emitter branché à la résolution de la connexion (référence mutable) ; no-op avant.
- Le `update` est piloté par le tick du VU-mètre existant (RAF, ou 100 ms en reduced-motion) — donc uniquement pendant la capture. Throttle interne 400 ms ; transitions onair immédiates.
- Teardown (`destroy` / `beforeunload`) : `stop()` + déconnexion Collab-Hub.
- Diagnostic `?debug=1` : `streamPresence` ajouté au `pre` debug (lastPublishedAt, publishedOnAir, publishedLevel, publishedPeak, publishCount, throttleMs).

### `src/collabHub/messageRouter.js`
- Export `STREAM_HEADERS` (source de vérité unique, réutilisée par `streamStatus.js`).
- Non ajouté à `OBSERVABLE_HEADERS` (observation gérée à part par la page publique, seulement si LiveKit activé).

### `src/listener/listenerUI.js`
- Le `<h2>` de la section listener passe de « DIRECT AUDIO » à « Écouter le direct » pour éviter un doublon avec le nouveau bloc flux public. **Moteur listener, bouton ÉCOUTER LE DIRECT et logique inchangés.**

## Tests (`test/runTests.mjs`, 350 → 367, +17)

12 tests obligatoires + 5 de couverture :
1. onair=1 + niveau haut → EN DIRECT / présent
2. onair=1 + niveau bas → EN DIRECT / silence
3. onair=0 (frais) → HORS ANTENNE
4. stale → STATUT INDISPONIBLE (pas de faux EN DIRECT)
5. payload invalide → fallback sûr
6. `clamp01` borne 0..1 (invalides → 0, >1 → 1)
7. throttle respecté (pas d'envoi à chaque frame)
8. stop → reset immédiat (onair=0, level=0, peak=0)
8b. transition onair publiée immédiatement (hors throttle)
8c. level/peak clampés côté publisher même si meter > 1
9. `routeStreamControl` route les headers de flux, ignore les autres
9b. headers complets → EN DIRECT / présent
10. listener non régressé (bouton ÉCOUTER LE DIRECT inchangé, titre ajusté, DOM OK)
11. aucun secret/token/password dans snapshots streamStatus + publisher
12. rendu reduced-motion safe (largeurs + data-attr, pas de transition inline)
12b. INDISPONIBLE par défaut avant tout header
12c. constantes stables (seuils documentés)

`npm run check` vert (tests + licence + tracked + secrets + maxpat + build Vite).

## Bundle

- `main` JS : 51.08 → 51.34 kB (+0.26) — streamStatus + view + routing.
- `main` CSS : 8.08 → 9.19 kB (+1.11) — stream-card + mini VU-meter.
- `controlRoomPage` JS : 529.01 → 530.86 kB (+1.85) — publishClient + streamPresencePublisher.
- `socket.io-client` **non dupliqué** : partagé entre le bundle public et Control Room (import cross-chunk depuis le chunk `main`). Aucune nouvelle dépendance.

## Sécurité

- Aucun secret/token/cookie/mot de passe publié ou affiché. Les 4 headers sont des valeurs publiques (booléen onair, niveaux 0..1, timestamp).
- `check-livekit-secrets` reste vert.
- La publication réutilise `VITE_COLLAB_HUB_URL` / `VITE_COLLAB_HUB_NAMESPACE` (existants) ; aucun nouvel env var secret.

## Limites connues

- **HORS ANTENNE est transitoire** : si la Control Room ne publie plus après un arrêt (capture stoppée), le statut passe à STATUT INDISPONIBLE après 3 s (règle de fraîcheur, spec). Une persistance de HORS ANTENNE exigerait un heartbeat Control Room (hors périmètre).
- Le mini VU-mètre public est **informatif** : il reflète le niveau publié (throttle 400 ms), pas un suivi frame-à-frame. Il ne remplace pas le listener.
- chunk `controlRoomPage` reste > 500 kB (avertissement Vite préexistant, `manualChunks` non configuré).

## Validation manuelle attendue (avant release)

- Control Room : démarrer capture → ON AIR → page publique affiche « EN DIRECT / présent » + mini VU-mètre animé.
- Stop diffusion → page publique « HORS ANTENNE » puis « STATUT INDISPONIBLE » après ~3 s.
- Aucune connexion listener nécessaire pour voir le statut.
- Listener inchangé : bouton ÉCOUTER LE DIRECT, lecture, mute, atténuation, iOS.
- `?debug=1` public : champs flux cohérents ; `?debug=1` Control Room : `streamPresence` présent.

## Suite — Lot 5 (extension additive)

Le mécanisme de flux direct a été étendu par le **Lot 5** (voir
`docs/bmad/16-rich-sound-link-and-listener-count.md`) :

- Un **5ᵉ header public** `stream_listener_count` a été ajouté à `STREAM_HEADERS`
  (`src/collabHub/messageRouter.js`). Il transporte le **nombre** d'auditeurs
  distants (aucune identité/SID). La page publique l'observe et le rend via
  `streamStatus` (`normalizeCount`, `formatListenerCount`, fraîcheur dédiée
  `listenerCountReceivedAt`).
- La publication réutilise le même `publishClient` (register puis deliver) et le
  même `streamPresencePublisher` (5ᵉ emit, transition immédiate sur changement
  du compteur, `stop` publie `0`).
- La carte de flux direct (`stream-card`) reste **debug-only** ; le compteur
  d'auditeurs, lui, est visible sur `/` et `/?debug=1` (span dédié dans la
  section listener, `aria-live="polite"`).

Aucun changement du patch Max, des 5 champs `sound_*`, ni du moteur listener.