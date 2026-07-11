# 13 — Stabilisation, compatibilité navigateurs et release v1.1.0 (Lot 4F)

Objectif : stabiliser la couche audio LiveKit (Lots 4B–4E), vérifier la
compatibilité navigateurs, et préparer la release v1.1.0. **Aucune nouvelle
fonctionnalité hors correctifs nécessaires.**

> **Suite — Lot 4F.1** : ce lot a été suivi du Lot 4F.1 « accès protégé Control
> Room + bouton enceinte listener » (session serveur signée + atténuation
> −20 dB). Détails dans `docs/bmad/14-control-room-session-and-listener-attenuation.md`.
> Le Lot 4F.1 ne crée **pas** de tag/release v1.1.0 (validation runtime
> manuelle toujours en attente) ; la version reste 1.1.0. Les compteurs de
> tests ci-dessous (271) reflètent l'état Lot 4F ; le Lot 4F.1 porte le total à
> **326 tests** verts.

> **Convention de validation** (à respecter dans toute la doc et les notes de
> release) : chaque item est marqué selon son niveau réel de validation :
> - **[AUTO]** vérifié automatiquement (tests, build, `npm run check`) ;
> - **[HTTP]** vérifié par requête HTTP sur la production Vercel ;
> - **[CODE]** vérifié par revue de code (propriété, sans exécution runtime) ;
> - **[MANUEL]** à valider manuellement — **NON testé runtime, ne jamais
>   présenter comme validé.**

## 1. Préflight [AUTO]

- `git status -sb` : arbre propre ;
- `git pull --ff-only origin main` : main synchronisée ;
- `npm ci` : OK ;
- `npm run check` : vert (271 tests, licence, tracked, secrets, maxpat, build) ;
- version 1.0.1 → 1.1.0 (bump Lot 4F) ;
- tags `v1.0.0` et `v1.0.1` présents (aucun tag `v1.1.0` créé tant que
  validation runtime non faite) ;
- aucun secret suivi (`.env*` gitignoré sauf `.env.example`).

## 2. Vérification Vercel

### Variables serveur [HTTP] (confirmé sans afficher les valeurs)

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `PERFORMER_PASSWORD`
  configurés — **prouvé par le comportement de l'endpoint** : un `POST listener`
  renvoie 200 (un config manquant renverrait 503) et un `POST performer` avec
  mauvais mot de passe renvoie 401 (un `PERFORMER_PASSWORD` < 8 ou placeholder
  renverrait 503 via `validateConfig`).
- `VITE_LIVEKIT_ENABLED=true` en Production **[HTTP]** : le bundle public
  référence `listenerSection` / `DIRECT AUDIO` / `lk-listener` (non éliminé au
  build) — confirmé en récupérant `index.html` puis `main-*.js` déployé.

### Endpoint après (re)deploy [HTTP]

- `GET /` → 200 ;
- `GET /control-room` → 200 (titre « Control Room ») ;
- `GET /api/livekit/token` → 405, `Allow: POST` ;
- `POST /api/livekit/token {role:"listener"}` → 200, réponse contient `token` +
  `room:"main"` (valeur du token non incluse dans ce rapport) ;
- `Cache-Control: no-store` sur la 200 ;
- `POST performer` mauvais mot de passe → 401 ;
- `POST` rôle invalide → 400 ;
- `POST performer` avec **bon** mot de passe → 200 : **[MANUEL]** (mot de passe
  = secret serveur, non testable par le robot ; l'observateur humain peut le
  vérifier via la Control Room ou un client autorisé).

## 3. Test réel performer [MANUEL]

> Aucun de ces points n'a été testé en runtime. Procédure à exécuter par
> l'observateur humain et à documenter factuellement.

1. lancer Ableton Live ;
2. router le Master vers BlackHole (ou Loopback) ;
3. ouvrir `/control-room` (URL §« URLs à tester ») ;
4. cliquer **AUTORISER LE MICRO** → permission accordée, devices listés ;
5. sélectionner le périphérique virtuel (BlackHole/Loopback) ;
6. cliquer **DÉMARRER LA CAPTURE** ;
7. vérifier RMS / peak / dBFS actifs sur le vumètre ;
8. vérifier stéréo si disponible (panneau `?debug=1` / observation) ;
9. ajuster le gain master ;
10. saisir le mot de passe performer ;
11. cliquer **DÉMARRER LA DIFFUSION** ;
12. vérifier **ON AIR** ;
13. vérifier piste `program-audio` publiée (LiveKit dashboard / `?debug=1`) ;
14. cliquer **ARRÊTER LA DIFFUSION** ;
15. vérifier retour **HORS ANTENNE** ;
16. vérifier que la capture reste active (vumètre toujours actif) ;
17. cliquer **TOUT ARRÊTER** (ou ARRÊTER LA CAPTURE) ;
18. vérifier fermeture AudioContext et stop des tracks (pas de capture zombie).

