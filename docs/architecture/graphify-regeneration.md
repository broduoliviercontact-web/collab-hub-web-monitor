# Graphify — Procédure de régénération

Procédure exacte et reproductible pour régénérer le graphe de connaissances
du dépôt Collab-Hub Web Monitor. La pipeline est celle du Skill `/graphify`
(graphifyy 0.9.14) ; les commandes ci-dessous utilisent l'API Python réelle de
Graphify.

## Prérequis

- Python **≥ 3.10** (testé avec 3.13.12). Le `python3` système macOS peut être
  3.9 (insuffisant) — utiliser un Homebrew/pyenv plus récent.
- `npm ci` à jour, `npm run check` vert (491 tests).
- Arbre git propre et synchronisé.

## 1. Préflight

```bash
cd "/Users/zub/COLLAB-HUB WEB MONITOR"
git status -sb               # propre
git pull --ff-only origin main
npm ci
npm run check                # 491 tests + licence + tracked + secrets + maxpat + build
```

## 2. Venv Python isolé (ne pas toucher au Python système)

```bash
/opt/homebrew/bin/python3.13 -m venv .venv-graphify
source .venv-graphify/bin/activate
python -m pip install --upgrade pip
python -m pip install graphifyy
graphify install --platform claude    # met à jour le Skill ~/.claude/skills/graphify
graphify --version                    # attendu : graphify 0.9.14
```

> Ne PAS ajouter `graphifyy` à `package.json`. Ne PAS modifier les dépendances
> npm du projet.

## 3. Exclusions (`.graphifyignore` à la racine du dépôt)

Le fichier `.graphifyignore` (syntaxe gitignore) exclut dépendances, artefacts
de build, sorties Graphify, et **surtout les secrets réels** (`.env`,
`.env.local`, `.vercel/`). Vérifier son contenu avant de régénérer ; il est
commité et fait partie de la procédure.

**Vérification de sécurité avant analyse** — confirmer qu'aucun secret réel
n'est lu :

```bash
# .env / .env.local ne doivent JAMAIS être dans le corpus détecté
source .venv-graphify/bin/activate
python -c "
from graphify.detect import detect
from pathlib import Path
import json
r = detect(Path('.'))
print('skipped_sensitive:', r.get('skipped_sensitive'))
code = r['files']['code']
print('venv polluted?', any('.venv' in c for c in code))
print('any .env/.env.local?', any(c.endswith('/.env') or '.env.local' in c for cat in r['files'].values() for c in cat))
"
# Attendu : venv polluted? False, any .env/.env.local? False
```

## 4. Pipeline (exécution depuis la racine du dépôt)

```bash
source .venv-graphify/bin/activate
mkdir -p graphify-out
python -c "import sys; open('graphify-out/.graphify_python','w').write(sys.executable)"
echo "$(pwd)" > graphify-out/.graphify_root
```

### 4a. Détection (Step 2)

```bash
python -c "
from graphify.detect import detect
from pathlib import Path
import json
r = detect(Path('.'))
Path('graphify-out/.graphify_detect.json').write_text(json.dumps(r, ensure_ascii=False))
print('files:', r['total_files'], 'words:', r['total_words'])
"
# Attendu : ~92 fichiers, ~102 167 mots
```

### 4b. Extraction AST (Step 3 Part A — code, déterministe, sans LLM)

```bash
python -c "
import json
from graphify.extract import collect_files, extract
from pathlib import Path
code_files = []
detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text())
for f in detect.get('files',{}).get('code',[]):
    code_files.extend(collect_files(Path(f)) if Path(f).is_dir() else [Path(f)])
result = extract(code_files, cache_root=Path('.'))
Path('graphify-out/.graphify_ast.json').write_text(json.dumps(result, indent=2, ensure_ascii=False))
print(f'AST: {len(result[\"nodes\"])} nodes, {len(result[\"edges\"])} edges')
"
# Attendu : ~435 nœuds, ~1007 arêtes
```

### 4c. Extraction sémantique (Step 3 Part B — docs, via sous-agents)

Sans clé `GEMINI_API_KEY`/`GOOGLE_API_KEY`, l'agent hôte fait l'extraction
sémantique en dispatchant des sous-agents `general-purpose` (Skill `/graphify`).
Corpus : 29 docs markdown → 2 chunks. Les sous-agents écrivent
`graphify-out/.graphify_chunk_0N.json` puis on fusionne :

```bash
python -c "
import json, glob
from pathlib import Path
chunks = sorted(glob.glob('graphify-out/.graphify_chunk_*.json'))
all_nodes, all_edges, all_h = [], [], []
for c in chunks:
    d = json.loads(Path(c).read_text())
    all_nodes += d.get('nodes',[]); all_edges += d.get('edges',[]); all_h += d.get('hyperedges',[])
seen=set(); deduped=[n for n in all_nodes if n['id'] not in seen and not seen.add(n['id'])]
Path('graphify-out/.graphify_semantic.json').write_text(json.dumps(
    {'nodes':deduped,'edges':all_edges,'hyperedges':all_h,'input_tokens':0,'output_tokens':0}, indent=2, ensure_ascii=False))
print(f'semantic: {len(deduped)} nodes, {len(all_edges)} edges, {len(all_h)} hyperedges')
"
# Attendu : ~128 nœuds, ~137 arêtes, 6 hyperedges
```

> Alternative simple : invoquer le Skill `/graphify .` depuis Claude Code — il
> orchestre Steps 1–9 automatiquement (détecte, extrait, dispatche les
> sous-agents, fusionne, clusterise, labelise, génère HTML).

