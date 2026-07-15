# CollabHub_Web_Text_Sender — patch Max émetteur de test (Lot 0C)

Patch Max **autonome** pour publier les six champs du site et les sept contrôles
d'image vers Collab-Hub,
afin de tester la réception côté client web (à la racine du projet).

Fichier : `max/CollabHub_Web_Text_Sender.maxpat`

## Prérequis

- **Max 8** ou version ultérieure (le patch est enregistré en format Max 9, rétro-compatible).
- **Package Collab-Hub Max Client** installé, ou son dossier présent dans le
  Max Search Path / File Preferences (voir ci-dessous). Le patch instancie
  l'abstraction officielle `ch.client.maxpat` (`patchers/ch.client.maxpat` du
  dépôt `Collab-Hub-io/Collab-Hub-Max-Client`).
- Accès Internet.
- Client web lancé à la racine du projet (`npm run dev`).

## Installation du client Collab-Hub

Le package Collab-Hub Max Client **n'est pas distribué via le Max Package
Manager** (non vérifié dans les sources). Deux options :

### Option A — ajouter le dépôt au Search Path (recommandé pour un spike)
1. Télécharger / cloner : `https://github.com/Collab-Hub-io/Collab-Hub-Max-Client`.
2. Dans Max : **Options → File Preferences**, cliquer **Add Path**, choisir le
   dossier racine du dépôt (celui qui contient `patchers/`, `javascript/`,
   `help/`). Cocher **Subfolders**.
3. Redémarrer Max si l'objet n'est pas trouvé au premier essai.

### Option B — installation en tant que package
- Si le dépôt fournit un dossier de package Max (structure `package-name/` avec
  `patchers/`, `help/`, etc.), le placer dans `~/Documents/Max 8/Packages/`
  (ou `Max 9/Packages/`). Vérifier la présence de `patchers/ch.client.maxpat`.

Vérification : créer un nouvel objet et taper `ch.client` — l'auto-complétion
doit proposer l'abstraction. Le patch ouvrira aussi l'aide via
**help/ch.client.maxhelp**.

## Ce que fait le patch

- **Zone 1 — COLLAB-HUB CONNECTION** : abstraction officielle `ch.client.maxpat`
  (bpatcher). Son UI contient le bouton **connect** et le champ d'URL serveur.
  La sortie du module est routée vers `print CollabHub-Status` (console) et
  `route serverMessage connected` → deux moniteurs (message serveur + état).
  Serveur par défaut attendu : `https://server.collab-hub.io`, version 0.3.4.
- **Zone 2 — CHAMPS ÉDITABLES** : six lignes (`sound_show_name`,
  `sound_title`, `sound_author`, `sound_subtitle`, `sound_description`,
  `sound_link`). Chaque ligne : un
  commentaire (header), une **boîte message** de saisie, un bouton **Envoyer**,
  `tosymbol` puis `prepend push all <header>`, et un moniteur « dernier
  envoi ». `tosymbol` transforme toute la saisie en une valeur unique avant
  publication : les espaces et la syntaxe éditoriale du site sont préservés.
- **Zone 3 — ENVOYER LES 6 CHAMPS** : un bouton global qui, via `t b b`, envoie
  chaque champ **deux fois**. Le trigger `t b b` a deux sorties : la sortie 0
  déclenche le **1er passage (enregistrement)** immédiatement ; la sortie 1 part
  dans un `delay 300` qui déclenche le **2e passage (livraison)** 300 ms plus
  tard. Chaque passage émet un bang dans le send/rceive nommé `ch_pub6`, qui
  est reçu par 6 `receive ch_pub6` (un par header) → chaque receive pousse la
  valeur courante de sa boîte dans `tosymbol` puis la commande
  `push all <header>`.
  C'est le **2e passage** qui déclenche les événements `control` reçus par la
  page web (voir Sémantique). On évite les longs câbles via le couple
  `send ch_pub6` / `receive ch_pub6`.

  > **Ancien mécanisme retiré (Lot 2C)** : la version précédente utilisait
  > `pipe 0 50 100 150 200`, qui crée **un inlet par argument** (5 inlets, 5
  > outlets). Seul l'inlet 0 étant câblé, seul l'outlet 0 tirait → un seul
  > header publié par passage (2 au lieu de 10). Le send/receive + `delay 300`
  > garantit que les **6** headers partent à **chaque** passage, dans un ordre
  > déterministe, sans envoi parasite.

  `sound_show_name` est affiché au-dessus du titre comme nom d'émission. Une
  valeur vide le masque automatiquement, sans laisser de bloc vide dans la page.
