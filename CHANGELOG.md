# Changelog

## [1.0.0] - 2026-07-10

### Added
- affichage temps réel des cinq champs (titre, auteur, sous-titre, description, lien) depuis Max/MSP via Collab-Hub ;
- patch Max/MSP émetteur `CollabHub_Web_Text_Sender.maxpat` ;
- bouton global « ENVOYER LES 5 CHAMPS » en double passage (register + deliver) ;
- persistance locale du dernier contenu (`localStorage`, clé `collabHubSoundState:v1`) ;
- heartbeat Max (`sound_heartbeat` toutes les 10 s) ;
- fraîcheur du contenu (statut Max actif/silencieux, contenu récent/ancien) ;
- diagnostic `?debug=1` (panneau séparé, observation idempotente, persistance) ;
- CI GitHub Actions (`.github/workflows/ci.yml`) : tests, validation Max, build, contrôle des fichiers sensibles ;
- déploiement Vercel (SPA statique, Git auto-redeploy).

### Fixed
- fallback auth anonymous (socket direct, aucune requête `/api/v1/auth/guest` sur le serveur public v0.3.4) ;
- bouton global Max (`pipe 0 50 100 150 200` remplacé par `t b b` + `send/receive ch_pub5` + `delay 300`, 10 déclenchements déterministes) ;
- validation des URLs (`http`/`https` uniquement, `javascript:`/`data:`/vide → lien masqué) ;
- reconnexion et observation idempotente (un header observé une fois par `socket.id`, réobservation unique à la reconnexion).

### Security
- pas de `innerHTML` (rendu via `textContent`/`setAttribute`) ;
- validation `http`/`https` des liens, revalidation au rendu après restauration `localStorage` ;
- contrôle des fichiers sensibles suivis par Git (`scripts/check-tracked-files.mjs`) ;
- aucun secret dans le dépôt (`.env*` gitignoré sauf `.env.example`).