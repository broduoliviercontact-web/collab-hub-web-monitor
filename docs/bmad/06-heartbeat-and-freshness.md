# 06 — Heartbeat Max & fraîcheur du contenu (Lot 3B)

Objectif : distinguer clairement trois choses qui n'en faisaient qu'une avant —

1. la **connexion au serveur** Collab-Hub (`serverConnected`) ;
2. l'**activité réelle du patch Max** (`maxLastSeenAt`, via un heartbeat
   périodique) ;
3. l'**ancienneté du contenu** affiché (`contentLastUpdatedAt`).

Contraintes respectées : pas de redesign, les cinq headers existants et le
protocole de publication inchangés, aucun backend, aucune base de données.

## Nouveau header technique : `sound_heartbeat`

- Jamais affiché comme contenu public.
- Jamais persisté dans `localStorage`.
- Ne déclenche pas l'animation des blocs.
- Le patch Max le publie périodiquement : `publish all sound_heartbeat 1`.
- Côté web, il est **observé** au démarrage (ajouté à `OBSERVABLE_HEADERS` =
  5 contenus + heartbeat) mais **routé à part** : il met à jour `maxLastSeenAt`
  sans toucher à l'état du morceau ni à la persistance.

## Architecture de l'état technique

`src/state/freshness.js` (pur, horloge injectable, testable en Node) :

```
createFreshnessState({ now })
  ├─ serverConnected       (set via setServerStatus)
  ├─ maxLastSeenAt          (onHeartbeat)        — jamais restauré
  └─ contentLastUpdatedAt   (onContentUpdate / restoreContent)
```

Méthodes : `setServerStatus`, `isServerConnected`, `onHeartbeat`,
`onContentUpdate`, `restoreContent(ms)`, `isMaxActive`, `isContentFresh`,
`maxAgeMs`, `contentAgeMs`, accesseurs. La fonction `computePublicStatus(
connStatus, maxActive)` calcule le libellé public en **priorisant le serveur**.

`src/collabHub/messageRouter.js` exporte désormais `KNOWN_HEADERS` (5 contenus),
`HEARTBEAT_HEADER = 'sound_heartbeat'` et `OBSERVABLE_HEADERS` (6).
`src/collabHub/observeGuard.js` observe les 6 au (re)connect.

## Nouvelle logique heartbeat (`main.js`)

- `handleControl(data)` : si `data.header === HEARTBEAT_HEADER` ->
  `freshness.onHeartbeat()` (rien d'autre : pas de `state.set`, pas de rendu de
  bloc, pas de `flashElement`, pas de persistance). Sinon, routage contenu
  normal + `freshness.onContentUpdate()` + persistance locale.
- `handleStatus(status)` : `connStatus = status` ; `freshness.setServerStatus(
  status)` ; recompute.
- **Timer central UNIQUE** (`setInterval` 1 s) : recalcule l'UI publique
  (transitions actif/silencieux et récent/ancien aux seuils) + rafraîchit le
  diagnostic. **Un seul `setInterval`, jamais dupliqué.**

## Seuils

Constantes explicites et testables (`src/state/freshness.js`) :

| Constante | Valeur | Interprétation |
|---|---|---|
| `MAX_ACTIVE_THRESHOLD_MS` | `25000` | heartbeat reçu depuis < 25 s → Max actif ; sinon silencieux |
| `CONTENT_FRESH_THRESHOLD_MS` | `300000` | contenu mis à jour depuis < 5 min → récent ; sinon ancien |

## Modifications Max

`max/CollabHub_Web_Text_Sender.maxpat` — nouvelle zone **HEARTBEAT** :

- `route serverMessage connected` outlet 1 (`connected` 1/0) → `toggle`
  (état connecté) → `metro 10000` (démarrage/arrêt).
- `connected` → `sel 1` → `t b b` : outlet 0 → `publish all sound_heartbeat 1`
  (register immédiat), outlet 1 → `delay 300` → publish (deliver) → la page
  voit Max actif ~0,3 s après la connexion.
- chaque tick `metro` → `publish all sound_heartbeat 1` → `ch.client` +
  `print CollabHub-Web-Sender` (+ moniteur).
- À la déconnexion (`connected 0`), le `toggle` coupe le `metro` : arrêt propre.
- Le heartbeat commence **uniquement** quand le CH-Client est connecté et
  s'arrête à la déconnexion. Objets standards Max uniquement (metro, toggle,
  sel, t b b, delay, message, route, print) — aucun JavaScript supplémentaire.

Préservé : les 5 champs, les boutons individuels, le bouton global, la
lisibilité. Le patch passe de 52 → 60 boxes / 38 → 49 lines.

### Validateurs

`max/validate-maxpat.mjs` vérifie désormais en plus : présence de
`sound_heartbeat`, `metro 10000`, le signal `connected` (route), le
démarrage/arrêt du metro par `connected`, le câblage du publish heartbeat vers
`ch.client` + `print`, l'absence de `$1` sur le heartbeat (valeur constante),
et aucune régression des 5 headers / du bouton global.

## Comportement public

L'indicateur de statut existant est réutilisé avec des libellés courts
(`renderConnectionStatus.js`) :

| Clé | Libellé | Point |
|---|---|---|
| `max_active` | Connecté — Max actif | vert (`is-ok`) |
| `max_silent` | Connecté — Max silencieux | attente (`is-wait`) |
| `reconnecting` | Reconnexion… | attente |
| `disconnected` / `error` | Déconnecté | rouge (`is-off`) |

