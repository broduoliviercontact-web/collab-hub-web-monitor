// Page publique (fiche programme + écoute LiveKit). Corps extrait de main.js
// (Lot 4E) pour permettre le routage single-entry : main.js branche sur le
// pathname et monte soit cette page (statique, bundle principal) soit la
// Control Room (import dynamique). Aucun changement de comportement vs Lot 4D.

import './styles/main.css';
import { connectCollabHub } from './collabHub/socketClient.js';
import { routeControl, KNOWN_HEADERS, HEARTBEAT_HEADER } from './collabHub/messageRouter.js';
import { createSoundState, DEFAULTS } from './state/soundState.js';
import { renderField, flashElement, fieldElementKey } from './ui/renderSoundInfo.js';
import { renderConnectionStatus } from './ui/renderConnectionStatus.js';
import { loadSoundState, saveSoundState, clearSoundState } from './state/persist.js';
import { createFreshnessState, computePublicStatus } from './state/freshness.js';
import { isLiveKitEnabled } from './listener/listenerUI.js';

export function mountPublicPage() {
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
  const restored = loadSoundState(localStorage);
  const initial = restored ? { ...DEFAULTS, ...restored.fields } : DEFAULTS;
  const state = createSoundState(initial);
  for (const h of KNOWN_HEADERS) renderField(h, state.get(h), els);

  let lastSavedAt = restored ? restored.updatedAt : null;
  let lastLocalRestore = restored ? restored.updatedAt : null;

  // --- État technique de fraîcheur (Lot 3B) ---
  const freshness = createFreshnessState();
  if (restored && restored.updatedAt) {
    const ms = new Date(restored.updatedAt).getTime();
    if (Number.isFinite(ms)) freshness.restoreContent(ms);
  }

  let connStatus = null;
  let lastPublicStatus = null;
  let lastFresh = null;

  let diagApi = null;
  let listenerApi = null;

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

  setInterval(() => {
    recomputePublicState();
    if (diagApi) {
      diagApi.refreshFreshness(freshness);
      if (diagApi.refreshLivekit) diagApi.refreshLivekit();
    }
  }, 1000);

  function handleControl(data) {
    if (data && data.header === HEARTBEAT_HEADER) {
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

  connectCollabHub({ serverUrl: SERVER_URL, namespace: NAMESPACE, username: USERNAME, authMode: AUTH_MODE, onControl: handleControl, onStatus: handleStatus })
    .then((api) => {
      if (new URLSearchParams(location.search).get('debug') === '1') {
        const diag = document.getElementById('diagnostic');
        if (diag) import('./diagnostic/diagnosticPanel.js').then((m) => {
          diagApi = m.initDiagnostic(api, diag, {
            initialRestore: lastLocalRestore,
            initialSaved: lastSavedAt,
            clear: () => { const ok = clearSoundState(localStorage); if (ok) { lastSavedAt = null; lastLocalRestore = null; } return ok; },
            livekitDiag: () => ({ enabled: LIVEKIT_ENABLED, snapshot: listenerApi ? listenerApi.getSnapshot() : null }),
          });
          diagApi.refreshFreshness(freshness);
        });
      }
    })
    .catch((err) => console.error('[Collab-Hub] connexion impossible :', err));

  if (LIVEKIT_ENABLED) {
    import('./listener/listenerSection.js')
      .then(({ mountListenerSection }) => { listenerApi = mountListenerSection({ mountAfter: els.card }); })
      .catch((e) => console.error('[LiveKit] section listener indisponible :', e));
  }

  recomputePublicState();
}