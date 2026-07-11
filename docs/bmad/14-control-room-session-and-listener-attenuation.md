# 14 — Accès protégé Control Room + bouton enceinte listener (Lot 4F.1)

Objectif : protéger l'accès aux contrôles de la Control Room par une **session
serveur signée** (mot de passe demandé une seule fois, jamais par token) et
remplacer les boutons texte COUPER/RÉACTIVER du listener par un **bouton
enceinte accessible** (clic = mute, double-clic = atténuation −20 dB). Aucune
nouvelle fonctionnalité hors ces deux sujets. **Aucun tag ni release v1.1.0
créé par ce lot** — la version reste 1.1.0.

> Convention de validation (cf. `docs/bmad/13`) : **[AUTO]** tests/build,
> **[HTTP]** requête production, **[CODE]** revue de code, **[MANUEL]** à
> valider manuellement (jamais présenté comme validé).

## A. Session Control Room

### A.1 Motivation

Avant le Lot 4F.1, le mot de passe performer était transmis à chaque demande
de token (`POST /api/livekit/token {role:"performer", password}`). Le lot
précedent avait déjà évité de le stocker, mais il restait demandé à chaque
diffusion. Désormais le mot de passe est demandé **une seule fois** : la
Control Room pose un cookie de session signé ; le token performer ne fait que
vérifier ce cookie. Le mot de passe ne transite plus par le client après la
connexion.

### A.2 Architecture

La page `/control-room` est scindée en **deux chunks** :

- `controlRoomGatePage.js` (**~16 ko**, chargé avant auth) — écran de login
  minimal (titre « CONTROL ROOM », champ mot de passe, bouton ENTRER, erreur
  générique). **N'importe ni `livekit-client`, ni le moteur audio, ni
  `controlRoomPage.js` statiquement.** Aucun contrôle métier, aucun
  `AudioContext`, aucune permission micro, aucun vumètre avant la session.
- `controlRoomPage.js` (**~529 ko**, import **dynamique** post-auth) — monte
  le moteur audio, le publisher LiveKit, le contrôleur, le vumètre. C'est le
  seul chunk qui contient `livekit-client`.

Au succès de la connexion, le gate détruit le DOM de login et importe
dynamiquement `controlRoomPage.js`. Au logout / expiration : démontage des
engines (arrêt capture + diffusion, `destroy()`) et retour à l'écran de login.

> Garde-fou de code-split vérifié par test : aucun `import ... from
> '.../controlRoomPage.js'` statique, aucun `import ... livekit-client`
> statique, aucun `import ... audioEngine` dans le gate page [AUTO].

### A.3 Endpoints serveur

Tous same-origin, JSON, `Cache-Control: no-store`.

| Endpoint | Méthode | Rôle | Réponse |
|---|---|---|---|
| `POST /api/control-room/login` | POST | Compare `password` à `PERFORMER_PASSWORD` via `timingSafeEqual` ; pose le cookie signé | 200 `{authenticated:true, expiresIn:7200}` / 401 `{error:"unauthorized"}` / 400 / 405 / 503 |
| `POST /api/control-room/logout` | POST | Efface le cookie (`Max-Age=0`) | 200 `{authenticated:false}` / 405 |
| `GET /api/control-room/session` | GET | Vérifie cookie (signature + expiration) | 200 `{authenticated:true, exp}` ou 200 `{authenticated:false}` (jamais 401) / 503 |

`POST /api/livekit/token` (modifié) : le rôle **performer** ne compare plus de
mot de passe. Il exige un cookie de session valide (`validateSessionConfig` →
503 si config absente ; `readSessionCookie` + `verifySessionValue` → 401 si
absent / signature invalide / expiré). Le rôle **listener** est inchangé (aucune
session requise). Le champ `password` dans le corps est désormais **ignoré**.

### A.4 Cookie de session

- Nom : `control_room_session`.
- Format : `base64url(payload).base64url(hmac)` où `payload = {role:"performer", exp}`.
  Format **2 segments** délibéré (ne ressemble pas au JWT 3 segments
  `eyJ…` interdit par `check-livekit-secrets`).
