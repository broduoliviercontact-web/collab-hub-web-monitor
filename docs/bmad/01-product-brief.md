# 01 — Product Brief

## Problème
Lors d'une performance / radio expérimentale pilotée depuis Max/MSP, le public
n'a pas accès au contexte du morceau en cours (titre, auteur, sous-titre,
description, lien). Ces informations existent dans le patch Max mais ne sont pas
visibles à distance, sur téléphone ou grand écran, sans interface technique.

## Utilisateur principal
Le **public** présent (physique ou distant) : une personne qui consulte une page
web simple pour suivre le morceau en cours. Aucune compétence technique attendue.
Secondaire : l'**artiste/performanceur** qui pilote depuis Max et publie les cinq
champs via le patch émetteur (`max/CollabHub_Web_Text_Sender.maxpat`).

## Valeur
Une fiche programme en temps réel, lisible à distance, mise à jour sans
rechargement au fil de la performance. Le public voit exactement ce que l'artiste
publie, avec une esthétique sobre de radio numérique (pas un dashboard technique).

## Périmètre MVP
- Une seule page web publique, responsive, sans framework.
- Trois blocs : (1) titre + auteur, (2) sous-titre, (3) description + lien
  cliquable optionnel.
- Réception temps réel des cinq headers Collab-Hub (`sound_title`,
  `sound_author`, `sound_subtitle`, `sound_description`, `sound_link`).
- Indicateur de connexion discret (Connecté / Reconnexion… / Déconnecté).
- Micro-transition de mise à jour respectant `prefers-reduced-motion`.
- Mode diagnostic masqué (`?debug=1`) pour vérifier la réception.

## Hors périmètre
- Interface d'administration, login, base de données, historique, persistance.
- HTML reçu depuis Max (texte uniquement ; URL rendue côté navigateur).
- React / framework. Changement du protocole Collab-Hub. Modification du patch Max.
- Multi-pages, routage côté client.

## Critères de réussite
- La page se charge, se connecte à `https://server.collab-hub.io` (namespace
  `/hub`, serveur v0.3.4) sans intervention.
- Un champ publié depuis Max apparaît en < 1 s sur la page, sans rechargement.
- `sound_title` publié met à jour uniquement le titre (les autres champs
  restent inchangés).
- Une URL `https` valide devient un lien « En savoir plus » (`target="_blank"`,
  `rel="noopener noreferrer"`); une URL `javascript:`/`data:`/vide est masquée.
- La page reste lisible en mobile (une colonne, pas de débordement horizontal).
- Après une coupure puis rétablissement réseau, la dernière valeur reste
  affichée et de nouvelles valeurs sont reçues.
- 14 tests unitaires passent ; `vite build` réussit.

## Risques
- **Namespace** : le serveur public sert `/` et `/hub` séparément. Max utilise
  `/hub` (config.json) ; le web doit utiliser `/hub` aussi (`VITE_COLLAB_HUB_NAMESPACE=hub`). Désalignement = aucun contrôle reçu.
- **Sémantique publish** : la 1re publication d'un header ne pousse pas la
  valeur ; seule une publication suivante déclenche l'événement `control`. Le
  patch Max envoie chaque champ deux fois (register + deliver).
- **CORS / auth** : le serveur public n'a pas d'API guest (404) ; on retombe
  sur une connexion socket anonyme (le serveur renvoie
  `Access-Control-Allow-Origin: *`).
- **Injection** : refusée par construction (textContent uniquement, URL
  validée http/https, jamais innerHTML).
- **Dépendance serveur public vieillissant** (v0.3.4) : risque de changement
  d'URL/protocole. Coder contre le serveur réellement utilisé par Max.

## Décisions techniques validées
- Vite + JavaScript vanilla (pas de React). `socket.io-client` seule dépendance
  runtime.
- Architecture en modules : `collabHub/` (socket + router), `state/`, `ui/`,
  `styles/`. Modules purs testables en Node (sans `import.meta.env`, sans DOM global).
- Namespace `/hub` (aligné sur le défaut du CH-Client Max).
- Fallback auth anonyme (guest 404 -> anonyme).
- Diagnostic conservé via `?debug=1` (chunk dynamique, hors chemin public).
- Tests : `node:test` + `node:assert` (zéro dépendance).