- **Zone 4 — IMAGE DE PROGRAMME** (issue #26) : sept boîtes message contrôlent
  `sound_image_url`, `sound_image_visible`, `sound_image_width`,
  `sound_image_height`, `sound_image_fit`, `sound_image_position` et
  `sound_image_slot`. Cliquer
  une boîte publie son champ ; **ENVOYER LES 7 CHAMPS IMAGE** utilise
  `send/receive ch_img7` et le même double passage register/deliver. Les
  valeurs par défaut sont une URL exemple, `true`, `100%`, `420px`, `cover`
  et `center`. Ce cadre recadré permet à `sound_image_position` d'agir dès le
  premier envoi.

  Côté web, les URL `http(s)` et les chemins locaux sûrs `/images/...` sont
  affichés. Les tailles admises sont
  `auto`, `px` jusqu'à 1600, `%`, `vw` ou `vh` jusqu'à 100 ; le cadrage accepte
  `contain`, `cover`, `fill`, `none`, `scale-down`, et la position accepte le
  centre, les bords ou les coins. Une valeur invalide retombe sur une valeur
  sûre. Pour déplacer le cadrage, utiliser une hauteur différente de `auto`
  avec `cover` (par exemple `420px`, `cover`, puis `top` ou `bottom`). Avec
  `auto` et `contain`, l'image entière est visible et il n'y a donc rien à
  déplacer. L'image est éphémère : elle n'est jamais sauvegardée dans le navigateur.
  `sound_image_slot` déplace le bloc image : `top` (avant le titre),
  `after_title` (entre titre et auteur), `after_author` (après l'auteur),
  `after_subtitle` (après le sous-titre) ou `bottom` (après la description).
- **Zone 5 — VISIBILITÉ DES TEXTES** : six boîtes message pilotent
  `sound_show_name_visible`, `sound_title_visible`, `sound_author_visible`,
  `sound_subtitle_visible`, `sound_description_visible` et `sound_link_visible`.
  Envoyer `true` (ou `1`) affiche le champ ; `false` (ou `0`) le masque sans
  supprimer son contenu. Un `sound_show_name_visible true` ne révèle le bloc
  que si `sound_show_name` contient une valeur. **ENVOYER LES 6 VISIBILITÉS
  TEXTE** emploie `send/receive ch_vis6` avec le
  même double passage que les autres groupes. Ces préférences sont éphémères :
  elles reviennent à `true` après un rechargement de la page.
- **Zone 6 — POSITION NOM D'ÉMISSION** : `sound_show_name_position` accepte
  `top`, `after_title`, `after_author`, `after_subtitle` ou `bottom`.
  `top` place le nom tout en haut de la carte, même devant une image placée en
  haut. **ENVOYER POSITION NOM D'ÉMISSION** utilise `send/receive ch_showpos1`
  et le même double passage register/deliver.
- **Zone 7 — PROTOCOLE V2 ATOMIQUE** (issue #42) : dix boîtes message pilotent
  le nouveau contrat générique : `snd_info_3`, `snd_info_1`, `snd_info_2`,
  `snd_show`, `snd_title`, `snd_author`, `snd_img_1`, `snd_img_2`,
  `visibility` et `order`. Le bouton
  **ENVOYER LES 8 BLOCS + VISIBILITY + ORDER** utilise `send/receive ch_v2_10`
  avec le même double passage register/deliver. En mode v2, la page web
  n'utilise plus les valeurs par défaut de l'ancien mode `sound_*` : seuls les
  blocs `snd_*` renseignés et visibles apparaissent.

  `visibility` attend exactement 8 valeurs `0` ou `1`, dans cet ordre :
  `0 snd_info_3`, `1 snd_info_1`, `2 snd_info_2`, `3 snd_show`,
  `4 snd_title`, `5 snd_author`, `6 snd_img_1`, `7 snd_img_2`.
  Exemple : `1 0 0 0 1 0 1 0` affiche seulement `snd_info_3`,
  `snd_title` et `snd_img_1` si ces blocs ont du contenu.

  `order` attend une permutation exacte de `0 1 2 3 4 5 6 7`.
  Exemple : `0 4 5 1 6 2 7 3` place `snd_info_3` tout en haut, puis le titre,
  l'auteur, `snd_info_1`, la première image, `snd_info_2`, la seconde image,
  puis `snd_show`. Une liste incomplète, dupliquée ou hors plage est ignorée.
  `snd_img_1` et `snd_img_2` acceptent les mêmes sources sûres que les images
  historiques : `https://...` ou `/images/...`.
- **Zone 8 — MESSAGES SENT TO COLLAB-HUB** : tout envoi est aussi imprimé via
  `print CollabHub-Web-Sender` (console Max) et affiché dans le moniteur de
  chaque ligne.
- **Zone 9 — HEARTBEAT** (Lot 3B) : publie `sound_heartbeat` toutes les 10 s
  tant que le CH-Client est connecté. `connected` (sortie 1 de
  `route serverMessage connected`) pilote un `toggle` qui démarre/arrête
  `metro 10000` ; chaque tick -> `push all sound_heartbeat 1` vers
  `ch.client` + `print`. À la connexion, `sel 1` -> `t b b` -> `delay 300`
  envoie un heartbeat immédiat (register) puis un second 300 ms plus tard
  (deliver) pour que la page web voit Max actif dès ~0,3 s. Ce heartbeat est un
  **header technique** : jamais affiché comme contenu, jamais persisté côté web.

## Sémantique importante (testée contre le serveur public)

- Le serveur public v0.3.4 sert **deux namespaces séparés** : `/` et `/hub`.
  Ils **ne se voient pas**. Le CH-Client Max utilise le namespace fixé par
  `config.json` du package (**défaut `hub`**). La page web **doit utiliser le
  même** : `.env` à la racine → `VITE_COLLAB_HUB_NAMESPACE=hub`.
- En mode `push`, les valeurs sont envoyées aux observateurs via un événement
  `control` `{from, header, values}`. Le bouton global conserve deux passages
  espacés de 300 ms pour un test robuste après connexion ou reconnexion.
- `values` est reçu comme un **tableau** contenant un symbole, ex.
  `["Premier morceau"]`. Les espaces, accents, `*`, crochets et accolades sont
  conservés par `tosymbol`, même si la boîte message les reçoit comme une liste.

## Test

1. Lancer le client web : `npm run dev` (depuis la racine du projet), ouvrir la
   page. Vérifier `.env` : `VITE_COLLAB_HUB_URL=https://server.collab-hub.io`
   et `VITE_COLLAB_HUB_NAMESPACE=hub`. La page affiche **connecté** + un
   `serverMessage` « Collab-Hub Version: 0.3.4. You're in Namespace /hub ».
2. Dans la page web, cliquer **Observer les 6 champs**.
3. Ouvrir `max/CollabHub_Web_Text_Sender.maxpat` dans Max.
4. Dans le bpatcher CH-Client, vérifier l'URL serveur
   `https://server.collab-hub.io`, puis cliquer **connect**.
5. Attendre le message serveur **0.3.4** (moniteur « message serveur » et
   console `CollabHub-Status`). Il doit être identique côté Max et côté web.
6. Test unitaire : ligne `sound_show_name`, cliquer **Envoyer** une 1re fois
   (enregistrement), puis une 2e fois → la page web reçoit un événement
   `control` avec `header = "sound_show_name"`, `values = ["Radio 2"]`.
   Le compteur **Contrôles reçus** s'incrémente.
7. Cliquer **ENVOYER LES 6 CHAMPS** : 6 événements `control` arrivent côté web
   (2e passage). Vérifier le compteur (+6), le nom du show au-dessus du titre
   et la zone diagnostic.
8. Tester espaces/accents et syntaxe web : éditer une boîte saisie, par ex.
   `une phrase avec des espaces`, `**Concert** [EN DIRECT]{color:red}`,
   `[Radio 2]{color:FF6B35}` ou
   `[Site artiste]{https://example.com}`, cliquer **Envoyer** deux fois puis
   vérifier la valeur complète dans `values` et sur la page web.
9. Descendre à **IMAGE DE PROGRAMME**, garder l'URL exemple ou saisir une URL
   `https://...`, puis cliquer **ENVOYER LES 7 CHAMPS IMAGE**. Vérifier
   l'affichage, garder `420px` et `cover`, puis tester `top right` ou `bottom`, puis `false` dans
   `sound_image_visible`. Tester aussi `sound_image_slot` avec `top`,
   `after_title`, `after_author`, `after_subtitle` et `bottom`. Une nouvelle
   URL doit remplacer l'image.
   Le visuel versionné de test peut être appelé avec
   `/images/collab-hub-image-test.svg` : il fonctionne en local et sur chaque
   déploiement Vercel, sans modifier l'URL dans Max.
10. Descendre à **VISIBILITÉ DES TEXTES** : saisir `false` dans
    `sound_show_name_visible` ou `sound_title_visible`, cliquer
    **ENVOYER LES 6 VISIBILITÉS TEXTE** et
    vérifier que seul le titre disparaît. Repasser à `true` : le même titre
    réapparaît sans devoir le renvoyer. Répéter avec `sound_author_visible`,
    `sound_subtitle_visible`, `sound_description_visible` et
    `sound_link_visible`. Avec `sound_show_name_visible`, envoyer d'abord le
    nom d'émission, sinon le bloc reste volontairement caché.
    Si les six contenus sont à `false` et qu'aucune image n'est visible, la carte
    éditoriale disparaît entièrement, sans ligne vide au-dessus du lecteur.
11. Descendre à **POSITION NOM D'ÉMISSION** : essayer successivement `top`,
    `after_title`, `after_author`, `after_subtitle` et `bottom`, puis cliquer
    **ENVOYER POSITION NOM D'ÉMISSION**. Avec une image en `top`, vérifier que
    le nom reste vraiment le premier bloc de la carte.
12. Descendre à **PROTOCOLE V2 ATOMIQUE** : cliquer
    **ENVOYER LES 8 BLOCS + VISIBILITY + ORDER**. Vérifier que `snd_info_3`
    apparaît tout en haut, que les deux images `/images/ezdac.png` et
    `/images/spectre_chroma.png` se chargent, puis modifier `visibility` en
    `1 0 0 0 1 0 0 0` pour ne garder que `snd_info_3` et `snd_title`.
    Modifier ensuite `order`, par exemple `4 0 1 2 3 5 6 7`, et renvoyer le
    groupe : le titre doit passer au-dessus de `snd_info_3`.
13. Tester la reconnexion : couper le réseau, observer `déconnecté` côté web et
   `connected 0` côté Max, rétablir, renvoyer un champ → nouvel événement.

## Dépannage

- **Objet Collab-Hub introuvable** (`ch.client.maxpat` manquant) : le dossier
  du dépôt n'est pas dans le Search Path. Ajouter le dossier racine dans
  **Options → File Preferences** (cocher Subfolders), redémarrer Max.
- **Aucune connexion** : vérifier l'URL serveur dans le CH-Client
  (`https://server.collab-hub.io`), l'accès Internet, et la console
  (`print CollabHub-Status`). `connect_error` s'y affiche en cas d'échec.
- **Mauvais serveur** : les `serverMessage` de Max et du web doivent indiquer
  la **même version (0.3.4)**. Sinon, les deux clients ne parlent pas au même
  serveur — aligner les URL.
- **Mauvais namespace** : si Max et le web ne sont pas dans le même namespace,
  aucun contrôle ne traverse. Le CH-Client Max utilise `config.json`
  (défaut `hub`). Mettre `VITE_COLLAB_HUB_NAMESPACE` côté web à la **même**
  valeur. `/` et `/hub` sont isolés (testé).
- **Page web connectée mais aucun contrôle disponible** : observer avant de
  publier (bouton « Observer les 6 champs » côté web), et se souvenir que la
  1re publication n'enregistre que le contrôle — il faut une 2e publication
  pour recevoir l'événement `control`.
- **Observation effectuée avant ou après publication** : observer AVANT la
  publication fonctionne ; le contrôle publié est visible dans
  `availableControls` puis `observedControls`. La valeur est poussée via
  `control` seulement sur la publication suivante.
- **Valeur tronquée au premier espace** : vérifier que le câblage passe par
  `tosymbol` puis `prepend push all <header>`. Cette version du patch le
  fait pour les six champs ; ne remplacez pas `tosymbol` par une boîte
  `push all <header> $1`.
- **Apostrophes / accents / URL** : les accents, apostrophes, URL et la syntaxe
  `[libellé]{https://…}` sont conservés comme valeur unique. Vérifier `values`
  dans la zone diagnostic web.
- **Reconnexion nécessaire** : après une coupure, le socket se reconnecte
  automatiquement (`reconnection: true` côté web). Si un envoi semble ignoré,
  renvoyer (le 2e passage du bouton global couvre ce cas).

## Validation statique

Le patch peut être vérifié sans Max :

```bash
node max/validate-maxpat.mjs
```

Vérifie : JSON valide, ids uniques, `lines` vers objets existants et
inlets/outlets dans les limites, présence du bpatcher `ch.client.maxpat`, des
6 headers éditoriaux et 7 headers image, de `print CollabHub-Web-Sender`, du
`t b b`, du `send ch_pub6` +
`delay 300` + 6 `receive ch_pub6` (double passage register/deliver, 12
déclenchements), du groupe image `send ch_img7` + 7 `receive ch_img7` (double
passage, 14 déclenchements), un bouton par envoi global, l'absence de l'ancien
`pipe 0 50 100 150 200`, **et (Lot 3B)** le header technique `sound_heartbeat`,
`metro 10000`, le démarrage/arrêt du metro par `connected`, le câblage du
push heartbeat vers `ch.client` + `print`, et l'absence de `$1` sur le
heartbeat. La clé de connexion est `lines` (conforme aux patches officiels
Collab-Hub `ch.client.maxpat` / `simple.maxpat`), non `patchlines`.
