# Lot Ops Debug — Panneau d'exploitation durci

Date : 2026-07-11. Statut : implémenté (commit `feat: harden and improve
operations debug panel`). **Pas de tag/release** tant que la validation
manuelle n'est pas faite.

## Objectif

Transformer le spike `?debug=1` en un panneau d'exploitation **sûr, borné et
lisible** : activation gated, logs bornés (ring buffer), bandeau santé,
version/configuration runtime non sensible, tableau des headers attendus, stats
Collab-Hub, export diagnostic sécurisé. Aucune modification des fonctions audio
ou Collab-Hub métier ; pas de release avant validation.

## Activation & sécurité (§1)

- **Page publique** (`/?debug=1`) : le panneau ne se monte QUE si `?debug=1`
  est présent **ET** la variable build publique `VITE_PUBLIC_DEBUG_ENABLED`
  vaut exactement `true` (`src/diagnostic/debugGate.js`,
  `shouldMountPublicDebug`). En production (`false`, défaut) : `/?debug=1`
  monte **AUCUN** panneau. La carte de flux debug (`mountStreamCard`) et les
  logs console `dbg` sont également gated par cette condition.
- **Control Room** (`/control-room?debug=1`) : gated par session performer
  (`controlRoomDebugAllowed` : `authenticated && debugParam==='1'`). La page
  Control Room elle-même ne se monte qu'après authentification -> le debug
  performer n'existe jamais avant une session valide. Non affecté par
  `VITE_PUBLIC_DEBUG_ENABLED`.
- **Vercel** : `VITE_PUBLIC_DEBUG_ENABLED` à mettre à `true` dans les
  Environment Variables des déploiements **Preview/dev** uniquement. Garder
  `false` (ou absent) en Production. Variable PUBLIQUE (pas de secret).

### Données jamais affichées

Aucune route debug n'expose : token, access_token, cookie, authorization,
password, secret, API key, API secret, session secret, ou identity/SID complète
d'auditeur. Les identity et `audioTrackSid` d'auditeur sont masqués dans le DOM
via `redactIdentity` (indice court + `•••`). L'identity performer (non
personnelle, utile à l'exploitation) est conservée. Aucune métrique réseau
inventée : `getListenerNetworkStats()` renvoie `{status:'unsupported'}`.

## Logs bornés (§2)

`src/diagnostic/boundedEventLog.js` — `createBoundedEventLog({maxEntries:200})`.
API : `add(entry)` (prépend, cap à 200, `totalCount` incrémenté à chaque add y
compris en overflow), `clear()` (efface les entrées SEULEMENT, conserve
`totalCount`), `getEntries()`, `getTotalCount()`, `getSnapshot()` ->
`{entries,count,totalCount,maxEntries}`. Ignore `null`/`undefined`. Rendu via
`eventLog.textContent = entries.join('\n')` (jamais innerHTML). Bouton
« Effacer les logs » + compteurs « conservés / reçus (tampon 200) ».

## Bandeau santé (§3)

`src/diagnostic/systemHealth.js` — `deriveSystemHealth({collabHub,maxFreshness,
liveKit,streamStatus})` -> `{collabHub,max,liveKit,stream,global}`.

- Collab-Hub : OK / RECONNEXION / HORS LIGNE / ERREUR.
- Max : ACTIF / SILENCIEUX / JAMAIS VU.
- LiveKit : PLAYING / ATTENTE PISTE / ATTENTE UTILISATEUR / CONNEXION / ERREUR /
  INACTIF (désactivé = nominal).
- Flux : FRAIS / STALE / INDISPONIBLE.
- Global : OPÉRATIONNEL / DÉGRADÉ / ERREUR (ERREUR si sev≥3, DÉGRADÉ si sev≥1).

Lisible en <3 s. Bordure colorée selon `data-health` (vert/orange/rouge).

## Version & configuration runtime (§4)

`src/diagnostic/runtimeConfig.js` — `buildRuntimeConfig({env,build})` ->
`{version,gitCommitSha,buildTimestamp,vercelEnv,livekitEnabled,
publicDebugEnabled,collabHubUrl,collabHubNamespace,authMode,livekitUrl}`.
`redactLiveKitUrl(url)` -> host seul (pas de query/token) ; `—` si absent. Les
globals de build (`__APP_VERSION__`, `__GIT_COMMIT_SHA__`,
`__BUILD_TIMESTAMP__`, `__VERCEL_ENV__`) sont injectées via `vite.config.js`
(`define`), `null` -> `—`. Aucune clé secrète présente.

## Tableau des headers attendus (§5)

`src/diagnostic/headerTracker.js` — 11 headers : `sound_title`, `sound_author`,
`sound_subtitle`, `sound_description`, `sound_link`, `sound_heartbeat`,
`stream_onair`, `stream_level`, `stream_peak`, `stream_updated_at`,
`stream_listener_count`. Colonnes : header / observé / reçu / compteur /
dernière réception / âge / valeur brute résumée / statut. Statuts : OK / JAMAIS
REÇU / STALE / NON OBSERVÉ. Seuils : `sound_heartbeat` 25 s, `stream_*` 3 s,
contenu 300 s. `truncateRaw` (≤40 caractères + `…`) pour l'affichage ; la
valeur complète n'est disponible que dans l'export JSON sécurisé. Lignes
manquantes/stale surlignées.