- Aucun timestamp détaillé au public.
- Le contenu ancien **n'est pas masqué** : seul l'attribut
  `data-content-fresh="true|false"` est posé sur `main.card` ; un contenu
  ancien est très légèrement estompé (`opacity: 0.7`), respecte
  `prefers-reduced-motion`. Aucune animation continue agressive.

## Diagnostic `?debug=1`

Nouvelle section « Fraîcheur (heartbeat Max) », rafraîchie par le timer central
(1 s) — pas d'intervalle supplémentaire :

- Dernière activité Max (timestamp ISO du dernier heartbeat, ou « jamais »).
- Âge du dernier heartbeat (ex. « 12 s »).
- Dernière mise à jour de contenu (timestamp ISO).
- Âge du contenu.
- État Max : actif / silencieux.
- État contenu : récent / ancien.

## Persistance

Le format v1 est conservé (pas de v2 nécessaire) :

- `updatedAt` reste la date de dernière mise à jour du **contenu** (servant
  aussi à dater le contenu restauré côté fraîcheur).
- `maxLastSeenAt` **n'est pas persisté** : un heartbeat ancien restauré après
  rechargement serait trompeur (Max pourrait sembler actif alors qu'il est
  éteint). Au chargement, Max est donc « silencieux » jusqu'au prochain
  heartbeat réellement reçu.
- Au chargement, le contenu restauré est daté via
  `freshness.restoreContent(ms)` ; s'il est vieux (> 5 min), il est marqué
  ancien (`data-content-fresh="false"`).

## Tests (Lot 3B)

`npm run check` = `npm test` + `validate-maxpat` + `vite build`.

13 tests ajoutés — **48 tests au total** (35 + 13) :

1. heartbeat met à jour `maxLastSeenAt`.
2. heartbeat ne modifie pas `contentLastUpdatedAt`.
3. `sound_heartbeat` n'entre jamais dans l'état persisté.
4. Max actif sous le seuil (24 s).
5. Max silencieux au-dessus du seuil (26 s).
6. contenu récent sous le seuil.
7. contenu ancien au-dessus du seuil.
8. contenu restauré ancien correctement détecté (`restoreContent`).
9. `computePublicStatus` priorise le serveur sur Max actif.
10. aucun listener/timer dupliqué (un listener par event).
11. `setServerStatus` reflète connecté/déconnecté.
12. âges `null` tant qu'aucun heartbeat/màj.
13. `HEARTBEAT_HEADER` + seuils aux valeurs attendues.

Horloge injectable (`makeClock` / `now`) pour des tests déterministes. Le test
`wireSocket` existant a été ajusté (5 → 6 émissions, 10 → 12) car le heartbeat
est désormais observé au (re)connect.

## Procédure de validation manuelle

Sur la production https://collab-hub-web-monitor.vercel.app :

1. Ouvrir le site (sans paramètre) → « Connecté » (serveur) ; Max encore
   « silencieux » (aucun heartbeat reçu).
2. Connecter Max (CH-Client → `https://server.collab-hub.io`, attendre 0.3.4).
3. Vérifier « **Connecté — Max actif** » (dès le 1er heartbeat livré, ~0,3 s).
4. Déconnecter Max (ou quitter le patch) ; attendre > 25 s.
5. Vérifier « **Connecté — Max silencieux** » (serveur toujours connecté).
6. Reconnecter Max → retour à « Max actif ».
7. Recharger la page → le **contenu restauré reste affiché** ; Max est
   « silencieux » jusqu'au 1er heartbeat reçu (≤ 10 s).
8. `?debug=1` → section « Fraîcheur » : activité Max, âge du heartbeat, màj
   contenu, âge du contenu, états calculés (actif/silencieux, récent/ancien).

## Critères de sortie Lot 3B

- ✅ Header technique `sound_heartbeat` (non affiché, non persisté).
- ✅ Heartbeat Max toutes les 10 s, démarré/arrêté par `connected`.
- ✅ État technique séparé (`serverConnected`, `maxLastSeenAt`,
  `contentLastUpdatedAt`), horloge injectable, testable.
- ✅ Statut public Max actif/silencieux ; serveur prioritaire ; pas de redesign.
- ✅ `data-content-fresh` ; contenu ancien estompé, jamais masqué.
- ✅ Diagnostic fraîcheur (1 timer central, pas de setInterval dupliqué).
- ✅ 48 tests unitaires passent ; `validate-maxpat` OK ; `vite build` OK.
- ✅ `npm run check` vert ; commit `feat: add Max heartbeat and content
  freshness` poussé sur `main` ; Vercel redéploie automatiquement.

## Limites restantes

- « Max actif » n'apparaît qu'après un heartbeat **livré** (register/deliver) :
  ~0,3 s après la connexion Max dans le patch, puis au plus toutes les 10 s.
  Si Max se connecte et se déconnecte en moins d'un heartbeat livré, il reste
  « silencieux » (cas peu probable en usage réel).
- `maxLastSeenAt` non restauré : au rechargement, Max est « silencieux »
  jusqu'au prochain heartbeat reçu (par conception, anti-tromperie).
- La détection « Max silencieux » dépend du seuil 25 s et du timer 1 s : latence
  de détection ≤ ~1 s après le seuil.
- Le heartbeat génère un `control` toutes les 10 s côté serveur (observer) ;
  c'est léger mais c'est du trafic permanent tant que Max est connecté.