# 05 — Persistance locale du dernier contenu (Lot 3A)

Objectif : conserver les dernières valeurs reçues afin qu'un rechargement de
page ne réinitialise pas immédiatement l'affichage. **Persistance locale
uniquement** (localStorage), par navigateur — pas de backend, pas de base de
données, pas d'historique, rien envoyé vers un serveur.

Contraintes respectées : design, cinq headers, protocole Collab-Hub, patch Max
inchangés ; aucun backend ajouté.

## Format de stockage

Clé versionnée : `collabHubSoundState:v1`.

```json
{
  "version": 1,
  "updatedAt": "2026-07-10T14:00:00.000Z",
  "fields": {
    "sound_title": "...",
    "sound_author": "...",
    "sound_subtitle": "...",
    "sound_description": "...",
    "sound_link": "..."
  }
}
```

Le `v1` du suffixe de clé et le `version: 1` du payload doublent le
versionnement : un changement de format cassant bumpera les deux, et les
anciennes données seront ignorées (fallback sur les valeurs par défaut) sans
migration risquée.

## Comportement attendu

### À chaque mise à jour d'un champ connu (`handleControl`)

1. `routeControl` normalise la valeur et confirme le header connu.
2. `state.set(header, value)` met à jour l'état mémoire.
3. `renderField` pousse la valeur au DOM (`textContent`/`setAttribute`, jamais
   `innerHTML`).
4. `saveSoundState(localStorage, state.snapshot())` persiste les 5 headers
   connus + un `updatedAt` (timestamp ISO). Échec d'écriture silencieux
   (l'application ne casse pas).

### Au chargement (`main.js`)

1. `loadSoundState(localStorage)` lit et **valide strictement** la structure.
2. Si restauré : `initial = { ...DEFAULTS, ...restored.fields }` (les défauts
   comblent les champs manquants). Sinon : `DEFAULTS`.
3. `createSoundState(initial)` puis rendu de chaque header connu via
   `renderField` — `sound_link` **repassé par la validation URL existante**
   (`isSafeHttpUrl` : http/https uniquement ; `javascript:`/`data:`/vide →
   lien masqué).
4. La page affiche immédiatement le dernier contenu, puis les publications en
   temps réel le mettent à jour.
5. Le `updatedAt` restauré sert aussi à dater le contenu côté fraîcheur (Lot 3B)
   via `freshness.restoreContent(ms)` : un contenu restauré ancien (> 5 min)
   est marqué `data-content-fresh="false"`. **`maxLastSeenAt` n'est pas
   restauré** (un heartbeat ancien serait trompeur) -> Max reste « silencieux »
   jusqu'au prochain heartbeat reçu. Voir `docs/bmad/06-heartbeat-and-freshness.md`.

## Logique de validation (`loadSoundState`)

Strict, échec = `null` (l'appelant garde les défauts). Niveau par niveau :

| Contrôle | Rejet si |
|---|---|
| storage indispo / `getItem` lève | `null` |
| clé absente | `null` |
| JSON invalide (parse lève) | `null` |
| payload non objet | `null` |
| `version !== 1` (version inconnue) | `null` |
| `updatedAt` non string / vide | `null` |
| `fields` non objet | `null` |
| champ hors `KNOWN_HEADERS` | ignoré (header inconnu) |
| valeur non string | ignorée (type non string) |
| valeur > 4096 caractères | ignorée (champ trop long) |

Seuls les cinq headers connus et de type string (≤ 4096 chars) sont restaurés.
Aucune donnée HTML n'est stockée ou réinjectée comme HTML — le rendu reste en
`textContent`/`setAttribute`. `sound_link` n'est pas filtré au load : il repasse
par `isSafeHttpUrl` au rendu, donc un lien invalide persisté est **masqué** à
l'affichage sans casser la page.

## Sécurité

- Aucune donnée HTML, aucun `innerHTML`.
- `sound_link` revalidé au rendu (http/https).
- Champs limités à 4096 caractères.
- Types non string ignorés.
- JSON corrompu → pas de crash (fallback défauts).
- Rien n'est envoyé vers un serveur.

## Diagnostic (`?debug=1` uniquement)

Nouvelle section « État local (persistance) » dans le panneau :

- **Dernière restauration locale** : timestamp du dernier état restauré au
  chargement (`diag-local-restore`).
- **Dernier état sauvegardé** : timestamp de la dernière persistance
  (`diag-local-saved`), rafraîchi à chaque contrôle reçu.
- **Effacer l'état local** (bouton `diag-clear-local`) : appelle
  `clearSoundState(localStorage)` puis affiche une confirmation
  (« État local effacé. »). Au prochain contrôle, l'état est de nouveau
  sauvegardé.

Ces éléments n'apparaissent pas sur la page publique (section `#diagnostic`
masquée sans `?debug=1`, chunk dynamique).

## Tests (Lot 3A)

`npm run check` = `npm test` + `validate-maxpat` + `vite build`.

10 tests ajoutés (`test/runTests.mjs`) — **35 tests au total** (25 + 10) :

1. État valide restauré depuis localStorage.
2. JSON corrompu ignoré (`null`).
3. Version inconnue ignorée (`null`).
4. Header inconnu ignoré, connus conservés.
5. Type non string ignoré (nombre/objet/null).
6. `sound_link` invalide restauré puis masqué au rendu (`linkWrap.hidden`).
7. Sauvegarde après réception d'un contrôle (round-trip `routeControl` →
   `state.snapshot` → `saveSoundState` → `loadSoundState`).
