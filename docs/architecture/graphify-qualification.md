# Graphify — Qualification des faux positifs et comparaison avant/après

Issue #12 (parent #6). Tâche de **documentation / qualification** : aucun
changement fonctionnel de production, aucun changement visuel, aucun
changement de protocole Collab-Hub, aucun changement de grants LiveKit, aucun
changement de sécurité/session. Le présent document qualifie les arêtes
**inférées** du graphe de connaissances `graphify-out/`, distingue les vraies
dépendances runtime des relations non-runtime, documente les faux positifs
connus, liste les « faux god nodes » à ne pas refactorer automatiquement,
compare les métriques avant/après les refactors d'architecture (issues #7, #9,
#10, #8), et propose une procédure de régénération et de comparaison
reproductible.

Le graphe a été **régénéré après les refactors** (`graphify update .` au commit
`ea5cbb0`, section 4 ci-dessous) — c'est l'état qualifié dans ce rapport.

---

## 1. Constat de départ (rappel de l'issue #12)

Le rapport Graphify contient des relations **inférées** qui ne sont probablement
PAS des dépendances runtime réelles et qui peuvent fausser les priorités de
refactor :

- `mountListenerSection() --indirect_call--> b()` dans `probe-order.mjs` ;
- `createBoundedEventLog() --indirect_call--> add()` via un fichier de test ;
- relations `docs/probes` fondées sur la proximité sémantique ;
- nœuds `handler()` génériques confondus visuellement (homonymes) ;
- `.maxpat` non parsé structurellement ;
- arêtes « dangling » vers des dépendances externes attendues.

Ce ne sont pas des bugs applicatifs, mais ils peuvent orienter les refactors
vers de mauvaises cibles. L'objet de ce rapport est de qualifier chacune de ces
arêtes pour que la cartographie serve, et non nuise, à la priorisation.

---

## 2. Métriques avant / après (comparables)

Deux états de référence :

