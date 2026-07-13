# Graph Report - .  (2026-07-13)

## Corpus Check
- 92 files · ~102,167 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 563 nodes · 1051 edges · 53 communities (28 shown, 25 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 89 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `Collab-Hub Web Monitor (project overview)` - 16 edges
2. `mountPublicPage()` - 15 edges
3. `handler()` - 11 edges
4. `KNOWN_HEADERS` - 11 edges
5. `handler()` - 10 edges
6. `scripts` - 9 edges
7. `connectCollabHubPublisher()` - 9 edges
8. `mountControlRoom()` - 9 edges
9. `STREAM_HEADERS` - 8 edges
10. `connectCollabHub()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `mountListenerSection()` --indirect_call--> `b()`  [INFERRED]
  src/listener/listenerSection.js → scripts/diagnostics/probe-order.mjs
- `createBoundedEventLog()` --indirect_call--> `add()`  [INFERRED]
  src/diagnostic/boundedEventLog.js → test/runTests.mjs
- `Namespace /hub requirement` --rationale_for--> `ch.client.maxpat abstraction (Collab-Hub Max Client)`  [INFERRED]
  README.md → max/README.md
- `Namespace /hub requirement` --rationale_for--> `probe-hub-ns.mjs (namespace /hub websocket)`  [INFERRED]
  README.md → scripts/diagnostics/README.md
- `probe-e2e2.mjs (e2e + / vs /hub isolation)` --rationale_for--> `Namespace /hub requirement`  [INFERRED]
  scripts/diagnostics/README.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **LiveKit program-audio pipeline** — docs_bmad_09-local-audio-engine_audio_engine, docs_bmad_10-livekit-token-and-publisher_publisher, docs_bmad_12-control-room-performer_control_room_page, docs_bmad_15-public-stream-status_stream_presence_publisher, docs_bmad_11-livekit-public-listener_listener_engine [INFERRED 0.95]
- **Token + grants + session security model** — docs_bmad_08-livekit-audio-engine-audit_performer_auth, docs_bmad_10-livekit-token-and-publisher_safe_eq_password, docs_bmad_10-livekit-token-and-publisher_performer_grants, docs_bmad_10-livekit-token-and-publisher_listener_grants, docs_bmad_14-control-room-session-and-listener-attenuation_session_cookie [INFERRED 0.90]
- **Collab-Hub register/deliver protocol flow** — docs_bmad_01-product-brief_five_sound_headers, docs_bmad_02-architecture_control_event, docs_bmad_01-product-brief_publish_semantics, docs_bmad_02-architecture_observe_guard, docs_bmad_06-heartbeat-and-freshness_sound_heartbeat [INFERRED 0.90]
- **Live Audio Edition (LiveKit layer = Control Room + token endpoint + listener)** — docs_release_v1.1.0_liveaudioedition, docs_release_v1.1.0_tokenendpoint, readme_controlroom, readme_livekitlayer [INFERRED 0.85]
- **Max patch → Collab-Hub namespace /hub → web public page protocol chain** — max_readme_collabhub_web_text_sender, readme_namespacehub, readme_publicpage, max_readme_registerdeliver [INFERRED 0.85]
- **LiveKit listener robustness fix progression (v1.1.1 → v1.1.2)** — docs_release_v1.1.1_attachexistingtracks, docs_release_v1.1.2_reconcileremote, docs_release_v1.1.2_iosstartaudio [INFERRED 0.85]

## Communities (53 total, 25 thin omitted)

### Community 0 - "Collab-Hub Socket & Routing"
Cohesion: 0.09
Nodes (38): buildSocketUrl(), resolveAuth(), resolveAuthMode(), trimSlash(), KNOWN_HEADERS, normalizeValue(), OBSERVABLE_HEADERS, routeControl() (+30 more)

### Community 1 - "Test Suite Core"
Cohesion: 0.05
Nodes (13): createElement(), FAKE_ENV, fakeAudioEl(), fakePublishSocket(), GOOD_BODY, makeChPublisher(), makeFakeAudioSink(), makeFakeListenerRoomClass() (+5 more)

### Community 2 - "Project Docs & Releases"
Cohesion: 0.07
Nodes (44): CHANGELOG (v1.0.0 to v1.1.2), control-room.html — performer Vite entry (noindex), Release v1.0.0 — initial, GPL-3.0-only license adoption, Release v1.0.1 — corrective (license), LiveKit audio layer (Live Audio Edition), Control Room server session (HMAC-SHA256 cookie, Lot 4F.1), LiveKit token endpoint api/livekit/token.js (+36 more)

### Community 3 - "Architecture Concepts (BMAD)"
Cohesion: 0.06
Nodes (40): Five sound_* headers, Namespace /hub decision, Socket.IO control event contract, routeControl message router, sound_heartbeat technical header, BlackHole/Loopback device heuristics, Listener grants (target), performerAuth (timingSafeEqual) (+32 more)

### Community 4 - "Serverless API & Session"
Cohesion: 0.12
Nodes (32): handler(), json(), readBody(), handler(), json(), handler(), json(), generateIdentity() (+24 more)

### Community 5 - "Public Listener & LiveKit Client"
Cohesion: 0.09
Nodes (26): b(), pub, sub, createListenerAudioElement(), mountListenerSection(), buildListenerDOM(), createClickDiscriminator(), DOT_CLASS (+18 more)

### Community 6 - "Ops Debug Panel"
Cohesion: 0.10
Nodes (28): createBoundedEventLog(), buildDiagnosticExport(), ALL_TABLE_HEADERS, el(), initDiagnostic(), redactIdentity(), redactSensitiveInString(), sanitizeDiagnostic() (+20 more)

### Community 7 - "Local Audio Engine"
Cohesion: 0.12
Nodes (23): buildAudioConstraints(), captureAudio(), constraintLadder(), findPreferredAudioDevice(), isDefaultDevice(), isVirtualDevice(), listAudioInputDevices(), normalizeDevice() (+15 more)

### Community 8 - "Control Room Publisher & Count"
Cohesion: 0.11
Nodes (28): countLiveListeners(), toParticipants(), ACTIVE, createLiveKitPublisher(), PUBLISHER_ERRORS, createControlRoomController(), mountControlRoom(), AUDIO_MAP (+20 more)

### Community 9 - "NPM Dependencies"
Cohesion: 0.08
Nodes (24): livekit-client, livekit-server-sdk, dependencies, livekit-client, livekit-server-sdk, socket.io-client, devDependencies, vite (+16 more)

### Community 10 - "Max Patch Validator"
Cohesion: 0.08
Nodes (21): badPipes, boxes, byId, client, delay, dup, file, gb (+13 more)

### Community 11 - "Public Stream Status"
Cohesion: 0.14
Nodes (15): clamp01(), formatListenerCount(), normalizeCount(), parseOnAir(), parseTimestamp(), STREAM_SIGNAL, STREAM_STATUS, buildStreamStatusDOM() (+7 more)

### Community 12 - "Control Room Auth Gate"
Cohesion: 0.29
Nodes (13): createControlRoomGate(), GATE_STATES, mountControlRoomGate(), buildLoginDOM(), renderLogin(), wireLogin(), checkSession(), doFetch() (+5 more)

### Community 13 - "Web Audio Graph"
Cohesion: 0.21
Nodes (6): createAudioGraph(), FakeAudioContext, makeFakeAnalyser(), makeFakeStream(), makeFakeTrack(), makeNode()

### Community 14 - "Diagnostics E2E Probe"
Cohesion: 0.25
Nodes (3): pub, subHub, subRoot

### Community 15 - "Secret Leak Checker"
Cohesion: 0.48
Nodes (6): FORBIDDEN_PATTERNS, isText(), listTrackedFiles(), main(), scan(), SKIP_PATH

### Community 16 - "License Checker"
Cohesion: 0.47
Nodes (5): LICENSE_MARKERS, loadRepo(), main(), REQUIRED, verifyMetadata()

### Community 17 - "Tracked Files Checker"
Cohesion: 0.40
Nodes (4): argv, FORBIDDEN, isForbidden(), offenders

### Community 18 - "Test Fakes (Audio/Publisher)"
Cohesion: 0.47
Nodes (6): makeController(), makeFakeAudioEngine(), makeFakeMediaTrack(), makeFakeOutputStream(), makeFakePublisher(), readyAudio()

### Community 19 - "State Machines"
Cohesion: 0.50
Nodes (4): Audio engine state machine, Publisher state machine, Composite state machine, ON AIR status

### Community 21 - "Test DOM Fakes"
Cohesion: 0.50
Nodes (4): fakeDocument(), fakeDomEl(), fakeStorage(), get()

### Community 22 - "Test Fakes (LiveKit Room)"
Cohesion: 0.50
Nodes (4): makeFakeLocalAudioTrackClass(), makeFakeRoomClass(), makeFakeTokenClient(), makePublisher()

### Community 23 - "Collab-Hub Publish Semantics"
Cohesion: 0.67
Nodes (3): Publish semantics (register/deliver, double emit), Publish register/deliver (Max double emit), Max send/receive + delay mechanism

### Community 24 - "Rich sound_link Security"
Cohesion: 0.67
Nodes (3): isSafeHttpUrl link security, parseSoundLink parser, Rich sound_link [label]{url}

### Community 25 - "Persistence & Freshness & Health"
Cohesion: 0.67
Nodes (3): loadSoundState strict validation, Freshness state (server/max/content), System health banner

### Community 26 - "Web Audio Fader Pipeline"
Cohesion: 0.67
Nodes (3): Web Audio fader pipeline, createAudioGraph (source->gain->analyser->dest), Safari/Chrome compatibility

### Community 27 - "Listener Volume & Attenuation"
Cohesion: 0.67
Nodes (3): Listener volume/mute/trim, -20 dB attenuation, Listener speaker button

### Community 29 - "Test Render Fakes"
Cohesion: 0.67
Nodes (3): add(), fakeEl(), fakeEls()

## Knowledge Gaps
- **130 isolated node(s):** `here`, `file`, `REQUIRED_HEADERS`, `boxes`, `ids` (+125 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createControlRoomGate()` connect `Control Room Auth Gate` to `Test Suite Core`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `here`, `file`, `REQUIRED_HEADERS` to the rest of the system?**
  _130 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Collab-Hub Socket & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.08823529411764706 - nodes in this community are weakly interconnected._
- **Should `Test Suite Core` be split into smaller, more focused modules?**
  _Cohesion score 0.04830917874396135 - nodes in this community are weakly interconnected._
- **Should `Project Docs & Releases` be split into smaller, more focused modules?**
  _Cohesion score 0.06871035940803383 - nodes in this community are weakly interconnected._
- **Should `Architecture Concepts (BMAD)` be split into smaller, more focused modules?**
  _Cohesion score 0.05897435897435897 - nodes in this community are weakly interconnected._
- **Should `Serverless API & Session` be split into smaller, more focused modules?**
  _Cohesion score 0.12012012012012012 - nodes in this community are weakly interconnected._