8. Timestamp sauvegardé (`updatedAt` + `version` dans le payload brut).
9. Effacement du stockage (`clearSoundState` supprime la clé).
10. Absence de localStorage ne casse pas l'application (`null`/`undefined`/objet
    incomplet → pas de throw).

Le storage est injectable (`fakeStorage` basé sur `Map`) ; les fonctions sont
testables en Node sans DOM ni `localStorage` global.

## Procédure de validation manuelle

1. `npm run dev`, page « Connecté ».
2. Cliquer **ENVOYER LES 5 CHAMPS** dans Max → les champs se remplissent.
3. **Recharger la page** → le dernier contenu est **restauré** (les champs
   restent remplis), puis mis à jour par les nouvelles publications.
4. `?debug=1` → section « État local » : « Dernière restauration locale » et
   « Dernier état sauvegardé » affichent des timestamps ISO.
5. Cliquer **Effacer l'état local** → confirmation ; recharger → repart des
   valeurs par défaut (jusqu'à la prochaine publication).
6. Corrompre la clé (DevTools → Application → localStorage →
   `collabHubSoundState:v1` = `"{bad"`) → recharger → pas de crash, valeurs
   par défaut.
7. Mettre un `sound_link` `javascript:…` (via une édition manuelle de la clé)
   → recharger → lien masqué (validation URL au rendu).

## Critères de sortie Lot 3A

- ✅ Dernier contenu restauré au rechargement (5 headers connus, strict).
- ✅ Données corrompues/incompatibles ignorées → valeurs par défaut, pas de
  crash.
- ✅ `sound_link` revalidé au rendu ; aucune donnée HTML / `innerHTML`.
- ✅ Persistance locale uniquement ; aucun backend, aucune requête serveur.
- ✅ Diagnostic `?debug=1` : restauration, dernier save, effacement + confirm.
- ✅ 35 tests unitaires passent ; `validate-maxpat` OK ; `vite build` OK.
- ✅ `npm run check` vert ; commit `feat: persist latest Collab-Hub sound state`
  poussé sur `main` ; Vercel redéploie automatiquement.

## Limites restantes

- Persistance **locale par navigateur** : pas de partage multi-postes, pas
  d'historique (on ne garde que le dernier état).
- Pas de migration de version : un bump de `STORAGE_VERSION` ignore
  silencieusement les anciennes données (fallback défauts). Acceptable pour un
  MVP à un seul format.
- `localStorage` peut être désactivé/vidé par l'utilisateur ou en mode privé →
  fallback transparent sur les défauts (aucun crash).
- Le diagnostic `?debug=1` reste accessible sans login (voir 04).