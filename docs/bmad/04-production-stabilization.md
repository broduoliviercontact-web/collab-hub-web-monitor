# 04 — Stabilisation production (Lot 2C)

Le site public est déployé sur Vercel (Lot 2B) contre le serveur public
Collab-Hub **v0.3.4**. Deux problèmes bloquaient une utilisation fiable en
production :

1. **Côté Max** : le bouton global « ENVOYER LES 5 CHAMPS » ne publiait qu'un
   seul header par passage au lieu de cinq.
2. **Côté web** : la page émettait systématiquement une requête d'auth invitée
   `POST /api/v1/auth/guest` (et son preflight `OPTIONS`), route **absente** du
   serveur public v0.3.4 (404) — bruit réseau et latence inutile.

Le Lot 2C corrige les deux, sans toucher au design, aux cinq headers, au
namespace `/hub`, au protocole de publication, ni ajouter de backend.

## Partie A — Fiabilisation du bouton global Max

### Diagnostic

L'ancien mécanisme (`max/CollabHub_Web_Text_Sender.maxpat`) utilisait un
`pipe 0 50 100 150 200`. **Piège Max** : un objet `pipe` avec N arguments crée
**N inlets et N outlets** (un par argument). Seul l'inlet 0 étant câblé, seul
l'outlet 0 tirait à chaque bang → **un seul header publié par passage**. Le
double passage (register + deliver) ne produisait donc que 2 publications au
lieu des 10 attendues (5 headers × 2 passages).

### Mécanisme retenu (send/receive + delay)

On remplace les `pipe` multi-outlets par un routage interne explicite et
déterministe :

```
ENVOYER LES 5 CHAMPS (button)
        │
        ▼
   t b b  ──out0──► send ch_pub5            (1er passage : enregistrement, t=0)
        └──out1──► delay 300 ──► send ch_pub5 (2e passage : livraison, t=300ms)

send ch_pub5 ──(nommé)──► 5 × receive ch_pub5
   chaque receive ──► boîte valeur (header) ──► publish all <header> $1
                                              └──► ch.client + print
```

- **Un clic** sur le bouton global → `t b b` tire sa sortie 0 (bang immédiat
  vers `send ch_pub5`) **puis** sa sortie 1 (vers `delay 300` qui, 300 ms plus
  tard, rebang le `send ch_pub5`).
- Chaque bang de `send ch_pub5` est reçu par les **5** `receive ch_pub5` (un
  par header), dans l'ordre de création des receive → **déterministe**.
- Chaque receive pousse la **valeur courante** de sa boîte de saisie dans la
  commande `publish all <header> $1`, envoyée au `ch.client` et imprimée.
- Les **5** headers partent à **chaque** passage → 10 publications par clic
  (5 register + 5 deliver), aucun header oublié, aucun envoi parasite.
- Les longs câbles sont évités via le couple nommé `send ch_pub5` /
  `receive ch_pub5`.

### Propriétés garanties

- Un clic → 1 passage d'enregistrement (5 headers) + 1 passage de livraison
  (5 headers) = 10 déclenchements.
- Ordre déterministe (ordre des receive).
- Valeurs issues des champs actuels (boîtes de saisie).
- Console Max : 10 messages `print CollabHub-Web-Sender`.
- Boutons **individuels** conservés (un par header, inchangés).

### Validateurs

`max/validate-maxpat.mjs` vérifie désormais : 5 headers, `t b b`, `send
ch_pub5` unique, `delay 300`, 5 `receive ch_pub5`, deux passages (out0 → send ;
out1 → delay → send), 5 receive → value box → publish (10 déclenchements),
boutons individuels, chaque publish → `ch.client` + `print`, et **l'absence**
de l'ancien `pipe 0 50 100 150 200`.

## Partie B — Mode d'authentification web

### Problème

`src/collabHub/socketClient.js` appelait toujours
`fetch(<server>/api/v1/auth/guest)` avant d'ouvrir le socket. Sur le serveur
public v0.3.4 cette route renvoie 404 (et le navigateur émet d'abord un
preflight `OPTIONS`). Le code retombait déjà sur l'anonyme, mais le fetch
restait inutile et bruyant.

### Solution

Nouvelle variable `VITE_COLLAB_HUB_AUTH_MODE` (`src/collabHub/authMode.js`) :

