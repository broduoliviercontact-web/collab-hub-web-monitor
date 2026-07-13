# Graph Report - COLLAB-HUB WEB MONITOR  (2026-07-13)

## Corpus Check
- 126 files · ~114,384 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1137 nodes · 1685 edges · 169 communities (46 shown, 123 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ea5cbb0b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Collab-Hub Socket & Routing
- Test Suite Core
- Project Docs & Releases
- Architecture Concepts (BMAD)
- Serverless API & Session
- Public Listener & LiveKit Client
- Ops Debug Panel
- Local Audio Engine
- Control Room Publisher & Count
- NPM Dependencies
- Max Patch Validator
- Public Stream Status
- Control Room Auth Gate
- Web Audio Graph
- Diagnostics E2E Probe
- Secret Leak Checker
- License Checker
- Tracked Files Checker
- Test Fakes (Audio/Publisher)
- State Machines
- Diagnostics Observe Probe
- Test DOM Fakes
- Test Fakes (LiveKit Room)
- Collab-Hub Publish Semantics
- Rich sound_link Security
- Persistence & Freshness & Health
- Web Audio Fader Pipeline
- Listener Volume & Attenuation
- Diagnostics Namespace Probe
- Test Render Fakes
- Observation Guard
- Auth Mode & Persistence
- CI & License Check
- Performer Grants
- LiveKit Server Variables
- VU-meter
- Test Fake Context
- Test Rich-link Fakes
- Vercel Config & Rewrites
- Vite Build Config
- Product Brief (MVP)
- Reconnection Strategy
- Max Patch Validation Concept
- Heartbeat/Freshness Thresholds
- LiveKit Audio Audit
- Capture Fallback Ladder
- Config Validation (Placeholders)
- Listener State Machine
- Single-entry Routing
- Validation Matrix
- Public Mini VU-meter
- Bounded Event Log
- Diagnostic Export
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 76
- Community 77
- Community 78
- Socket.IO control event contract
- routeControl message router
- Publish register/deliver (Max double emit)
- Server null observers limit (v0.3.4)
- Max send/receive + delay mechanism
- Local persistence (localStorage)
- Freshness state (server/max/content)
- sound_heartbeat technical header
- CI workflow (ci.yml)
- BlackHole/Loopback device heuristics
- Listener grants (target)
- performerAuth (timingSafeEqual)
- Listener reconnection (1/2/4s)
- Room 'main' forced server-side
- Target token endpoint (serverless)
- createAudioEngine (façade + state machine)
- createAudioGraph (source->gain->analyser->dest)
- computeMeterLevel + createAudioMeter
- Listener grants (implemented)
- Performer grants (implemented)
- program-audio track name
- livekitPublisher
- Publisher state machine
- safeEqPassword (timingSafeEqual)
- LiveKit server variables (Vercel env)
- tokenClient
- api/livekit/token.js (serverless)
- Autoplay gesture handling
- livekitListener engine
- TrackSubscribed + program-audio priority
- VITE_LIVEKIT_ENABLED gate + DCE
- Composite state machine
- controlRoomPage (/control-room)
- controlRoomController
- ON AIR status
- v1.1.0 release preparation
- Safari/Chrome compatibility
- -20 dB attenuation
- Control Room gate (controlRoomGatePage)
- HMAC signed session cookie
- CONTROL_ROOM_SESSION_SECRET
- Listener speaker button
- timingSafeEqual (cookie MAC + password)
- Anti-fake-ON-AIR freshness rule
- publishClient (Collab-Hub publish wrapper)
- stream_* headers (onair/level/peak/updated_at)
- streamPresencePublisher
- streamStatus (createStreamStatus)
- countLiveListeners
- Public listener count
- parseSoundLink parser
- Rich sound_link [label]{url}
- stream_listener_count header
- debugGate (VITE_PUBLIC_DEBUG_ENABLED)
- Header tracker (11 headers)
- Diagnostic sanitizer (redact)
- System health banner
- Release v1.0.0 — initial
- GPL-3.0-only license adoption
- Release v1.0.1 — corrective (license)
- LiveKit audio layer (Live Audio Edition)
- Control Room server session (HMAC-SHA256 cookie, Lot 4F.1)
- LiveKit token endpoint api/livekit/token.js
- Release v1.1.0 — Live Audio Edition
- attachExistingAudioTracks fix (pre-published tracks)
- Release v1.1.1 — multi-listener fix
- iOS/Safari room.startAudio() autoplay unlock
- reconcileRemoteParticipants + scanRemoteAudio
- Release v1.1.2 — listener multi-client + iOS fix
- ch.client.maxpat abstraction (Collab-Hub Max Client)
- CollabHub_Web_Text_Sender.maxpat (Max patch)
- register/deliver publish semantics (1st pub registers only)
- ENVOYER LES 5 CHAMPS double-pass (t b b + delay 300)
- sound_heartbeat technical header (10s metro)
- VITE_COLLAB_HUB_AUTH_MODE anonymous vs guest
- CI GitHub Actions description (README)
- Collab-Hub Web Monitor (project overview)
- Control Room performer route /control-room
- Heartbeat & content freshness (Lot 3B)
- Public listener count (stream_listener_count, Lot 5)
- LiveKit audio layer (disabled by VITE_LIVEKIT_ENABLED)
- Namespace /hub requirement
- Local persistence localStorage (Lot 3A)
- sound_link enriched syntax [label]{url} (Lot 5)
- Vercel deployment + env vars
- probe-e2e2.mjs (e2e + / vs /hub isolation)
- probe-hub-ns.mjs (namespace /hub websocket)
- probe-observe.mjs (observeControl subscription)
- probe-order.mjs (register/deliver ordering)
- Collab-Hub protocol probes (sources of truth)

## God Nodes (most connected - your core abstractions)
1. `08 — Audit du moteur audio LiveKit et plan de migration (Lot 4A)` - 32 edges
2. `13 — Stabilisation, compatibilité navigateurs et release v1.1.0 (Lot 4F)` - 27 edges
3. `09 — Moteur audio local de la Control Room (Lot 4B)` - 20 edges
4. `11 — Moteur listener LiveKit et écoute publique (Lot 4D)` - 20 edges
5. `Collab-Hub Web Monitor` - 19 edges
6. `10 — Backend token serverless LiveKit + publisher audio (Lot 4C)` - 16 edges
7. `STREAM_HEADERS` - 15 edges
8. `Lot Ops Debug — Panneau d'exploitation durci` - 15 edges
9. `Release v1.0.0 — Collab-Hub Web Monitor` - 15 edges
10. `KNOWN_HEADERS` - 14 edges

## Surprising Connections (you probably didn't know these)
- `mountListenerSection()` --indirect_call--> `b()`  [INFERRED]
  src/listener/listenerSection.js → scripts/diagnostics/probe-order.mjs
- `createBoundedEventLog()` --indirect_call--> `add()`  [INFERRED]
  src/diagnostic/boundedEventLog.js → test/listener/listener.test.mjs
- `initDiagnostic()` --indirect_call--> `json()`  [INFERRED]
  src/diagnostic/diagnosticPanel.js → test/server/http.test.mjs
- `makeChPublisher()` --calls--> `connectCollabHubPublisher()`  [EXTRACTED]
  test/state/state.test.mjs → src/collabHub/publishClient.js
- `mintSession()` --calls--> `createSessionValue()`  [EXTRACTED]
  test/server/server.test.mjs → src/server/controlRoomSession.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **LiveKit program-audio pipeline** — docs_bmad_09-local-audio-engine_audio_engine, docs_bmad_10-livekit-token-and-publisher_publisher, docs_bmad_12-control-room-performer_control_room_page, docs_bmad_15-public-stream-status_stream_presence_publisher, docs_bmad_11-livekit-public-listener_listener_engine [INFERRED 0.95]
- **Token + grants + session security model** — docs_bmad_08-livekit-audio-engine-audit_performer_auth, docs_bmad_10-livekit-token-and-publisher_safe_eq_password, docs_bmad_10-livekit-token-and-publisher_performer_grants, docs_bmad_10-livekit-token-and-publisher_listener_grants, docs_bmad_14-control-room-session-and-listener-attenuation_session_cookie [INFERRED 0.90]
- **Collab-Hub register/deliver protocol flow** — docs_bmad_01-product-brief_five_sound_headers, docs_bmad_02-architecture_control_event, docs_bmad_01-product-brief_publish_semantics, docs_bmad_02-architecture_observe_guard, docs_bmad_06-heartbeat-and-freshness_sound_heartbeat [INFERRED 0.90]
- **Live Audio Edition (LiveKit layer = Control Room + token endpoint + listener)** — docs_release_v1.1.0_liveaudioedition, docs_release_v1.1.0_tokenendpoint, readme_controlroom, readme_livekitlayer [INFERRED 0.85]
- **Max patch → Collab-Hub namespace /hub → web public page protocol chain** — max_readme_collabhub_web_text_sender, readme_namespacehub, readme_publicpage, max_readme_registerdeliver [INFERRED 0.85]
- **LiveKit listener robustness fix progression (v1.1.1 → v1.1.2)** — docs_release_v1.1.1_attachexistingtracks, docs_release_v1.1.2_reconcileremote, docs_release_v1.1.2_iosstartaudio [INFERRED 0.85]

## Communities (169 total, 123 thin omitted)

### Community 0 - "Collab-Hub Socket & Routing"
Cohesion: 0.06
Nodes (54): STREAM_HEADERS, createBoundedEventLog(), buildDiagnosticExport(), ALL_TABLE_HEADERS, el(), initDiagnostic(), redactIdentity(), redactSensitiveInString() (+46 more)

### Community 1 - "Test Suite Core"
Cohesion: 0.07
Nodes (41): buildAudioConstraints(), captureAudio(), constraintLadder(), findPreferredAudioDevice(), isDefaultDevice(), isVirtualDevice(), listAudioInputDevices(), normalizeDevice() (+33 more)

### Community 2 - "Project Docs & Releases"
Cohesion: 0.22
Nodes (9): Build output verification (dist/index.html + JS + CSS), scripts/check-license.mjs step (GPL-3.0-only), CI workflow (test, license, maxpat, build, artifacts), validate-maxpat.mjs CI step, index.html — public Vite entry, Diagnostic section DOM (#diagnostic), validate-maxpat.mjs static patch validator, Ops diagnostic panel (?debug=1, gated) (+1 more)

### Community 4 - "Serverless API & Session"
Cohesion: 0.08
Nodes (46): createControlRoomController(), createDiagnosticsRenderer(), createControlRoomGate(), GATE_STATES, mountControlRoomGate(), mountControlRoom(), AUDIO_MAP, BROADCAST_LABELS (+38 more)

### Community 5 - "Public Listener & LiveKit Client"
Cohesion: 0.07
Nodes (33): b(), pub, sub, createListenerAudioElement(), mountListenerSection(), buildListenerDOM(), createClickDiscriminator(), DOT_CLASS (+25 more)

### Community 6 - "Ops Debug Panel"
Cohesion: 0.14
Nodes (29): handler(), handler(), handler(), generateIdentity(), grantsFor(), handler(), safeEqualPassword(), validateConfig() (+21 more)

### Community 7 - "Local Audio Engine"
Cohesion: 0.06
Nodes (53): buildSocketUrl(), resolveAuth(), resolveAuthMode(), trimSlash(), buildSocketOptions(), resolveCollabHubConfig(), KNOWN_HEADERS, normalizeValue() (+45 more)

### Community 8 - "Control Room Publisher & Count"
Cohesion: 0.06
Nodes (32): 08 — Audit du moteur audio LiveKit et plan de migration (Lot 4A), Architecture actuelle de l'ancien projet, Architecture cible dans collab-hub-web-monitor, Chaîne Web Audio (performer / broadcaster), Chemin de l'ancien projet, Coexistence des rooms (§14), Configuration des identités, Durée de vie des tokens (+24 more)

### Community 9 - "NPM Dependencies"
Cohesion: 0.08
Nodes (24): livekit-client, livekit-server-sdk, dependencies, livekit-client, livekit-server-sdk, socket.io-client, devDependencies, vite (+16 more)

### Community 10 - "Max Patch Validator"
Cohesion: 0.08
Nodes (21): badPipes, boxes, byId, client, delay, dup, file, gb (+13 more)

### Community 11 - "Public Stream Status"
Cohesion: 0.07
Nodes (29): 10. Compatibilité Safari [CODE] + [MANUEL], 11. Compatibilité Chrome [CODE] + [MANUEL], 12. Qualité audio [CODE] + [MANUEL], 13 — Stabilisation, compatibilité navigateurs et release v1.1.0 (Lot 4F), 13. Sécurité [AUTO] + [HTTP] + [CODE], 14. Correctifs apportés pendant le Lot 4F, 15. Procédure de correctif (si défaut runtime constaté), 16. Tests automatisés ajoutés pendant le Lot 4F (+21 more)

### Community 12 - "Control Room Auth Gate"
Cohesion: 0.08
Nodes (25): 10 — Backend token serverless LiveKit + publisher audio (Lot 4C), Arrêt (§15), Authentification performer (`safeEqualPassword`), Configuration Vercel, Contraintes respectées, Création de la piste (§12), Dépendances, Endpoint serverless — `api/livekit/token.js` (+17 more)

### Community 13 - "Web Audio Graph"
Cohesion: 0.09
Nodes (22): 11 — Moteur listener LiveKit et écoute publique (Lot 4D), Architecture, Arrêt (§15), Autoplay navigateur (§8), Configuration (§21), Connexion (§5), Contraintes respectées, Diagnostic (§20) (+14 more)

### Community 14 - "Diagnostics E2E Probe"
Cohesion: 0.09
Nodes (22): Architecture (testable, logique métier hors DOM), Bundle, Control Room (`src/control-room/controlRoomPage.js`), Câblage, Headers Collab-Hub (publics, aucun secret), Limites connues, Lot 4G — Indicateur public de flux direct + mini VU-mètre, Objectif (+14 more)

### Community 15 - "Secret Leak Checker"
Cohesion: 0.10
Nodes (20): 09 — Moteur audio local de la Control Room (Lot 4B), Architecture, Arrêt et nettoyage, audioEngine — API, Banc de test manuel, Contraintes getUserMedia (`buildAudioConstraints`), Contraintes respectées, devicechange (+12 more)

### Community 16 - "License Checker"
Cohesion: 0.36
Nodes (7): LICENSE_MARKERS, loadRepo(), main(), REQUIRED, verifyMetadata(), VALID_LICENSE, VALID_PKG

### Community 17 - "Tracked Files Checker"
Cohesion: 0.40
Nodes (4): argv, FORBIDDEN, isForbidden(), offenders

### Community 18 - "Test Fakes (Audio/Publisher)"
Cohesion: 0.09
Nodes (21): [1.0.0] - 2026-07-10, [1.0.1] - 2026-07-10, [1.1.0] - 2026-07-10, [1.1.1] - 2026-07-11, [1.1.2] - 2026-07-11, Added, Added, Added (+13 more)

### Community 20 - "Diagnostics Observe Probe"
Cohesion: 0.09
Nodes (21): Architecture, Build, Collab-Hub Web Monitor, Déploiement Vercel, Heartbeat Max & fraîcheur du contenu (Lot 3B), Intégration continue (CI), Lancement local, Licence (+13 more)

### Community 21 - "Test DOM Fakes"
Cohesion: 0.10
Nodes (19): Diagnostics `?debug=1`, Fallbacks (documentés), Limites connues, Lot 5 — sound_link enrichi + compteur public d'auditeurs, Non-régression, Objectif, Parseur — `parseSoundLink(value)`, Partie A — sound_link enrichi (+11 more)

### Community 22 - "Test Fakes (LiveKit Room)"
Cohesion: 0.11
Nodes (18): 1. Préflight, 2. Venv Python isolé (ne pas toucher au Python système), 3. Exclusions (`.graphifyignore` à la racine du dépôt), 4. Pipeline (exécution depuis la racine du dépôt), 4a. Détection (Step 2), 4b. Extraction AST (Step 3 Part A — code, déterministe, sans LLM), 4c. Extraction sémantique (Step 3 Part B — docs, via sous-agents), 4d. Fusion AST + sémantique (Step 3 Part C) (+10 more)

### Community 28 - "Diagnostics Namespace Probe"
Cohesion: 0.11
Nodes (17): Activation & sécurité (§1), Bandeau santé (§3), Documentation (§10), Données jamais affichées, Export diagnostic (§7), Fichiers, Limites restantes, Logs bornés (§2) (+9 more)

### Community 29 - "Test Render Fakes"
Cohesion: 0.12
Nodes (16): Ajouts, Compatibilité avec v1.0.0, Contenu du ZIP, Licence, Lien production, Lien vers LICENSE, Limites connues, Max (+8 more)

### Community 36 - "Test Fake Context"
Cohesion: 0.12
Nodes (15): 03 — Validation Lot 1 (et correctif Lot 1.1), Cas de test et résultats attendus, Ce qui reste attendu (non-bogue), Comportement des observers et limite serveur (Lot 1.1), Correctif client (observation idempotente), Critères de sortie Lot 1, Environnement de validation, Hors périmètre (reporté) (+7 more)

### Community 37 - "Test Rich-link Fakes"
Cohesion: 0.12
Nodes (15): 14 — Accès protégé Control Room + bouton enceinte listener (Lot 4F.1), A.1 Motivation, A.2 Architecture, A.3 Endpoints serveur, A.4 Cookie de session, A.5 Nouvelle variable serveur, A.6 Côté client, A. Session Control Room (+7 more)

### Community 53 - "Community 53"
Cohesion: 0.12
Nodes (15): Architecture, Configuration `.env.local`, Fonctionnement du heartbeat, Installation Max, Installation web, Lien dépôt GitHub, Lien production, Limites connues (+7 more)

### Community 54 - "Community 54"
Cohesion: 0.13
Nodes (14): 04 — Stabilisation production (Lot 2C), Configuration Vercel, Critères de sortie Lot 2C, Diagnostic, Hors périmètre, Mécanisme retenu (send/receive + delay), Partie A — Fiabilisation du bouton global Max, Partie B — Mode d'authentification web (+6 more)

### Community 55 - "Community 55"
Cohesion: 0.13
Nodes (14): 06 — Heartbeat Max & fraîcheur du contenu (Lot 3B), Architecture de l'état technique, Comportement public, Critères de sortie Lot 3B, Diagnostic `?debug=1`, Limites restantes, Modifications Max, Nouveau header technique : `sound_heartbeat` (+6 more)

### Community 56 - "Community 56"
Cohesion: 0.13
Nodes (14): 12 — Control Room performer complète (Lot 4E), Architecture, Configuration (§21), Contraintes respectées, Contrôleur (§7), Impact bundle, Limites restantes, Machine d'état composite (§5) (+6 more)

### Community 57 - "Community 57"
Cohesion: 0.13
Nodes (14): Ajouts Lot 4F.1 (vs Lot 4F, même version 1.1.0), Ajouts (vs v1.0.1), Checklist GO / NO-GO pour publier v1.1.0 « latest stable », Compatibilité avec v1.0.1, Limites connues, Nature de la release, Package, Release v1.1.0 — Collab-Hub Web Monitor — Live Audio Edition (+6 more)

### Community 58 - "Community 58"
Cohesion: 0.15
Nodes (12): Auth, Ce qui ne change pas, Configuration (source unique), Contrat de frontière Collab-Hub, Contrats, Diagnostics (homogènes), Headers (source unique), observe (page publique) (+4 more)

### Community 59 - "Community 59"
Cohesion: 0.15
Nodes (12): Cartographie §8 (domaines attendus vs communautés détectées), Graphify — Analyse architecturale (10 requêtes), Q10 — Connexions surprenantes ou fragiles, Q1 — Nœuds centraux du projet, Q2 — Chemin complet Ableton → BlackHole → LiveKit → listener, Q3 — Chemin Max → Collab-Hub → page publique, Q4 — Modules qui touchent aux secrets, Q5 — Modules dépendant de `livekit-client` (+4 more)

### Community 60 - "Community 60"
Cohesion: 0.15
Nodes (12): Comptes, Exclusions, Fichiers générés (commités), God nodes (nœuds centraux, les plus connectés), Graphify — Synthèse du graphe de connaissances, Limites de l'analyse, Métadonnées de génération, Ouvrir graph.html (+4 more)

### Community 61 - "Community 61"
Cohesion: 0.15
Nodes (12): 05 — Persistance locale du dernier contenu (Lot 3A), Au chargement (`main.js`), Comportement attendu, Critères de sortie Lot 3A, Diagnostic (`?debug=1` uniquement), Format de stockage, Limites restantes, Logique de validation (`loadSoundState`) (+4 more)

### Community 62 - "Community 62"
Cohesion: 0.17
Nodes (11): 07 — Maintenance et durcissement de la CI (Lot 3F), Concurrence, Contraintes respectées, Contrôles licence (`scripts/check-license.mjs`), Limites, Objectifs, Permissions, Procédure de test (locale) (+3 more)

### Community 63 - "Community 63"
Cohesion: 0.18
Nodes (10): Cause racine, Compatibilité, Correctif (`src/livekit/livekitListener.js`), Limites connues (inchangées vs v1.1.0), Nature du patch, Package, Release v1.1.2 — Collab-Hub Web Monitor — Live Audio Edition (correctif listener multi-client + iOS), Suite (+2 more)

### Community 64 - "Community 64"
Cohesion: 0.18
Nodes (10): Ce que fait le patch, CollabHub_Web_Text_Sender — patch Max émetteur de test (Lot 0C), Dépannage, Installation du client Collab-Hub, Option A — ajouter le dépôt au Search Path (recommandé pour un spike), Option B — installation en tant que package, Prérequis, Sémantique importante (testée contre le serveur public) (+2 more)

### Community 65 - "Community 65"
Cohesion: 0.33
Nodes (10): deriveCollabHub(), deriveGlobal(), deriveLiveKit(), deriveMax(), deriveStream(), deriveSystemHealth(), HEALTH, LK_ATTENTE_PISTE (+2 more)

### Community 66 - "Community 66"
Cohesion: 0.33
Nodes (9): baseSnap(), fakeController(), fakeDoc(), fakeMeter(), fakePresence(), fakeRuntime(), fakeStreamPublisher(), fakeWin() (+1 more)

### Community 67 - "Community 67"
Cohesion: 0.20
Nodes (9): 01 — Product Brief, Critères de réussite, Décisions techniques validées, Hors périmètre, Problème, Périmètre MVP, Risques, Utilisateur principal (+1 more)

### Community 68 - "Community 68"
Cohesion: 0.20
Nodes (9): 02 — Architecture, Contrat de données, Décision namespace `/hub`, Dépendances, Flux Max → Collab-Hub → navigateur, Mapping des cinq headers, Mode diagnostic, Stratégie de reconnexion (+1 more)

### Community 69 - "Community 69"
Cohesion: 0.20
Nodes (9): Cause racine, Compatibilité, Correctif (`src/livekit/livekitListener.js`), Limites connues (inchangées vs v1.1.0), Nature du patch, Package, Release v1.1.1 — Collab-Hub Web Monitor — Live Audio Edition (correctif multi-listener), Sécurité (+1 more)

### Community 70 - "Community 70"
Cohesion: 0.25
Nodes (3): pub, subHub, subRoot

### Community 71 - "Community 71"
Cohesion: 0.48
Nodes (6): FORBIDDEN_PATTERNS, isText(), listTrackedFiles(), main(), scan(), SKIP_PATH

### Community 72 - "Community 72"
Cohesion: 0.40
Nodes (4): ce qu'on NE peut pas prouver côté client, probes conservés, probes supprimés (Lot 1.1), Scripts de diagnostic (probes Collab-Hub)

## Knowledge Gaps
- **594 isolated node(s):** `here`, `file`, `REQUIRED_HEADERS`, `boxes`, `ids` (+589 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **123 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `STREAM_HEADERS` connect `Collab-Hub Socket & Routing` to `Test Suite Core`, `Serverless API & Session`, `Local Audio Engine`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `requestLiveKitToken()` connect `Public Listener & LiveKit Client` to `Test Suite Core`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `here`, `file`, `REQUIRED_HEADERS` to the rest of the system?**
  _594 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Collab-Hub Socket & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.058426966292134834 - nodes in this community are weakly interconnected._
- **Should `Test Suite Core` be split into smaller, more focused modules?**
  _Cohesion score 0.06648575305291723 - nodes in this community are weakly interconnected._
- **Should `Serverless API & Session` be split into smaller, more focused modules?**
  _Cohesion score 0.07868852459016394 - nodes in this community are weakly interconnected._
- **Should `Public Listener & LiveKit Client` be split into smaller, more focused modules?**
  _Cohesion score 0.07372549019607844 - nodes in this community are weakly interconnected._