# Lot 5 — sound_link enrichi + compteur public d'auditeurs

Date : 2026-07-11. Statut : implémenté (commit `feat: add rich sound links and public listener count`).
**Pas de tag/release** tant que la validation manuelle n'est pas faite.

## Objectif

Deux améliorations **additives**, sans changer le patch Max, le protocole
Collab-Hub, les cinq champs `sound_*`, ni le moteur listener :

- **Partie A** — `sound_link` enrichi : accepter une syntaxe personnalisée
  `[label]{url}` en plus des URL simples historiques, avec rendu DOM sécurisé.
- **Partie B** — compteur public d'auditeurs : afficher, sur la page publique,
  le nombre d'auditeurs connectés au direct (issu de la Control Room LiveKit),
  sans jamais exposer d'identité.

Aucun nouveau header Max, aucune modification du patch
`CollabHub_Web_Text_Sender.maxpat`. Aucune nouvelle dépendance.

## Partie A — sound_link enrichi

### Syntaxe

Règle : `[label]{url}` avec texte optionnel avant et après. Un seul lien enrichi
par valeur `sound_link`.

Exemples valides :

```
[Tom Johnson]{https://en.wikipedia.org/wiki/Tom_Johnson_(composer)} aime les nombres.
Découvrir [Tom Johnson]{https://example.com}.
Voir [le site officiel]{https://example.com}
```

Rendu du premier exemple : « Tom Johnson aime les nombres. » avec seul
« Tom Johnson » cliquable.

Compatibilité historique : une URL simple `https://example.com` reste valide et
affiche le lien « En savoir plus ».

**La syntaxe Markdown classique `[label](url)` n'est PAS supportée** dans ce
lot : les parenthèses sont fréquentes dans les URLs (ex. Wikipedia) et
introduiraient une ambiguïté de parsing. Les crochets délimitent le label, les
accolades délimitent l'URL — les parenthèses dans l'URL sont prises telles
quellement.

### Sécurité (contraintes respectées)

- **Aucun `innerHTML`**, jamais. Rendu via `createTextNode` + `createElement('a')`
  + `setAttribute` uniquement.
- **HTML reçu jamais interprété** : le label est posé via `textContent` (TextNode)
  → `<b>bold</b>` s'affiche littéralement, sans gras ni script exécuté.
- **Protocoles** : seuls `http:` et `https:` sont acceptés (`isSafeHttpUrl`).
  `javascript:`, `data:`, `file:` et tout autre protocole sont refusés.
- `target="_blank"` + `rel="noopener noreferrer"` posés sur le lien créé.
- **Aucune dépendance Markdown** pour ce besoin limité : parseur maison (~60 lignes).

### Fallbacks (documentés)

