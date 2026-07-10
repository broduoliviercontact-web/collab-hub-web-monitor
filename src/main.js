// Point d'entrée public. Page MVP : trois blocs + statut de connexion.
// Mode diagnostic via ?debug=1 (chargé dynamiquement, hors chemin public).
import './styles/main.css';
import { connectCollabHub } from './collabHub/socketClient.js';
import { routeControl, KNOWN_HEADERS } from './collabHub/messageRouter.js';
import { createSoundState, DEFAULTS } from './state/soundState.js';
import { renderField, flashElement, fieldElementKey } from './ui/renderSoundInfo.js';
import { renderConnectionStatus } from './ui/renderConnectionStatus.js';
import { loadSoundState, saveSoundState, clearSoundState } from './state/persist.js';

// --- Configuration (centralisée via env) ---
const SERVER_URL = (import.meta.env.VITE_COLLAB_HUB_URL || 'https://server.collab-hub.io').replace(/\/+$/, '');
const NAMESPACE = (import.meta.env.VITE_COLLAB_HUB_NAMESPACE ?? '').replace(/^\/+|\/+$/g, '');
const AUTH_MODE = import.meta.env.VITE_COLLAB_HUB_AUTH_MODE;
const USERNAME = `CH-Web_${Math.floor(Math.random() * 1000)}`;

// --- Refs DOM ---
const els = {
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

let diagApi = null; // panneau ?debug=1 (absent en mode public)

// --- Routage d'un événement control -> état + rendu + persistance locale ---
function handleControl(data) {
  routeControl(data, (header, value) => {
    state.set(header, value);
    renderField(header, value, els);
    const key = fieldElementKey(header);
    if (key) flashElement(els[key]);
  });
  // Persiste l'état courant (5 headers connus) + timestamp. Silencieux si échec.
  const saved = saveSoundState(localStorage, state.snapshot());
  if (saved) {
    lastSavedAt = saved.updatedAt;
    if (diagApi) diagApi.setLocalSaved(saved.updatedAt);
  }
  if (diagApi) diagApi.logControl(data);
}

function handleStatus(status) {
  renderConnectionStatus(status, els);
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
        });
      });
    }
  })
  .catch((err) => console.error('[Collab-Hub] connexion impossible :', err));