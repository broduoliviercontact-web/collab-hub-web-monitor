# Graphify — Synthèse du graphe de connaissances

Synthèse humaine de la cartographie Graphify du dépôt **Collab-Hub Web Monitor**.
Le graphe a été produit par la pipeline réelle Graphify (extraction AST +
extraction sémantique des docs), pas par un graphe fabriqué à la main.

## Métadonnées de génération

| Champ | Valeur |
|---|---|
| Date de génération | 2026-07-13 |
| Commit analysé | `c28b261c849a029a66a0413768299feebc0f951f` (`feat: harden and improve operations debug panel`) |
| Version du projet | v1.1.2 |
| Version Graphify | `graphifyy 0.9.14` (CLI `graphify 0.9.14`) |
| Python | 3.13.12 (venv isolé `.venv-graphify/`) |
| Commande exacte | pipeline Skill `/graphify` sur la racine du dépôt, avec `.graphifyignore` (voir `graphify-regeneration.md`) |
| Interpréteur | `$(cat graphify-out/.graphify_python)` |

## Périmètre inclus

92 fichiers analysés (~102 167 mots) :

- `package.json`, `vite.config.js`, `vercel.json`, `index.html`, `control-room.html`
- `api/` (endpoints serverless : login, logout, session, livekit/token)
- `src/` (collabHub, listener, livekit, audio, control-room, diagnostic, state, ui, server, publicPage.js, main.js)
- `max/` (`validate-maxpat.mjs`, `README.md`)
- `scripts/` (check-license, check-tracked-files, check-livekit-secrets, diagnostics/*)
- `test/` (`runTests.mjs` — 491 tests)
- `docs/` (bmad/01–17, release/v1.0.0–v1.1.2, architecture/*)
- `.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`, `LICENSE`

Extraction : 435 nœuds AST (code, 1007 arêtes) + 128 nœuds sémantiques (docs,
137 arêtes, 6 hyperedges) → **563 nœuds, 1051 arêtes, 6 hyperedges** après
déduplication/fusion.

## Exclusions

Fichier natif `.graphifyignore` (syntaxe gitignore) à la racine du dépôt.
Sont **exclues** toutes les dépendances, artefacts de build, sorties Graphify,
et surtout **les fichiers de secrets réels** :

- `node_modules/`, `dist/`, `release-package/`
- `.git/`, `.vercel/`, `.claude/`, `.spike-research/`, `.venv-graphify/`
- `graphify-out/`, `.graphify-input/`
- **`.env`, `.env.local`** (secrets réels — jamais lus, jamais dans le graphe)
- `*.zip`, `*.log`, `.DS_Store`

`.env.example` (valeurs factices uniquement) est ignoré par la détection sensible
de Graphify elle-même. Les **noms** de variables apparaissent comme nœuds-concepts
dans le graphe (autorisé) ; **aucune valeur réelle** n'y figure (vérifié au §7 du
rapport de mission).

## Comptes

| Métrique | Valeur |
|---|---|
| Fichiers analysés | 92 |
| Nœuds | 563 |
| Arêtes | 1051 |
| Hyperedges | 6 |
| Communautés | 53 |

## God nodes (nœuds centraux, les plus connectés)

1. `Collab-Hub Web Monitor (project overview)` — 16 arêtes (README, hub documentaire)
2. `mountPublicPage()` — 15 arêtes (point d'entrée de la page publique)
3. `handler()` — 11 arêtes (handlers serverless `login`/`session`)
4. `KNOWN_HEADERS` — 11 arêtes (les 5 champs `sound_*`, cœur du protocole)
5. `handler()` — 10 arêtes (handler `token.js`)
6. `scripts` — 9 arêtes
7. `connectCollabHubPublisher()` — 9 arêtes (publisher Control Room → Collab-Hub)
8. `mountControlRoom()` — 9 arêtes
9. `STREAM_HEADERS` — 8 arêtes (headers `stream_*`dont `stream_listener_count`)
10. `connectCollabHub()` — 8 arêtes (client socket public)

## Principaux flux (hyperedges)

- **LiveKit program-audio pipeline** — audio_engine → publisher → control_room_page → stream_presence_publisher → listener_engine.
- **Token + grants + session security model** — performer_auth, safe_eq_password, performer_grants, listener_grants, session_cookie.
- **Collab-Hub register/deliver protocol flow** — five_sound_headers, control_event, publish_semantics, observe_guard, sound_heartbeat.
- **Live Audio Edition** (v1.1.0) — token endpoint + Control Room + listener.
- **Max patch → namespace /hub → page publique** — chaîne protocole complète.
- **Robustesse listener v1.1.1 → v1.1.2** — attachExistingTracks, reconcileRemote, iOS startAudio.

## Surprises

- `mountListenerSection()` ↔ `b()` (probe-order.mjs) — le code listener et les
  probes de diagnostic partagent des motifs d'appel socket (INFERRED).
- `createBoundedEventLog()` ↔ `add()` via `runTests.mjs` — le ring buffer et ses
  tests sont fortement couplés (INFERRED).
- `Namespace /hub requirement` (README) est une `rationale_for` à la fois pour
  l'abstraction `ch.client.maxpat` et pour `probe-hub-ns.mjs` — la décision de
  namespace est documentée comme justifiant deux artefacts distincts.
- **Aucun cycle d'import** détecté (graphe propre, pas de dépendance circulaire).

## Limites de l'analyse

- **Patch Max `.maxpat` non parsé structurellement** : l'extension `.maxpat`
  n'est pas reconnue par l'extracteur ; un test de renommage en `.json` a produit
  **0 nœud** (l'extracteur JSON de Graphify ne gère que la config structurée,
  pas les données JSON brutes). Le patch est représenté indirectement via
  `max/validate-maxpat.mjs` (code : les 5 headers, send/receive `ch_pub5`,
  delay, metro, route `connected`) + `max/README.md` + les docs bmad.
- **69 arêtes dangling** : imports de modules externes (`livekit-client`,
  `socket.io-client`, `livekit-server-sdk`) dont la cible n'est pas un nœud
  projet — attendu (dépendances hors dépôt).
- **Coût tokens sémantique** : 0 via le tracker Graphify (pas de clé Gemini) ;
  l'extraction sémantique a été faite par 2 sous-agents hôte (~143 971 tokens
  sous-agent, hors tracker Graphify).
- **CSS non parsé** : `src/styles/main.css` est `unclassified` (pas de
  tree-sitter CSS). Représenté indirectement via les docs du panneau debug.
- Graphique non orienté (défaut) : la direction des arêtes `calls`/`imports` est
  conservée comme attribut mais le parcours shortest-path est non orienté.

## Ouvrir graph.html

```bash
open "graphify-out/graph.html"        # macOS
# ou glisser-déposer le fichier dans un navigateur. Aucun serveur requis.
```

La visualisation agrège les nœuds par communauté ; cliquer sur un nœud montre
ses connexions. 484 ko — raisonnable, commité.

## Régénérer le graphe

Voir `docs/architecture/graphify-regeneration.md` pour la procédure exacte
reproductible (préflight, venv, `.graphifyignore`, pipeline, vérifications).

## Fichiers générés (commités)

- `graphify-out/GRAPH_REPORT.md` — rapport d'audit (god nodes, surprises,
  communautés, hyperedges, cohésion).
- `graphify-out/graph.json` — graphe brut (563 nœuds, 1051 arêtes).
- `graphify-out/graph.html` — visualisation interactive (484 ko).
- `graphify-out/.graphifyignore` — exclusions (à la racine du dépôt).
- `docs/architecture/GRAPHIFY_README.md`, `graphify-analysis.md`,
  `graphify-regeneration.md`.

**Non commités** (gitignore) : `graphify-out/cache/`, `.venv-graphify/`,
fichiers temporaires `.graphify_*`.