- Signature : **HMAC-SHA256** via `node:crypto`, clé `CONTROL_ROOM_SESSION_SECRET`
  (distincte de `PERFORMER_PASSWORD`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
  Comparaison timing-safe (`timingSafeEqual` sur le MAC).
- Attributs : `HttpOnly`, `Path=/`, `SameSite=Strict`, `Max-Age=7200` (2 h),
  `Secure` **en production uniquement** (`VERCEL_ENV`/`NODE_ENV`).
- `PERFORMER_PASSWORD` n'est **jamais** utilisée comme clé de signature.
- Aucun mot de passe n'est loggué ; aucune valeur secrète n'est renvoyée.

### A.5 Nouvelle variable serveur

`CONTROL_ROOM_SESSION_SECRET` — secret de signature HMAC. **Jamais préfixé
`VITE_`**, jamais dans le bundle, jamais dans le code. Configurer dans Vercel
**Production + Preview** (valeur aléatoire longue, distincte de toute autre).
Placeholder factice dans `.env.example` :
`CONTROL_ROOM_SESSION_SECRET=replace-with-a-long-random-secret`. Le garde-fou
`check-livekit-secrets.mjs` refuse désormais `VITE_CONTROL_ROOM_SESSION_SECRET`
dans le code [AUTO].

### A.6 Côté client

- `src/control-room/sessionClient.js` — wrappers `fetch` (`login`, `logout`,
  `checkSession`) avec `AbortController` (timeout 8 s), `credentials:'same-origin'`.
  Messages FR génériques (« Mot de passe incorrect. » / « Service
  d'authentification indisponible. » / « Session expirée. » / « Erreur réseau. »).
- `src/control-room/controlRoomGate.js` — machine d'état pure
  (`unauthenticated` → `authenticating` → `authenticated` / `error`). Le mot
  de passe est un **paramètre local** de `login()`, jamais stocké, jamais dans
  le snapshot (qui n'expose que `{state, authenticated, error, exp, updatedAt}`).
- `src/control-room/controlRoomGatePage.js` — montage de l'écran de login,
  `checkSession()` au chargement (rechargement pendant session → accès
  conservé), import dynamique de la Control Room après auth.
- Le message `token_unauthorized` devient « Session expirée — reconnectez-vous
  à la Control Room. » (un 401 performer signifie désormais une session
  expirée, plus un mauvais mot de passe).

## B. Bouton enceinte listener + −20 dB

### B.1 Contrôles

Remplacement des boutons texte COUPER/RÉACTIVER par un **vrai `<button>`** :

- `lk-speaker` — icône 🔊 (volume actif) / 🔉 (atténué) / 🔇 (mute) ;
  `aria-label` + `title` (« Couper le son » / « Réactiver le son »).
- `lk-atten-badge` — pastille discrète « −20 dB » à côté de l'enceinte,
  visible **uniquement** si l'atténuation est active.
- `lk-atten-btn` — bouton secondaire accessible « −20 dB »
  (`aria-pressed`, `aria-label` « Activer/Désactiver l'atténuation de 20
  décibels ») — fallback clavier/tactile au double-clic. Visible dès qu'une
  piste est présente.

### B.2 Interactions

- **Clic simple** sur l'enceinte = mute/unmute. Le volume utilisateur est
  préservé (le slider ne bouge pas, pas de déconnexion).
- **Double-clic** sur l'enceinte = atténuation −20 dB. Un discriminateur
  (`createClickDiscriminator`) diffère l'action simple d'un court délai ; le
  double-clic annule l'action simple en attente et déclenche l'atténuation.
  Résultat : un double-clic produit **uniquement** l'atténuation, jamais la
  cascade mute → unmute → atténuation.
- **Bouton −20 dB** = bascule directe de l'atténuation (clavier/tactile).
- Clavier : Entrée/Espace sur le `<button>` = clic = mute (le bouton −20 dB
  couvre l'atténuation au clavier).

### B.3 Calcul du volume

- Atténuation −20 dB → gain linéaire `10^(-20/20) = 0.1`
  (`ATTENUATION_GAIN = 0.1`, `ATTENUATION_DB = -20`).
- `effectiveVolume = muted ? 0 : (attenuationActive ? volume × 0.1 : volume)`.
- Le **mute est prioritaire** sur l'atténuation ; l'unmute restaure le volume
  effectif atténué.
- Le **slider représente toujours le volume utilisateur** (jamais la valeur
  atténuée) : il ne bouge pas pendant l'atténuation. Un changement de slider
  pendant l'atténuation recalcule `effectiveVolume` (×0.1).
- Snapshot étendu : `attenuationDb` (−20 actif / 0 inactif),
  `attenuationActive`, `effectiveVolume`. Aucun objet audio, aucun token.
- Label volume : « 60 % » normalement, « 60 % · −20 dB » si atténué (et non
  « 6 % »).

## C. Tests

326 tests `node:test` verts (271 → 326, +55), aucun réseau / LiveKit / micro /
navigateur. Nouveaux blocs :

- **§16 Session serveur (15)** — méthodes, body, mauvais/bon mot de passe,
  cookie HttpOnly/Secure(prod)/SameSite/Max-Age, expiration, aucun mot de
  passe dans la réponse, session valide/absente/altérée/expirée, logout,
  config absente (503), aucune valeur secrète renvoyée.
- **§17 Token performer (7)** — sans session → 401, expirée → 401, valide →
  token, listener sans session, `password` corps ignoré, grants inchangés,
  aucun secret dans la réponse.
- **§18 Gate Control Room (10+)** — état initial, snapshot sans contrôle métier,
  aucun import statique audioEngine/livekit-client, login bon/mauvais, mot de
  passe jamais dans le snapshot, logout, reset expiration, rechargement
  (`checkSession`), subscriber, vue login (`buildLoginDOM`/`renderLogin`/
  `wireLogin`).
- **§19 Enceinte (16)** — icônes, mute/unmute, toggleAttenuation, double-clic
  sans mute, clic simple après délai, restauration, `effectiveVolume = ×0.1`,
  slider inchangé, recalcule, mute prioritaire, unmute restauré, badge/label,
  aria-label/aria-pressed, `<button>` clavier, fallback tactile.
- **§20 Sécurité** — `check-livekit-secrets` refuse `VITE_CONTROL_ROOM_SESSION_SECRET`.

`npm run check` vert (tests + licence + tracked + secrets + maxpat + build).
Build propre : `controlRoomGatePage` 16.69 ko (sans `livekit-client`),
`controlRoomPage` 528.93 ko (post-auth), `main` 51 ko.

## D. Limites

- Pas de refresh / rotation de session : TTL 2 h, reconnexion au rechargement
  via `checkSession`. Une session expirée ramène à l'écran de login (« Session
  expirée. »).
- Le gate est une **barrière d'application** (contrôles non montés, chunk
  lourd non chargé) avec validation serveur : ce n'est pas un accès à des
  fichiers privés (la page HTML reste téléchargeable, mais inerte avant auth).
- L'atténuation est un multiplicateur de volume appliqué au sink ; ce n'est pas
  un traitement DSP. Le slider reste le volume utilisateur.

## E. À valider manuellement [MANUEL]

- Control Room : `/control-room` n'affiche que l'écran login ; mauvais mot de
  passe refusé ; bon mot de passe donne accès ; pas de second mot de passe
  pour la diffusion ; capture + ON AIR ; QUITTER arrête diffusion + capture et
  revient au login ; rechargement pendant session conserve l'accès ; expiration
  ramène au login.
- Listener : 🔊 visible, clic → 🔇, reclic → 🔊, double-clic → 🔉 + « −20 dB »,
  audio atténué, double-clic → normal, slider fonctionne pendant l'atténuation,
  clavier + mobile.
- Configurer `CONTROL_ROOM_SESSION_SECRET` dans Vercel Production + Preview,
  redéployer, vérifier le login serveur réellement.

Voir checklist GO/NO-GO dans `docs/bmad/13` et `docs/release/v1.1.0.md`.