Documenter : sampleRate observé, channelCount observé, latence approximative,
artefacts éventuels.

## 4. Test réel listener [MANUEL]

Dans un autre navigateur ou appareil :

1. ouvrir la page publique (`/`) ;
2. vérifier la section **DIRECT AUDIO** présente ;
3. cliquer **ÉCOUTER LE DIRECT** ;
4. vérifier connexion listener (`?debug=1`) ;
5. vérifier réception de `program-audio` ;
6. vérifier lecture audio ;
7. tester **COUPER** / **RÉACTIVER** (mute) ;
8. tester le slider de volume ;
9. couper le performer (arrêt diffusion) ;
10. vérifier retour **En attente du direct** ;
11. relancer le performer ;
12. vérifier reprise de lecture.

## 5. Navigateurs [MANUEL]

Tester si possible :
- Chrome desktop ;
- Safari desktop ;
- mobile Safari ou Chrome mobile.

Pour chacun : parcours performer §3 + parcours listener §4.

## 6. Autoplay [MANUEL]

- aucune lecture automatique sans geste ;
- `NotAllowedError` correctement géré (bouton **ÉCOUTER** réapparaît) ;
- lecture fonctionne après geste ;
- pas de boucle `play()` ;
- pas d'erreur fatale si autoplay bloqué.

## 7. Reconnexion réseau [MANUEL]

- couper Wi-Fi 10–20 s côté performer → **RECONNEXION…** puis **ON AIR** si
  LiveKit récupère ;
- couper réseau côté listener → reprise à la rétablissement ;
- aucun double track ;
- aucun double Room ;
- `reconnectCount` cohérent (`?debug=1`).

## 8. Périphérique audio disparu [MANUEL]

Pendant capture :
- désactiver BlackHole/Loopback ou changer de périphérique système ;
- vérifier état **erreur** (pas de crash) ;
- pas de capture zombie ;
- pas de publication fantôme ;
- rafraîchir les devices puis sélectionner une autre source ;
- redémarrer la capture.

## 9. Double performer [MANUEL]

Deux fenêtres `/control-room` avec le même mot de passe :
- les deux peuvent-elles publier ?
- les listeners reçoivent-ils une seule piste ?
- priorité `program-audio` correcte (le listener conserve la première piste
  `program-audio`, ignore la seconde — comportement actuel) ;
- comportement ambigu ?

**Décision Lot 4F** : aucune protection complexe ajoutée (aucun bug critique
observé ; ajout de `RoomServiceClient` écarté pour ne pas complexifier). Le
comportement actuel est documenté ; une protection serveur simple (refus du
second performer → 409 `performer_already_live`) reste possible dans un lot
ultérieur si un bug critique est constaté pendant la validation manuelle.

## 10. Compatibilité Safari [CODE] + [MANUEL]

Vérifié par revue de code [CODE] :
- `AudioContext` créé au geste utilisateur + `resume()` appelé
  (`src/audio/audioGraph.js`) ;
- labels devices débloqués via stream jetable après permission
  (`src/audio/audioDevices.js`) ;
- `watchAudioDeviceChanges` tolère l'absence d'`addEventListener` ;
- `MediaStreamAudioDestinationNode` utilisé pour le flux publié ;
- dynamic import pour la Control Room / le listener ;
- `beforeunload` cleanup (Control Room + listener).

À valider en runtime [MANUEL] : `context.resume()` effectif, labels devices
post-permission, `channelCount` supporté, `HTMLAudioElement.play()` sur Safari,
dynamic import, cleanup beforeunload.

## 11. Compatibilité Chrome [CODE] + [MANUEL]

Vérifié par revue de code [CODE] :
- contraintes musique + échelle de fallback (`constraintLadder`) ;
- `deviceId` exact préservé ;
- stéréo `ideal:2` ;
- détection device virtuel (BlackHole/Loopback/Soundflower/VB-Audio) ;
- autoplay géré.

À valider en runtime [MANUEL] : BlackHole visible, fallback contraintes, stéréo,
changement de device, autoplay, reconnect, fermeture tracks.

## 12. Qualité audio [CODE] + [MANUEL]

Vérifié par revue de code [CODE] :
- `echoCancellation:false`, `noiseSuppression:false`, `autoGainControl:false` ;
- `dtx:false`, `forceStereo:true`, `audioPreset:musicHighQualityStereo` (128 kbps) ;
- pas de monitoring local (aucune connexion à `context.destination`) ;
- gain master effectif via `GainNode` borné [0,1].