### 4d. Fusion AST + sémantique (Step 3 Part C)

```bash
python -c "
import json
from pathlib import Path
ast = json.loads(Path('graphify-out/.graphify_ast.json').read_text())
sem = json.loads(Path('graphify-out/.graphify_semantic.json').read_text())
seen = {n['id'] for n in ast['nodes']}; merged = list(ast['nodes'])
for n in sem['nodes']:
    if n['id'] not in seen: merged.append(n); seen.add(n['id'])
out = {'nodes':merged,'edges':ast['edges']+sem['edges'],'hyperedges':sem.get('hyperedges',[]),'input_tokens':0,'output_tokens':0}
Path('graphify-out/.graphify_extract.json').write_text(json.dumps(out, indent=2, ensure_ascii=False))
print(f'merged: {len(merged)} nodes')
"
# Attendu : 563 nœuds
```

### 4e. Build + cluster + rapport (Step 4)

```bash
python -c "
import json
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json
from pathlib import Path
extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text())
detection  = json.loads(Path('graphify-out/.graphify_detect.json').read_text())
G = build_from_json(extraction, root='.', directed=False)
communities = cluster(G); cohesion = score_all(G, communities)
gods = god_nodes(G); surprises = surprising_connections(G, communities)
labels = {cid: 'Community '+str(cid) for cid in communities}
questions = suggest_questions(G, communities, labels)
to_json(G, communities, 'graphify-out/graph.json')
report = generate(G, communities, cohesion, labels, gods, surprises, detection, {'input':0,'output':0}, '.', suggested_questions=questions)
Path('graphify-out/GRAPH_REPORT.md').write_text(report, encoding='utf-8')
Path('graphify-out/.graphify_analysis.json').write_text(json.dumps({'communities':{str(k):v for k,v in communities.items()},'cohesion':{str(k):v for k,v in cohesion.items()},'gods':gods,'surprises':surprises,'questions':questions}, indent=2, ensure_ascii=False))
print(f'Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities')
"
# Attendu : 563 nœuds, 1051 arêtes, 53 communautés
```

### 4f. Labeliser les communautés (Step 5)

Lire `graphify-out/.graphify_analysis.json`, nommer chaque communauté (2–5 mots)
selon ses nœuds, puis régénérer le rapport avec les labels (voir Step 5 du
Skill). Les labels de la génération actuelle sont dans
`graphify-out/.graphify_labels.json`.

### 4g. HTML (Step 6)

```bash
graphify export html
# Attendu : graphify-out/graph.html (~484 ko)
```

### 4h. Manifeste + cost + cleanup (Step 9)

```bash
python -c "
import json
from pathlib import Path
from graphify.detect import save_manifest
detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text())
save_manifest(detect.get('all_files') or detect['files'], root='.')
"
rm -f graphify-out/.graphify_detect.json graphify-out/.graphify_extract.json graphify-out/.graphify_ast.json graphify-out/.graphify_semantic.json graphify-out/.graphify_analysis.json graphify-out/.graphify_semantic_new.json
find graphify-out -maxdepth 1 -name '.graphify_chunk_*.json' -delete
```

## 5. Vérifications post-génération

```bash
# JSON valide
node -e "JSON.parse(require('fs').readFileSync('graphify-out/graph.json','utf8')); console.log('graph.json OK')"

# Aucune VALEUR de secret (les noms de variables sont autorisés)
grep -RniE 'access_token|LIVEKIT_API_SECRET|PERFORMER_PASSWORD|CONTROL_ROOM_SESSION_SECRET|Bearer |eyJ[a-zA-Z0-9_-]{20,}' graphify-out \
  | grep -viE 'your-api-secret|your-api-key|change-me|replace-with|wss://your-project|factice|factices|placeholder|example\.com|YOUR_|your_project' \
  | grep -viE 'c28b261c849a029a66a0413768299feebc0f951f'
# Attendu : aucun retour (le SHA du commit est normal, filtré ci-dessus).

# Aucun artefact (node_modules/dist/venv/.env) dans le graphe
grep -c "node_modules\|/dist/\|\.venv-graphify\|\.env\.local" graphify-out/graph.json graphify-out/GRAPH_REPORT.md
# Attendu : 0
```

## 6. Requêtes (après génération)

```bash
graphify query "<question naturelle>"
graphify path "NodeLabelA" "NodeLabelB"     # labels exacts du graphe
graphify explain "NodeLabel"
```

Exemples :
```bash
graphify query "Which modules touch secrets, tokens, cookies"
graphify path "audioEngine.js" "livekitPublisher.js"
graphify path "login.js" "token.js"
```

## 7. Stratégie Git

**Commités** : `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`,
`graphify-out/graph.html` (484 ko, raisonnable), `.graphifyignore`,
`docs/architecture/{GRAPHIFY_README,graphify-analysis,graphify-regeneration}.md`.

**Non commités** (`.gitignore`) : `graphify-out/cache/`, `.venv-graphify/`,
fichiers temporaires `.graphify_*` (hors `graph.json`/`graph.html`/`GRAPH_REPORT.md`).

## 8. Régénération incrémentale (après modification de code)

```bash
source .venv-graphify/bin/activate
graphify update .          # re-extrait uniquement les fichiers nouveaux/modifiés
# puis re-clusteriser si besoin :
graphify cluster-only .
```

`graphify update` n'a pas besoin de LLM pour le code (AST). Pour les docs
nouvelles, relancer l'extraction sémantique (Step 4c) sur les fichiers
non-cachés.