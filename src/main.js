// Point d'entrée public. Page MVP : trois blocs + statut de connexion.
// Mode diagnostic via ?debug=1 (chargé dynamiquement, hors chemin public).
import './styles/main.css';
import { connectCollabHub } from './collabHub/socketClient.js';
import { routeControl, KNOWN_HEADERS, HEARTBEAT_HEADER } from './collabHub/messageRouter.js';
import { createSoundState, DEFAULTS } from './state/soundState.js';
import { renderField, flashElement, fieldElementKey } from './ui/renderSoundInfo.js';
import { renderConnectionStatus } from './ui/renderConnectionStatus.js';
import { loadSoundState, saveSoundState, clearSoundState } from './state/persist.js';
import { createFreshnessState, computePublicStatus } from './state/freshness.js';
import { isLiveKitEnabled } from './listener/listenerUI.js';

// --- Configuration (centralisée via env) ---
const SERVER_URL = (import.meta.env.VITE_COLLAB_HUB_URL || 'https://server.collab-hub.io').replace(/\/+$/, '');
const NAMESPACE = (import.meta.env.VITE_COLLAB_HUB_NAMESPACE ?? '').replace(/^\/+|\/+$/g, '');
const AUTH_MODE = import.meta.env.VITE_COLLAB_HUB_AUTH_MODE;
const USERNAME = `CH-Web_${Math.floor(Math.random() * 1000)}`;
// Lot 4D : section d'écoute LiveKit. true -> active ; false/absent -> masquée ;
// valeur inconnue -> false + warning (isLiveKitEnabled). L'import du SDK LiveKit
// est dynamique et gate par ce flag -> aucun chargement si désactivé.
const LIVEKIT_ENABLED = isLiveKitEnabled(import.meta.env.VITE_LIVEKIT_ENABLED);

// --- Refs DOM ---
const els = {
  card: document.querySelector('main.card'),
  title: document.getElementById('sound-title'),
  author: document.getElementById('sound-author'),
  subtitle: document.getElementById('sound-subtitle'),
  description: document.getElementById('sound-description'),
  linkWrap: document.getElementById('sound-link-wrap'),
  link: document.getElementById('sound-link'),
  statusText: document.getElementById('status-text'),
  statusDot: document.getElementById('status-dot'),
};

// --- Restauration locale (Lot 3A) : dernier contenu reçu, sinon défauts ---
// Validation stricte dans loadSoundState ; sound_link repassera par la
// validation URL au rendu. En cas d'absence/corruption -> DEFAULTS.
const restored = loadSoundState(localStorage);
const initial = restored ? { ...DEFAULTS, ...restored.fields } : DEFAULTS;
const state = createSoundState(initial);
for (const h of KNOWN_HEADERS) renderField(h, state.get(h), els);

let lastSavedAt = restored ? restored.updatedAt : null; // timestamp du dernier état sauvegardé
let lastLocalRestore = restored ? restored.updatedAt : null;

// --- État technique de fraîcheur (Lot 3B) ---
// Horloge réelle en prod. Le contenu restauré est daté depuis localStorage ;
// maxLastSeenAt n'est JAMAIS restauré (un heartbeat ancien serait trompeur).
const freshness = createFreshnessState();
if (restored && restored.updatedAt) {
  const ms = new Date(restored.updatedAt).getTime();
  if (Number.isFinite(ms)) freshness.restoreContent(ms);
}

let connStatus = null;       // statut serveur courant (null avant le 1er signal)
let lastPublicStatus = null; // évite les écritures DOM redondantes
let lastFresh = null;

let diagApi = null; // panneau ?debug=1 (absent en mode public)
let listenerApi = null; // section d'écoute LiveKit (Lot 4D, absente si désactivée)