| Mode | Comportement |
|---|---|
| `anonymous` | socket direct, **aucune** requête `/api/v1/auth/guest` (défaut, mode production v0.3.4) |
| `guest` | `POST /api/v1/auth/guest` + token si présent, sinon fallback anonyme (serveur v0.5) |
| autre / absent | fallback **safe** vers `anonymous` + `console.warn` discret (jamais de fetch inattendu) |

`resolveAuth` accepte un `fetchImpl` injectable (testable en Node sans réseau).
`buildSocketUrl(serverUrl, namespace)` est exporté et testé (conserve `/hub`
sans slash initial).

`src/main.js` lit `import.meta.env.VITE_COLLAB_HUB_AUTH_MODE` et le passe à
`connectCollabHub`. **Aucune** requête d'auth n'est émise en mode `anonymous` :
le navigateur ouvre directement le socket Socket.IO sur `/hub`.

### Configuration Vercel

`VITE_COLLAB_HUB_AUTH_MODE=anonymous` configuré en **Production + Preview**
(aucune valeur secrète, cuite dans le bundle au build). Vérifiable : le
bundle déployé ne déclenche plus de `OPTIONS`/`POST` vers
`/api/v1/auth/guest`.

## Tests (Lot 2C)

`npm run check` = `npm test` + `validate-maxpat` + `vite build`.

4 tests ajoutés (`test/runTests.mjs`) — **25 tests au total** (21 + 4) :

1. `resolveAuth` anonymous : **aucun** fetch (compteur d'appels à 0).
2. `resolveAuth` guest : `POST /api/v1/auth/guest` + token utilisé.
3. `resolveAuthMode` : mode inconnu → `anonymous`, pas de fetch.
4. `buildSocketUrl` : namespace `/hub` conservé sans slash initial.

Le validateur Max passe (mécanisme send/receive, double passage, 10
déclenchements). Le build Vite réussit.

## Procédure de validation production

Sur le site public https://collab-hub-web-monitor.vercel.app :

1. Ouvrir DevTools → Network → filtrer `auth/guest` : **aucune** requête
   `OPTIONS`/`POST` vers `/api/v1/auth/guest` (mode anonymous).
2. Sans paramètre : « Connecté » ; un `serverMessage` annonce
   `Collab-Hub Version: 0.3.4. You're in Namespace /hub`.
3. `?debug=1` : panneau de diagnostic, état connecté, observation idempotente.
4. Côté Max : cliquer le bouton individuel `sound_title` → le titre se met à
   jour sur la page (deux clics peuvent être nécessaires pour un header non
   encore enregistré — sémantique register/deliver).
5. Cliquer **ENVOYER LES 5 CHAMPS** → les 5 champs se mettent à jour en une
   fois ; le compteur de contrôles (`?debug=1`) augmente de **+5** au passage
   de livraison.
6. Vérifier qu'un `sound_link` valide (`https://…`) arrive → lien
   « En savoir plus ».
7. Couper/rétablir le réseau : la dernière valeur reste affichée, les nouvelles
   arrivent après reconnexion (réobservation idempotente).
8. Un seul onglet web suffit ; un nouvel onglet crée légitimement un nouvel
   observer (username différent).

## Critères de sortie Lot 2C

- ✅ Bouton global Max : 5 headers × 2 passages = 10 déclenchements
  déterministes, sans envoi parasite.
- ✅ Mode web `anonymous` : aucune requête `/api/v1/auth/guest` sur le site
  public.
- ✅ Mode `guest` préservé (serveur v0.5) ; mode inconnu → fallback safe.
- ✅ Namespace `/hub`, cinq headers, protocole publish, design : inchangés.
- ✅ Aucun backend ajouté.
- ✅ 25 tests unitaires passent ; `validate-maxpat` OK ; `vite build` OK.
- ✅ `npm run check` vert ; commit `fix: stabilize Collab-Hub production flow`
  poussé sur `main` ; Vercel redéploie automatiquement.

## Hors périmètre

Lot 3 (design) non commencé.

> **Suite — Lot 3A (persistance locale)** : le dernier contenu reçu est
> désormais restauré depuis `localStorage` au rechargement. Détails et tests
> dans `docs/bmad/05-local-persistence.md`. La procédure de validation
> production ci-dessus reste valable (le restore ne génère aucune requête
> réseau supplémentaire ; aucun impact sur le mode `anonymous`).