| Métrique | Baseline `085fe3c`<br>(génération **complète** AST + LLM sémantique, pré-refactors) | Courant `ea5cbb0`<br>(`graphify update` **AST seul**, post-refactors #7/#9/#10/#8) |
|---|---:|---:|
| Nœuds | 563 | 1137 |
| Arêtes totales | 1051 | 1685 |
| Arêtes EXTRACTED (AST) | 962 | 1667 |
| Arêtes INFERRED | 89 (8,5 %) | 18 (1,1 %) |
| └─ `indirect_call` (AST) | 14 | 15 |
| └─ `calls` (LLM sémantique, docs) | 6 | 0 |
| └─ `references` (LLM sémantique, docs) | 36 | 1 (AST cross-ref `ci.yml`) |
| └─ `semantically_similar_to` (LLM) | 11 | 0 |
| └─ `rationale_for` (LLM) | 11 | 0 |
| └─ `implements` (LLM / AST) | 7 | 2 (AST `index.html`) |
| └─ `conceptually_related_to` (LLM) | 3 | 0 |
| └─ `shares_data_with` (LLM) | 1 | 0 |
| Arêtes orphelines (dangling) | 69 (vers dépendances externes) | **0** |
| Communautés | 53 | 169 |

### 2.1 Lecture honnête de la comparaison

- **Croissance réelle (nœuds 563 → 1137, arêtes 1051 → 1685)** : due aux
  refactors d'architecture qui ont **éclaté les monolites en modules dédiés**
  (issue #8 : `controlRoomRuntime`, `collabHubPresenceRuntime`, `meterLoop`,
  `controlRoomDiagnostics` ; issue #10 : `src/server/http.js` mutualisé ;
  issue #9 : frontière unifiée) **et** aux tests de caractérisation ajoutés
  (`mount.test.mjs`, `http.test.mjs`, etc.). C'est le reflet attendu d'un
  découpage sain : plus de nœuds, plus d'arêtes EXTRACTED (dépendances réelles
  explicites), moins de nœuds « god » concentrant des appels indirects.

- **Chute INFERRED 89 → 18 — ATTENTION à la comparabilité.** La baseline
  `085fe3c` est une génération **complète** (extraction AST + extraction
  sémantique LLM des docs, cf. `graphify-regeneration.md` étape 4c). L'état
  courant `ea5cbb0` est produit par `graphify update .` qui **ne ré-extrait que
  le code (AST) et ne relance pas le passage LLM sémantique sur les docs**
  (`graphify-regeneration.md` §8 : « `graphify update` n'a pas besoin de LLM
  pour le code (AST). Pour les docs nouvelles, relancer l'extraction
  sémantique »). Les 75 arêtes LLM-sémantiques de la baseline
  (`references`, `semantically_similar_to`, `rationale_for`, etc.) sont donc
  **absentes de l'état courant**, non pas « éliminées par les refactors ».

- **Sous-ensemble comparable = `indirect_call` (AST, des deux côtés) : 14 → 15.**
  C'est la seule comparaison apple-à-apple et c'est celle utilisée pour la
  qualification arête par arête (section 3).

- **Arêtes dangling 69 → 0.** La baseline comportait 69 arêtes vers des nœuds
  « externes » sans `source_file` (dépendances npm / builtins node). L'état
  courant n'en a **plus aucune** : `graphify update` a ré-attribué chaque nœud à
  un `source_file` réel du dépôt. Le « dangling externe » de la baseline était un
  artefact de la génération, non une dépendance manquante.

- **Communautés 53 → 169** : le clustering est plus fin (le découpage en
  modules produit des communautés plus petites et plus cohérentes). Le rapport
  HTML n'en affiche qu'un sous-ensemble ; ce n'est pas une perte.

### 2.2 Recommandation de comparabilité (à appliquer à la prochaine cartographie)

Pour des mesures **avant/après strictement comparables**, régénérer **de la même
façon** aux deux commits :

- Soit **complet** (AST + LLM sémantique) au commit A et au commit B, via le
  Skill `/graphify .` (ou la procédure `graphify-regeneration.md` étape 4c) ;
- Soit **AST seul** (`graphify update .`) aux deux commits.

Mélanger une baseline complète avec un `update` AST seul — comme la comparaison
89 → 18 ci-dessus l'illustre — surestime la réduction réelle des faux positifs.
La procédure de comparaison reproductible est en section 5.

---

## 3. Qualification des arêtes inférées (catalogue)

### 3.1 Sous-ensemble comparable : `indirect_call` (14 baseline → 15 courant)

Chaque arête est classée **CONFIRMÉE** (dépendance runtime réelle), **FAUX
POSITIF** (relation inférée sans dépendance runtime — homonyme de symbole court
ou sur-résolution cross-fichier), ou **PLAUSIBLE non-runtime** (lien de
documentation / config, pas une dépendance runtime).

| # | Source → Cible | Baseline `085fe3c` | Courant `ea5cbb0` | Verdict |
|---|---|---|---|---|
| 1 | `check-tracked-files → isForbidden` | ✔ | ✔ | **CONFIRMÉ** (même fichier, appel réel) |
| 2 | `listAudioInputDevices → normalizeDevice` | ✔ | ✔ | **CONFIRMÉ** (même fichier, appel réel) |
| 3 | `createControlRoomGate → sessionClient.checkSession` | ✔ | ✔ | **CONFIRMÉ** (gate appelle sessionClient) |
| 4 | `createControlRoomGate → sessionClient.login` | ✔ | ✔ | **CONFIRMÉ** |
| 5 | `createControlRoomGate → sessionClient.logout` | ✔ | ✔ | **CONFIRMÉ** |
| 6 | `mountControlRoomGate → sessionClient.checkSession` | ✔ | ✔ | **CONFIRMÉ** |
| 7 | `mountControlRoomGate → sessionClient.login` | ✔ | ✔ | **CONFIRMÉ** |
| 8 | `mountControlRoomGate → sessionClient.logout` | ✔ | ✔ | **CONFIRMÉ** |
| 9 | `createAudioGraph → FakeAudioContext.close` | `→ test/runTests` | `→ test/audio/audio_test` | **FAUX POSITIF** (homonyme : `close` est une méthode du fake AudioContext de test ; `createAudioGraph` n'appelle pas le test. Cible déplacée par le split de `runTests.mjs`.) |
| 10 | `createAudioGraph → FakeAudioContext.resume` | `→ test/runTests` | `→ test/audio/audio_test` | **FAUX POSITIF** (même cause) |
| 11 | `createBoundedEventLog → add` | `→ test/runTests add` | `→ test/listener/listener_test add` | **FAUX POSITIF (CITÉ #12)** — `add` est une méthode d'un fake/log de test ; pas d'appel runtime. Cible déplacée par le split de `runTests.mjs`. **Persiste après refactors.** |
| 12 | `mountListenerSection → probe_order.b` | ✔ | ✔ | **FAUX POSITIF (CITÉ #12)** — `b` est un symbole court de `scripts/diagnostics/probe-order.mjs` ; `mountListenerSection` ne l'appelle pas. **Persiste après refactors.** |
| 13 | `mountListenerSection → requestLiveKitToken` | ✔ | ✔ | **FAUX POSITIF** (sur-résolution : le listener passe par `createLiveKitListener` qui enveloppe le token, appel indirect non direct) |
| 14 | `controlRoomPage → requestLiveKitToken` | ✔ (`controlRoomPage.js`) | **RÉSOLU** | **RÉSOLU PAR #8** : `mountControlRoom` ne référence plus `requestLiveKitToken` directement ; la dépendance est médiée par `controlRoomRuntime.defaultPublisherFactory`. L'arête inférée a disparu au profit d'une arête correcte (ligne 15). |
| 15 | `defaultPublisherFactory → requestLiveKitToken` | — (nœud inexistant) | ✔ (`controlRoomRuntime.js`) | **CONFIRMÉ** (NOUVEAU, post-#8) : la factory du publisher enveloppe bien `requestLiveKitToken` via `tokenClient`. Arête réelle, attribuée au **bon** module. Partie du graphe audio figé (#8). |
| 16 | `initDiagnostic → http_test.json` | — | ✔ (`diagnosticPanel.js`) | **FAUX POSITIF (NOUVEAU)** apparu avec l'issue #10 : `json` est l'ancien helper `json()` testé dans `http.test.mjs` ; `diagnosticPanel` ne l'appelle pas. Homonyme sur le nom générique `json`. |

**Bilan `indirect_call` (comparable) :**

- **CONFIRMÉES (runtime réel)** : 10 (lignes 1–8, 15) — dont 1 nouvelle et
  correctement attribuée post-#8.
- **FAUX POSITIFS** : 5 (lignes 9, 10, 11, 12, 13) — dont les **2 cités par
  l'issue #12** (lignes 11, 12) **persistent** ; 1 nouveau lié à #10 (ligne 16).
- **RÉSOLUES par refactor** : 1 (ligne 14) — la sur-résolution
  `controlRoomPage → requestLiveKitToken` a été remplacée par l'arête correcte
  `defaultPublisherFactory → requestLiveKitToken` (ligne 15). C'est le gain
  concret de l'architecture en racine de composition : la dépendance réelle
  est désormais attribuée au module qui la porte, non au point de montage.

> **Conclusion importante** : les faux positifs cités (`mountListenerSection→b`,
> `createBoundedEventLog→add`) ne sont **pas** éliminés par les refactors. Ils
> sont **structurels** à l'inférence `indirect_call` de Graphify, qui apparie
> des **noms de symboles courts** (`b`, `add`, `close`, `resume`, `json`) au
> travers des frontières `src ↔ test ↔ scripts`. Les refactors les ont only
> **déplacés** (cibles renommées par le split de `runTests.mjs`). La réduction
> durable de ce bruit passe par le préprocesseur / la configuration de Graphify
> (section 6), non par le code applicatif.

### 3.2 Arêtes LLM-sémantiques (baseline 085fe3c, 75 arêtes — non-runtime)

Ces arêtes proviennent du passage **LLM sémantique** sur les docs (étape 4c de
`graphify-regeneration.md`). Elles ne sont **pas** des dépendances runtime :
elles relient des *concepts documentés* (nœuds `docs_bmad_*`, `readme_*`,
`docs_release_*`). Elles sont absentes de l'état courant car `graphify update`
(AST seul) ne les regénère pas.

| Relation | Baseline | Nature | Verdict pour la priorisation de refactor |
|---|---:|---|---|
| `references` | 36 | renvois entre concepts doc→doc | **PLAUSIBLE non-runtime** — à exclure du graphe de priorisation runtime |
| `semantically_similar_to` | 11 | proximité sémantique (le « docs/probes » cité) | **FAUX POSITIF pour le refactor** — aucune relation structurelle, juste proximité de vocabulaire |
| `rationale_for` | 11 | « justifie » entre concepts doc | **PLAUSIBLE non-runtime** — utile pour la doc, pas pour le runtime |
| `implements` | 7 | concept doc « implémente » un autre | **PLAUSIBLE non-runtime** |
| `conceptually_related_to` | 3 | lien conceptuel doc | **FAUX POSITIF pour le refactor** |
| `shares_data_with` | 1 | partage de données (concept) | **PLAUSIBLE non-runtime** |
| `calls` (docs→docs) | 6 | concept doc « appelle » concept doc | **PLAUSIBLE non-runtime** — ne pas confondre avec les `calls` AST |

**Règle de filtrage pour la priorisation runtime** : conserver uniquement
`confidence=="EXTRACTED"` **et** les `INFERRED` de relation `indirect_call` /
`calls` dont le `source_file` est sous `src/` ou `api/` ou `scripts/` (pas
`test/`, pas `docs/`). Voir section 5 (commande `jq` prête à l'emploi).

### 3.3 Arêtes cross-ref AST courantes (3, non-runtime mais correctes)

| Source → Cible | Verdict |
|---|---|
| `index.html → readme.publicPage` (`implements`) | **PLAUSIBLE non-runtime** — `index.html` est l'entry du listener, README le documente. |
| `index.html → readme.diagnosticPanel` (`implements`) | **PLAUSIBLE non-runtime** |
| `github_workflows_ci.buildVerify → index.html` (`references`) | **PLAUSIBLE non-runtime** — la CI référence le chemin `index.html` pour le build. |

---

## 4. Régénération effectuée pour ce rapport

```bash
cd "/Users/zub/COLLAB-HUB WEB MONITOR"
git checkout main && git pull --ff-only origin main   # HEAD = ea5cbb0
source .venv-graphify/bin/activate
graphify update .          # AST seul, ré-extrait le code modifié (pas de LLM)
# → 1137 nœuds, 1685 arêtes, 169 communautés, 18 INFERRED, built_at_commit ea5cbb0
```

`graphify update .` est l'étape de régénération post-refactor sanctionnée par
`graphify-regeneration.md` §8. Le graphe courant reflète bien le code post-#8
(vérifié : nœuds `control_room_controlroomruntime`,
`control_room_collabhubpresenceruntime`, `control_room_meterloop`,
`control_room_controlroomdiagnostics` présents).

> **Note** : pour obtenir une cartographie **complète** (avec arêtes
> LLM-sémantiques des docs) comparable à la baseline `085fe3c`, il faut relancer
> le Skill `/graphify .` (ou l'étape 4c de `graphify-regeneration.md`), qui
> dispatche les sous-agents d'extraction sémantique. Cela n'a pas été fait ici
> car (a) l'issue #12 est une tâche de qualification sans changement de code,
> et (b) `graphify update` est la procédure officielle post-refactor. C'est
> néanmoins une **recommandation** pour la prochaine cartographie complète
> (section 6).

---

## 5. Procédure de régénération et de comparaison (mise à jour)

La procédure de régénération de base est dans
`docs/architecture/graphify-regeneration.md`. On ajoute ici la **comparaison de
graphes entre deux commits** (demandée par l'issue #12).

### 5.1 Régénérer à un commit donné

```bash
cd "/Users/zub/COLLAB-HUB WEB MONITOR"
git checkout <commit>
source .venv-graphify/bin/activate
# Option A (complet, avec LLM sémantique docs) — comparable à 085fe3c :
#   /graphify .            # depuis Claude Code (Skill), ou étape 4c du guide
# Option B (AST seul, rapide) — comparable entre états code-only :
graphify update .
# sauvegarder le graphe produit :
cp graphify-out/graph.json /tmp/graph_<commit>.json
```

### 5.2 Comparer deux graphes (jq)

```bash
# Métriques globales de chaque graphe
for f in /tmp/graph_A.json /tmp/graph_B.json; do
  jq -r '"\(.built_at_commit|.[0:7]) nodes=\(.nodes|length) links=\(.links|length) inferred=\([.links[]|select(.confidence=="INFERRED")]|length)"' "$f"
done

# Arêtes inférées runtime-pertinentes seulement (filtre anti-bruit de la section 3.2) :
jq -r '
  .links[]
  | select(.confidence=="INFERRED")
  | select(.relation=="indirect_call" or .relation=="calls")
  | select((.source_file//"")|test("^(src/|api/|scripts/)"))
  | "\(.source) --\(.relation)--> \(.target)  [\(.source_file)]"
' /tmp/graph_<commit>.json | sort

# Diff des arêtes inférées entre A et B (quelles apparaissent / disparaissent) :
jq -r '.links[]|select(.confidence=="INFERRED")|"\(.source) --\(.relation)--> \(.target)"' /tmp/graph_A.json | sort -u > /tmp/infA.txt
jq -r '.links[]|select(.confidence=="INFERRED")|"\(.source) --\(.relation)--> \(.target)"' /tmp/graph_B.json | sort -u > /tmp/infB.txt
echo "=== présentes dans A, absentes dans B (résolues) ==="; comm -23 /tmp/infA.txt /tmp/infB.txt
echo "=== absentes dans A, présentes dans B (nouvelles) ==="; comm -13 /tmp/infA.txt /tmp/infB.txt
echo "=== stables ==="; comm -12 /tmp/infA.txt /tmp/infB.txt | wc -l
```

### 5.3 Règle de filtrage anti-bruit (à appliquer avant toute priorisation de refactor)

Avant de déduire des cibles de refactor du graphe, filtrer :

```bash
# Dépendances runtime réelles (EXTRACTED) + inférences indirect_call code-only
jq -r '
  .links[]
  | select(
      (.confidence=="EXTRACTED")
      or (.confidence=="INFERRED" and .relation=="indirect_call"
          and ((.source_file//"")|test("^(src/|api/|scripts/)")))
    )
  | "\(.source_file) | \(.source) --\(.relation)--> \(.target)"
' graphify-out/graph.json
```

Ce filtre exclut : tout `references`/`semantically_similar_to`/`rationale_for`/
`implements`/`conceptually_related_to`/`shares_data_with` (LLM sémantique,
non-runtime) et toute inférence dont la source est un test (`test/`) ou une doc
(`docs/`).

---

## 6. Faux god nodes à NE PAS refactorer automatiquement

Ces nœuds apparaissent centraux (haut degré) mais **sont attendus** ; les
réfactorer « parce qu'ils sont god nodes » casserait une structure saine.

| Nœud | Raison | Action |
|---|---|---|
| `Collab-Hub Web Monitor` (hub documentaire) | Nœud de vue d'ensemble du projet — **hub documentaire attendu**, pas un module runtime | **Ne PAS refactorer** |
| `KNOWN_HEADERS` / `STREAM_HEADERS` | Constantes centrales partagées — centralisation **souhaitable** (contrat de headers Collab-Hub) | **Ne PAS refactorer** ; c'est un point de cohérence, pas un couplage accidentel |
| `scripts` (dans `package.json`) | Agrégateur de scripts npm — **attendu** comme nœud unique | **Ne PAS refactorer** |
| `handler()` (fonctions homonymes) | Plusieurs fonctions `handler()` dans différents modules serverless (login/logout/session/…) — **nœuds distincts** fondus visuellement sous le même label court | **Ne PAS refactorer** : les distinguer par **chemin complet** dans les vues (cf. section 7), pas par nom court |

---

## 7. Recommandations pour réduire le bruit de la prochaine cartographie

1. **Distinguer les nœuds par chemin complet dans les vues.** Les labels
   courts (`handler`, `on`, `add`, `b`, `json`) créent des collisions visuelles
   et alimentent les `indirect_call` faux positifs. Afficher
   `api/control-room/login.js::handler` plutôt que `handler()`. Côté requêtes,
   utiliser les ids complets (`control_room_login_handler`) et non les labels.

2. **Exclure / déprioriser les relations test → fonction homonyme.** Filtrer
   les `indirect_call` dont la **cible** est sous `test/` (cf. filtre §5.3) :
   ce sont des faux positifs structurels (un symbole court de test ne peut pas
   être une dépendance runtime d'un module `src/`). Conserver l'info dans une
   couche « tests » séparée, pas dans le graphe de priorisation runtime.

3. **Re-run LLM sémantique pour les métriques doc comparables.** La prochaine
   cartographie complète doit utiliser `/graphify .` (complet) aux deux bornes
   de la comparaison, sinon le compteur INFERRED n'est pas comparable (cf. §2.2).

4. **Étudier un préprocesseur `.maxpat`.** Le graphe actuel ne contient
   **aucun nœud** issu de `.maxpat` (0 nœuds `*.maxpat` ; les 42 nœuds du
   répertoire `max/` proviennent de `max/README.md`, pas du patch binaire). Un
   préprocesseur `.maxpat → JSON simplifié` (extraction des `boxes`/`patchers`
   et de leurs connexions `patchline`) permettrait de représenter le patch Max
   comme un graphe réel et de relier ses objets Collab-Hub aux modules web.
   **Étude recommandée** (pas d'implémentation dans cette issue) :
   ```bash
   # Aperçu de la structure d'un .maxpat (JSON) :
   jq -r '.patcher.boxes[]?.box?.name // .patcher.boxes[]?.box?.maxclass' max/CollabHub_Web_Text_Sender.maxpat | sort | uniq -c
   ```
   Le format est du JSON ; un préprocesseur léger (extraire
   `maxclass`/`text`/`patchline.destination`/`patchline.source`) produirait un
   graphe structuré sans LLM.

5. **Documenter les arêtes externes attendues.** L'état courant n'a plus
   d'arêtes orphelines (dangling 69 → 0). Maintenir cette propriété : si une
   future génération réintroduit des nœuds sans `source_file` (dépendances
   externes `socket.io-client`, `livekit-client`, `livekit-server-sdk`,
   builtins node), les **documenter explicitement** comme dépendances externes
   attendues dans le rapport, plutôt que de les laisser apparaître comme des
   nœuds mystères.

6. **Geler le contrat audio dans le graphe.** L'arête
   `defaultPublisherFactory → requestLiveKitToken` (CONFIRMÉE, post-#8) est la
   trace dans le graphe du contrat audio figé (options `createLiveKitPublisher`
   verbatim, piste `program-audio`). Toute future évolution du graphe audio
   doit passer par une issue dédiée — ne pas retoucher via une cartographie.

---

## 8. Critères d'acceptation de l'issue #12 — statut

| Critère | Statut |
|---|---|
| Rapport d'examen des arêtes inférées | ✔ §3 (catalogue ligne par ligne) |
| Faux positifs documentés | ✔ §3.1 (5 FP dont 2 cités persistants + 1 nouveau #10) et §3.2 (LLM sémantique non-runtime) |
| Procédure de régénération mise à jour | ✔ §5 (comparaison de graphes entre deux commits + filtre anti-bruit) |
| Mesures avant/après comparables | ✔ §2 (table + sous-ensemble comparable `indirect_call` 14→15 + caveat de comparabilité §2.2) |
| Aucun changement fonctionnel de production | ✔ seul `graphify-out/` (régénéré) et le présent document sont modifiés ; aucun `src/` touché |
| Graphify régénéré après les refactors d'architecture | ✔ `graphify update .` à `ea5cbb0` (§4) |

---

## Annexe A — Les 18 arêtes INFERRED courantes (`ea5cbb0`)

```
implements    index_html                      -> readme_publicpage                 [index.html]
implements    index_html_diagnosticsection     -> readme_diagnosticpanel            [index.html]
references    github_workflows_ci_buildverify  -> index_html                       [.github/workflows/ci.yml]
indirect_call scripts_check_tracked_files      -> scripts_check_tracked_files_isforbidden [scripts/check-tracked-files.mjs]
indirect_call src_audio_audiodevices_listaudioinputdevices -> src_audio_audiodevices_normalizedevice [src/audio/audioDevices.js]
indirect_call src_audio_audiograph_createaudiograph -> test_audio_audio_test_fakeaudiocontext_close  [src/audio/audioGraph.js]   ← FP
indirect_call src_audio_audiograph_createaudiograph -> test_audio_audio_test_fakeaudiocontext_resume [src/audio/audioGraph.js]   ← FP
indirect_call src_control_room_controlroomgate_createcontrolroomgate -> src_control_room_sessionclient_checksession [src/control-room/controlRoomGate.js]
indirect_call src_control_room_controlroomgate_createcontrolroomgate -> src_control_room_sessionclient_login  [src/control-room/controlRoomGate.js]
indirect_call src_control_room_controlroomgate_createcontrolroomgate -> src_control_room_sessionclient_logout [src/control-room/controlRoomGate.js]
indirect_call src_control_room_controlroomgatepage_mountcontrolroomgate -> src_control_room_sessionclient_checksession [src/control-room/controlRoomGatePage.js]
indirect_call src_control_room_controlroomgatepage_mountcontrolroomgate -> src_control_room_sessionclient_login  [src/control-room/controlRoomGatePage.js]
indirect_call src_control_room_controlroomgatepage_mountcontrolroomgate -> src_control_room_sessionclient_logout [src/control-room/controlRoomGatePage.js]
indirect_call src_control_room_controlroomruntime_defaultpublisherfactory -> src_livekit_tokenclient_requestlivekittoken [src/control-room/controlRoomRuntime.js]  ← CONFIRMÉ (audio figé)
indirect_call src_diagnostic_boundedeventlog_createboundedeventlog -> test_listener_listener_test_add  [src/diagnostic/boundedEventLog.js]  ← FP (CITÉ #12)
indirect_call src_diagnostic_diagnosticpanel_initdiagnostic -> test_server_http_test_json [src/diagnostic/diagnosticPanel.js]  ← FP (NOUVEAU #10)
indirect_call src_listener_listenersection_mountlistenersection -> scripts_diagnostics_probe_order_b [src/listener/listenerSection.js]  ← FP (CITÉ #12)
indirect_call src_listener_listenersection_mountlistenersection -> src_livekit_tokenclient_requestlivekittoken [src/listener/listenerSection.js]  ← FP (sur-résolution)
```

## Annexe B — Les 14 arêtes `indirect_call` baseline (`085fe3c`)

```
indirect_call scripts_check_tracked_files      -> scripts_check_tracked_files_isforbidden
indirect_call src_audio_audiodevices_listaudioinputdevices -> src_audio_audiodevices_normalizedevice
indirect_call src_audio_audiograph_createaudiograph -> test_runtests_fakeaudiocontext_close      ← FP (cible depuis split dans audio_test)
indirect_call src_audio_audiograph_createaudiograph -> test_runtests_fakeaudiocontext_resume     ← FP (cible depuis split dans audio_test)
indirect_call src_control_room_controlroomgate_createcontrolroomgate -> src_control_room_sessionclient_checksession
indirect_call src_control_room_controlroomgate_createcontrolroomgate -> src_control_room_sessionclient_login
indirect_call src_control_room_controlroomgate_createcontrolroomgate -> src_control_room_sessionclient_logout
indirect_call src_control_room_controlroomgatepage_mountcontrolroomgate -> src_control_room_sessionclient_checksession
indirect_call src_control_room_controlroomgatepage_mountcontrolroomgate -> src_control_room_sessionclient_login
indirect_call src_control_room_controlroomgatepage_mountcontrolroomgate -> src_control_room_sessionclient_logout
indirect_call src_control_room_controlroompage_mountcontrolroom -> src_livekit_tokenclient_requestlivekittoken  ← RÉSOLU par #8 (→ defaultPublisherFactory)
indirect_call src_diagnostic_boundedeventlog_createboundedeventlog -> test_runtests_add  ← FP (CITÉ #12, cible depuis listener_test)
indirect_call src_listener_listenersection_mountlistenersection -> scripts_diagnostics_probe_order_b  ← FP (CITÉ #12)
indirect_call src_listener_listenersection_mountlistenersection -> src_livekit_tokenclient_requestlivekittoken  ← FP (sur-résolution)
```