## Stats Collab-Hub (§6)

Collectées via listeners socket dédiés dans le panneau (`connect` /
`disconnect` / `connect_error` / `reconnect`), distincts du `setStatus()` piloté
par publicPage (pas de doublon fonctionnel). Affiche : transport (engine),
socket connecté, socket ID, nombre de reconnexions, dernière raison de
déconnexion, dernier message `connect_error`, dernière connexion à, dernière
déconnexion à. Pas de ping latency inventé si indisponible.

## Export diagnostic (§7)

`src/diagnostic/diagnosticExport.js` — `buildDiagnosticExport({...})` assemble
`{generatedAt,health,runtime,freshness,headers,liveKit:{listener,network},
collabHub,listenerCount,logs}` puis passe le tout au sanitizer récursif
(`src/diagnostic/diagnosticSanitizer.js`). Boutons : « Copier le diagnostic »
(`navigator.clipboard`), « Télécharger JSON » (Blob + anchor). Exclut (via
sanitizer) : `token`, `access_token`, `cookie`, `authorization`, `password`,
`secret`, `api_key`, `api_secret`, `session_secret`, identity/SID complète.
Masque aussi `token=`/`password=`/`api_key=`/`secret=` dans les chaînes et
`Bearer ...`. Références circulaires -> `[REDACTED:circular]`.

### Sanitizer

`REDACT_KEYS` (token/access_token/authorization/password/secret/api_key/api_secret/
session_secret/cookie/...) -> `[REDACTED]`. `IDENTITY_KEYS` (identity/sid/
participant_sid/track_sid/...identity) -> `redactIdentity` (indice + `•••`).
Récursif sur objets et tableaux. Testable en Node (pur).

## Stats réseau WebRTC (§8)

`src/diagnostic/networkStats.js` — `getListenerNetworkStats()` ->
`{status:'unsupported'}`. Architecture préparatoire uniquement : aucune fausse
métrique. Quand une implération fiable (RTCPeerConnection.getStats) sera
disponible, remplacer le corps ; la clé `status` reste stable.

## Tests (§9)

491 tests `node:test` verts (452 antérieurs + 39 ops). Les 24 cas obligatoires
sont couverts explicitement (voir `test/runTests.mjs`, section « Lot Ops Debug ») :
(1) debug public désactivé par défaut ; (2) activé uniquement avec variable
`true` ; (3) control-room debug exige session ; (4) ring buffer limité à 200 ;
(5) `totalCount` continue au-delà du cap ; (6) `clear` vide uniquement les
entrées ; (7) health OPÉRATIONNEL ; (8) health DÉGRADÉ ; (9) health ERREUR ;
(10) Max jamais vu ; (11) stream stale ; (12) LiveKit `waiting_for_track` ;
(13) table contient les 11 headers ; (14) header jamais reçu ; (15) header
stale ; (16) valeur longue tronquée ; (17) export JSON valide ; (18) sanitizer
retire token/password/secret/cookie ; (19) copie diagnostic sans secret ;
(20) URL LiveKit redacted ; (21) aucun innerHTML (piège qui lève, prouvé actif) ;
(22) panneau non monté hors debug ; (23) page publique normale inchangée ;
(24) listener audio non régressé.

## Documentation (§10)

- README.md : section « Mode diagnostic (panneau d'exploitation) » réécrite,
  caveat production mis à jour.
- `.env.example` : `VITE_PUBLIC_DEBUG_ENABLED=false` documenté.
- `vite.config.js` : bloc `define` pour les globals de build.

## Validation (§11)

`npm run check` vert (491 tests + licence + tracked + secrets + maxpat + build
Vite propre). `git diff --check` propre. Commit `feat: harden and improve
operations debug panel` sur `main`, CI verte. **Pas de tag/release** avant
validation manuelle.

## Limites restantes

- `getListenerNetworkStats` renvoie `unsupported` (pas de fausse métrique) ;
  implémentation WebRTC réelle reportée.
- `manualChunks` non configuré -> avertissement Vite sur `controlRoomPage`
  (>500 ko), préexistant.
- L'URL LiveKit affiche `—` côté page publique (l'URL est serveur-only, retournée
  par l'endpoint token au runtime, non cuite dans le bundle) — comportement sûr.
- L'identity performer est conservée (non personnelle, utile à l'exploitation) ;
  l'export la masque conservativement via `IDENTITY_KEYS`.

## Fichiers

Nouveaux modules purs : `src/diagnostic/{boundedEventLog,systemHealth,
headerTracker,runtimeConfig,diagnosticSanitizer,networkStats,diagnosticExport,
debugGate}.js`. Modifiés : `src/diagnostic/diagnosticPanel.js` (réécrit),
`src/publicPage.js` (gate + runtimeConfig), `index.html` (sections),
`vite.config.js` (define), `.env.example`, `src/styles/main.css`, `README.md`,
`test/runTests.mjs`.