// Recalcule l'UI publique : libellé de statut (Max actif/silencieux) + attribut
// data-content-fresh. Écritures DOM gardées (uniquement si changement).
function recomputePublicState() {
  if (connStatus !== null) {
    const pub = computePublicStatus(connStatus, freshness.isMaxActive());
    if (pub !== lastPublicStatus) {
      renderConnectionStatus(pub, els);
      lastPublicStatus = pub;
    }
  }
  const fresh = freshness.isContentFresh();
  if (fresh !== lastFresh) {
    if (els.card) els.card.setAttribute('data-content-fresh', String(fresh));
    lastFresh = fresh;
  }
}

// Timer central UNIQUE (Lot 3B) : 1 s, léger. Rafraîchit l'UI publique
// (transitions actif/silencieux, récent/ancien aux seuils) + le diagnostic.
// Évite les multiples setInterval : un seul, maîtrisé.
setInterval(() => {
  recomputePublicState();
  if (diagApi) {
    diagApi.refreshFreshness(freshness);
    if (diagApi.refreshLivekit) diagApi.refreshLivekit();
  }
}, 1000);

// --- Routage d'un événement control ---
function handleControl(data) {
  if (data && data.header === HEARTBEAT_HEADER) {
    // Heartbeat : on date l'activité Max, SANS toucher au contenu ni persister.
    freshness.onHeartbeat();
  } else {
    const routed = routeControl(data, (header, value) => {
      state.set(header, value);
      renderField(header, value, els);
      const key = fieldElementKey(header);
      if (key) flashElement(els[key]);
    });
    if (routed) {
      freshness.onContentUpdate();
      // Persiste l'état contenu (5 headers connus) + timestamp. Silencieux si échec.
      const saved = saveSoundState(localStorage, state.snapshot());
      if (saved) {
        lastSavedAt = saved.updatedAt;
        if (diagApi) diagApi.setLocalSaved(saved.updatedAt);
      }
    }
  }
  recomputePublicState();
  if (diagApi) { diagApi.logControl(data); diagApi.refreshFreshness(freshness); }
}

function handleStatus(status) {
  connStatus = status;
  freshness.setServerStatus(status);
  recomputePublicState();
  if (diagApi) diagApi.setStatus(status);
}

// --- Connexion ---
connectCollabHub({ serverUrl: SERVER_URL, namespace: NAMESPACE, username: USERNAME, authMode: AUTH_MODE, onControl: handleControl, onStatus: handleStatus })
  .then((api) => {
    if (new URLSearchParams(location.search).get('debug') === '1') {
      const diag = document.getElementById('diagnostic');
      if (diag) import('./diagnostic/diagnosticPanel.js').then((m) => {
        diagApi = m.initDiagnostic(api, diag, {
          initialRestore: lastLocalRestore,
          initialSaved: lastSavedAt,
          clear: () => { const ok = clearSoundState(localStorage); if (ok) { lastSavedAt = null; lastLocalRestore = null; } return ok; },
          // Lot 4D : fournisseur de diagnostic LiveKit (l snapshot listener lu au
          // refresh, jamais de token/secret).
          livekitDiag: () => ({ enabled: LIVEKIT_ENABLED, snapshot: listenerApi ? listenerApi.getSnapshot() : null }),
        });
        diagApi.refreshFreshness(freshness);
      });
    }
  })
  .catch((err) => console.error('[Collab-Hub] connexion impossible :', err));

// --- Section d'écoute LiveKit (Lot 4D) ---
// Import dynamique gate par VITE_LIVEKIT_ENABLED : le SDK livekit-client n'est
// chargé que si la fonctionnalité est active. Connexion au premier clic
// utilisateur (aucune connexion auto au chargement).
if (LIVEKIT_ENABLED) {
  import('./listener/listenerSection.js')
    .then(({ mountListenerSection }) => { listenerApi = mountListenerSection({ mountAfter: els.card }); })
    .catch((e) => console.error('[LiveKit] section listener indisponible :', e));
}

// Première passe de fraîcheur (le contenu restauré peut déjà être ancien).
recomputePublicState();