| Cas | Rendu |
|-----|-------|
| URL simple valide (http/https) | lien « En savoir plus » (historique) |
| `[label]{url}` valide | prefix TextNode + `<a label>` + suffix TextNode |
| Valeur vide / blancs | lien masqué |
| Syntaxe enrichie incomplète (label/URL vide, crochet/accolade manquant) | texte brut non cliquable (visible) |
| Protocole interdit dans `[label]{...}` | texte brut non cliquable (jamais d'href dangereux) |
| URL simple invalide (`javascript:`, `data:`, texte non-URL) | lien masqué (compat historique) + warning console |

Choix documenté : pour la syntaxe enrichie tentée mais invalide, on affiche la
valeur en texte brut plutôt que de la masquer — l'utilisateur voit le contenu
sans danger (TextNode, aucun href créé). Pour une URL simple invalide, on garde
le masquage historique (aucun href dangereux créé).

### Parseur — `parseSoundLink(value)`

Pur, testable, dans `src/ui/renderSoundInfo.js`. Retourne :

```js
{
  type: "plain-url" | "rich-link" | "invalid" | "empty",
  href,        // string (http/https) ou null
  label,       // string (rich) ou null
  prefix,      // texte avant le lien (rich) ou null
  suffix,      // texte après le lien (rich) ou null
  raw,         // valeur reçue
  attemptedRich // bool : la valeur contenait '[' (syntaxe enrichie tentée)
}
```

### Tests (partie A)

19 tests couvrent le parseur et le rendu : `[label]{url}` valide, URL avec
parenthèses, texte avant/après, accolade/crochet fermant manquant, label vide,
URL vide, `javascript:`/`data:`/`file:` refusés, HTML non interprété, URL simple
historique, rendu rich-link (TextNode + `<a>` + `target`/`rel`), aucun
`innerHTML` (piège qui lève si tenté), rendu plain-url, syntaxe invalide en
texte brut, URL simple invalide masquée, valeur vide masquée, compat
historique.

## Partie B — compteur public d'auditeurs

### UI publique

Dans la section listener, près du bouton « ÉCOUTER LE DIRECT » :

```html
<p class="lk-count-line">
  <span class="listener-count" id="lk-listener-count" aria-live="polite">3 auditeurs</span>
</p>
```

Libellés : `0 auditeur` / `1 auditeur` / `N auditeurs` (N ≥ 2) ; si le statut
est absent/stale : `Auditeurs : —`. Discret (pas d'animation agressive), mise à
jour uniquement quand le libellé change (politesse `aria-live` : on ne réannonce
pas chaque fluctuation). Visible sur `/` et `/?debug=1`. La `stream-card` reste,
elle, debug-only (inchangé). Le bouton « ÉCOUTER LE DIRECT » n'est jamais masqué.

### Source de vérité

La **Control Room** (performer) compte les participants **distants** de sa Room
LiveKit dont l'identity commence par `listener-` :

- on ne compte **pas** le performer local ;
- on ne compte **pas** un second performer ;
- chaque onglet/device = un auditeur distinct ;
- **on ne publie jamais d'identité ni de SID** — seulement le nombre.

`countLiveListeners(remoteParticipants)` (`src/audio/listenerCount.js`, pur) :
accepte une Map LiveKit, une collection itérable, un objet plat clé→participant
ou un participant seul ; retourne toujours un entier ≥ 0.

### Publication Collab-Hub

Nouveau header public **`stream_listener_count`** ajouté à `STREAM_HEADERS`
(`src/collabHub/messageRouter.js`). Il est publié par le même
`streamPresencePublisher` que les 4 autres headers de flux (Lot 4G), via le même
`publishClient` (register puis deliver, file d'attente si déconnecté,
réenregistrement à la reconnexion) — **aucune seconde connexion Collab-Hub**.

Sémantique :

- en antenne : `stream_listener_count = [N]` (N = `snapshot.liveListenerCount`) ;
- hors antenne : forcé à `[0]` ;
- au `stop()` : publie `[0]` (avec `stream_onair=0`).

Cadence : un **changement du compteur** force une publication **immédiate**
(hors throttle VU-mètre). Un compteur **stable** ne publie pas supplémentaire
(le throttle 400 ms s'applique). On évite toute publication à chaque frame VU.

Recalcul du compteur côté publisher (`src/audio/livekitPublisher.js`) :
- après `room.connect` (auditeurs déjà présents) ;
- sur `participantConnected` / `participantDisconnected` ;
- après `reconnected` (la Map distante peut avoir changé) ;
- `notify()` uniquement si le compte change (pas de notification superflue).

### Réception page publique

`streamStatus` (`src/state/streamStatus.js`) ingère `stream_listener_count` :

- `normalizeCount(v)` : décimal → `Math.floor` ; `null`/`undefined`/`''`/négatif/non-fini → `null` (invalide → « Auditeurs : — »).
- `formatListenerCount(n)` : `0`/`1` → singulier, ≥ 2 → pluriel.
- Fraîcheur dédiée `listenerCountReceivedAt` (horloge locale, `STALE_MS=3000`) :
  fresh + valide → `listenerCountKnown=true` ; stale/jamais reçu/invalide → `false` → « Auditeurs : — ».
- Le snapshot expose `listenerCount` (`null` si non known), `listenerCountKnown`, `listenerCountLabel`, `listenerCountReceivedAt`. **Aucune identité/SID.**

Rendu : `publicPage.js` requiert `#lk-listener-count` après montage de la
section listener et met à jour `textContent` uniquement quand le libellé change.

### Diagnostics `?debug=1`

- **Control Room** (debug pre) : `liveListenerCount` (via snapshot publisher),
  `streamPresence.lastPublishedListenerCount`,
  `streamPresence.lastListenerCountPublishedAt`,
  `streamPresence.listenerCountPublishCount`.
- **Page publique** (panneau Flux direct) : `auditeurs (raw)`, `auditeurs (count)`,
  `auditeurs (known)`, `auditeurs (label)`, `auditeurs reçu à`.

**Aucune identité/SID d'auditeur affiché** dans le DOM ou les diagnostics.

### Tests (partie B)

40 tests couvrent : `countLiveListeners` (null/1/N, performer non compté,
participant inconnu, Map, objet plat, Set, préfixe), `normalizeCount`
(décimal/négatif/invalide), `formatListenerCount` (singulier/pluriel),
`streamStatus` (ingestion valide/0/1/N/décimal/invalide/négatif/stale/jamais
reçu, diagnostics, reset), publisher (`liveListenerCount` snapshot,
`participantConnected`/`Disconnected`/`reconnected`, notify sur changement,
aucune identité dans le snapshot), `streamPresencePublisher` (publie `[N]`,
changement → publication immédiate, stable → pas de publish, `stop` → `[0]`,
hors antenne → `[0]`, diagnostics), UI (span présent + `aria-live` + classe,
visible hors debug, aucune identité), routage `stream_listener_count`,
non-régression stream-card debug-only, register/deliver `stream_listener_count`.

## Non-régression

- `sound_title`/`sound_author`/`sound_subtitle`/`sound_description` inchangés.
- `sound_link` URL simple compatible (historique).
- `stream-card` debug-only (Lot 4G ajustement).
- Moteur listener LiveKit inchangé (mute, volume, −20 dB, iOS).
- Sécurité Control Room inchangée (session, secrets).
- Patch Max inchangé.
- Aucune nouvelle dépendance.

## Validation automatisée

`npm run check` vert : 444 tests `node:test` (385 existants + 59 nouveaux),
licence, tracked, secrets (`check-livekit-secrets` vert), maxpat, build Vite
propre.

## Validation manuelle attendue (avant release)

1. Démarrer le performer (Control Room) → page publique affiche `0 auditeur`.
2. Connecter un listener (un onglet) → `1 auditeur`.
3. Connecter un second device/onglet → `2 auditeurs`.
4. Fermer un onglet → `1 auditeur`.
5. Fermer le dernier → `0 auditeur`.
6. Couper/rétablir le réseau côté performer → le compteur se recalcule.
7. Envoyer un `sound_link` URL simple → lien « En savoir plus ».
8. Envoyer le `sound_link` enrichi `[Tom Johnson]{https://en.wikipedia.org/wiki/Tom_Johnson_(composer)} aime les nombres.`
   → seul « Tom Johnson » est cliquable, texte avant/après conservé.
9. Envoyer un `sound_link` contenant du HTML (`[<b>bold</b>]{https://example.com}`)
   → le label s'affiche en texte littéral (`<b>bold</b>`), jamais interprété.
10. Envoyer un `sound_link` `javascript:`/`data:` → refusé (texte brut ou masqué,
    jamais de lien dangereux).
11. `?debug=1` : champs compteur cohérents côté public et Control Room ; aucune
    identité d'auditeur visible.

## Limites connues

- Le compteur ne compte que les participants dont l'identity commence par
  `listener-`. Un participant non-auditeur (autre préfixe) n'est pas compté.
- `stream_listener_count` est un header public : la valeur transite par
  Collab-Hub. Aucune identité n'est transportée — seulement le nombre.
- Si le statut de flux devient stale (> 3 s sans header), le compteur affiche
  « Auditeurs : — » (on ne conserve pas un ancien compte indéfiniment).
- chunk `controlRoomPage` reste > 500 kB (avertissement Vite préexistant).