À documenter en runtime [MANUEL] : sampleRate observé, channelCount observé,
latence approximative, artefacts éventuels, pas de saturation.

## 13. Sécurité [AUTO] + [HTTP] + [CODE]

- aucun secret dans le bundle [AUTO] (`check-livekit-secrets` vert) ;
- aucun token dans localStorage/sessionStorage [CODE] (token en mémoire
  uniquement dans publisher/listener) ;
- aucun password dans le DOM après succès [CODE] (vidé de l'`<input>`) ;
- aucun password dans les logs [CODE] ;
- aucun token dans les logs [CODE] ;
- endpoint same-origin `/api/livekit/token` [CODE] ;
- listener `canPublish:false` [CODE] ; performer `canSubscribe:false` [CODE] ;
- TTL 2 h [CODE] ; `Cache-Control: no-store` [HTTP].

Commandes : `npm run check`, `node scripts/check-livekit-secrets.mjs` — **vert** [AUTO].

## 14. Correctifs apportés pendant le Lot 4F

**Aucun.** La revue de code et les vérifications automatisées ([AUTO]/[HTTP]/[CODE])
n'ont révélé aucun défaut à corriger. Les éventuels défauts ne peuvent apparaître
que lors des tests runtime [MANUEL] ; s'ils surviennent, appliquer la procédure
du §15.

## 15. Procédure de correctif (si défaut runtime constaté)

Pour chaque défaut réel :
- documenter le **symptôme** (étapes, navigateur, matériel) ;
- identifier la **cause** (fichier / fonction) ;
- **fichier modifié** (correctif chirurgical, cause racine) ;
- **test ajouté** couvrant le bug réel (pas de faux test simulant un succès) ;
- **résultat réel** après correction (`npm run check` vert) ;
- pas de refactor large non nécessaire.

## 16. Tests automatisés ajoutés pendant le Lot 4F

**Aucun** (aucun défaut observé → aucune régression à couvrir). Le total reste
271 tests verts. Des tests seront ajoutés uniquement si un défaut runtime
justifie une régression couvrante.

> **Lot 4F.1** : 55 tests ajoutés (§16 session 15, §17 token performer 7,
> §18 gate 10+, §19 enceinte 16, §20 sécurité) — total **326 tests** verts.
> Voir `docs/bmad/14`.

## 17. Documentation

- `CHANGELOG.md` : section `[1.1.0]` ;
- `docs/release/v1.1.0.md` : notes de release (niveaux de validation distingués) ;
- `docs/bmad/13-livekit-stabilization-and-release.md` : ce fichier (matrice de
  test) ;
- `README.md` : mis à jour (couche audio en développement → édition v1.1.0).

## 18. Version

- `package.json` : `1.1.0` ;
- `package-lock.json` : `1.1.0` (root + `packages[""]`) ;
- `name` = `collab-hub-web-monitor`, `license` = `GPL-3.0-only` inchangés ;
- aucune dépendance ajoutée.

## 19. Package release

`release-package/CollabHub-Web-Monitor-v1.1.0/` (local, gitignoré) :

```
CollabHub-Web-Monitor-v1.1.0/
  README.md
  LICENSE
  VERSION.txt
  max/
    CollabHub_Web_Text_Sender.maxpat
    README.md
```

Exclut : `.env`, `node_modules`, `dist`, secrets, ZIP précédents, fichiers
temporaires. ZIP : `CollabHub-Web-Monitor-v1.1.0.zip` (local). SHA-256 calculé.

`VERSION.txt` :
```
Collab-Hub Web Monitor
Version 1.1.0
Release date: 2026-07-10
License: GNU General Public License v3.0 only
SPDX-License-Identifier: GPL-3.0-only
Copyright (C) 2026 Olivier Brodu
```

## 20. Validation finale

- `npm ci` [AUTO] ; `npm run check` [AUTO] ; `git diff --check` [AUTO] ;
- `unzip -l CollabHub-Web-Monitor-v1.1.0.zip` : contenu propre (pas de
  `.env`/`node_modules`/`dist`/secrets) ;
- `shasum -a 256 CollabHub-Web-Monitor-v1.1.0.zip` : SHA-256 noté.

## 21. Git

- commit : `release: prepare v1.1.0 live audio edition` ;
- push sur `main` ; attendre CI verte.
- **Tag `v1.1.0` et release GitHub : NON créés** tant que la validation runtime
  [MANUEL] n'est pas faite (choix utilisateur Lot 4F).

## 22. Tag + release GitHub (à faire après validation manuelle)

- `git tag -a v1.1.0 -m "Collab-Hub Web Monitor v1.1.0"` ; `git push origin v1.1.0` ;
- release GitHub « Collab-Hub Web Monitor v1.1.0 », tag `v1.1.0`, joindre
  `CollabHub-Web-Monitor-v1.1.0.zip`, notes (niveaux de validation distingués,
  hash commit, CI, SHA-256 ZIP, lien production, route `/control-room`), publié
  en **latest stable** (pas prerelease) — uniquement après GO.

## 23. Matrice de test (récapitulatif)

| Domaine | Niveau | Statut |
|---|---|---|
| Préflight / 271 tests / build / check | AUTO | ✅ vert |
| Endpoint token (405/200/401/400, no-store) | HTTP | ✅ |
| Variables serveur configurées | HTTP | ✅ (inféré) |
| VITE_LIVEKIT_ENABLED=true prod | HTTP | ✅ |
| Grants / TTL / contraintes musique / DTX / stéréo | CODE | ✅ |
| Pas de monitoring local / resume() / labels | CODE | ✅ |
| Autoplay / reconnect / pas double track | CODE | ✅ |
| Secrets (storage/DOM/logs) | CODE | ✅ |
| Performer Ableton+BlackHole | MANUEL | ⏳ à valider |
| Listener réel second navigateur | MANUEL | ⏳ à valider |
| Chrome / Safari / mobile | MANUEL | ⏳ à valider |
| Autoplay runtime | MANUEL | ⏳ à valider |
| Reconnexion réseau réelle | MANUEL | ⏳ à valider |
| devicechange réel | MANUEL | ⏳ à valider |
| Qualité / latence audio | MANUEL | ⏳ à valider |
| Double performer | MANUEL | ⏳ à valider |

## URLs à tester

- Page publique : https://collab-hub-web-monitor.vercel.app/
- Control Room : https://collab-hub-web-monitor.vercel.app/control-room
- Endpoint token : https://collab-hub-web-monitor.vercel.app/api/livekit/token
- Diagnostic performer : https://collab-hub-web-monitor.vercel.app/control-room?debug=1
- Diagnostic listener : https://collab-hub-web-monitor.vercel.app/?debug=1

## Checklist manuelle exacte (GO / NO-GO pour tagger v1.1.0)

**GO si tous** :
1. [MANUEL] Performer : Ableton→BlackHole→autoriser→sélectionner→capturer→
   vumètre actif→gain→password→diffuser→**ON AIR**→piste `program-audio`
   publiée→arrêter→**HORS ANTENNE** (capture conservée)→tout arrêter→
   AudioContext/tracks fermés.
2. [MANUEL] Listener : ÉCOUTER→réception `program-audio`→lecture→mute→volume→
   couper performer→« En attente du direct »→relancer→reprise.
3. [MANUEL] Chrome desktop : parcours complet sans erreur fatale.
4. [MANUEL] Safari desktop : parcours complet sans erreur fatale.
5. [MANUEL] Mobile (Safari ou Chrome) : parcours listener minimum.
6. [MANUEL] Autoplay : pas de lecture auto sans geste ; `NotAllowedError` géré.
7. [MANUEL] Reconnexion réseau : RECONNEXION…→ON AIR (performer) / reprise
   (listener) ; pas de double track/Room ; `reconnectCount` cohérent.
8. [MANUEL] devicechange : erreur propre, pas de crash/zombie/fantôme ;
   rafraîchir + autre source + redémarrer capture possibles.
9. [MANUEL] Sécurité runtime : aucun token en storage, aucun password en
   DOM/logs après succès (vérifier `?debug=1` + DevTools).
10. [AUTO] `npm run check` vert + CI verte sur le commit `release: prepare
    v1.1.0`.

**NO-GO si** : un seul échec runtime, ou fuite/erreur de sécurité, ou crash non
récupérable. → documenter le défaut (§15), corriger, ajouter un test de
régression, recommencer la checklist.

## Limites restantes

- release v1.1.0 préparée mais **non publiée** tant que validation runtime
  [MANUEL] non faite (tag/release en attente de GO utilisateur) ;
- chunk `controlRoomPage` > 500 ko (avertissement Vite, à la demande) ;
- pas de refresh token (TTL 2 h ; reconnexion native) ;
- changement de device en capture non supporté ;
- double performer non protégé (comportement documenté) ;
- wiring `check-livekit-secrets` dans la CI GitHub reporté ;
- vulnérabilités `npm audit` (esbuild/vite, devDeps, préexistantes) non corrigées.