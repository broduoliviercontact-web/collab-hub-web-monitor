// Page publique (fiche programme + écoute LiveKit). Corps extrait de main.js
// (Lot 4E) pour permettre le routage single-entry : main.js branche sur le
// pathname et monte soit cette page (statique, bundle principal) soit la
// Control Room (import dynamique). Aucun changement de comportement vs Lot 4D.

import './styles/main.css';
import { connectCollabHub } from './collabHub/socketClient.js';
import { routeControl, KNOWN_HEADERS, HEARTBEAT_HEADER, STREAM_HEADERS } from './collabHub/messageRouter.js';
import { createSoundState, DEFAULTS } from './state/soundState.js';
import { renderField, flashElement, fieldElementKey } from './ui/renderSoundInfo.js';
import { renderConnectionStatus } from './ui/renderConnectionStatus.js';
import { loadSoundState, saveSoundState, clearSoundState } from './state/persist.js';
import { createFreshnessState, computePublicStatus } from './state/freshness.js';
import { createStreamStatus, routeStreamControl } from './state/streamStatus.js';
import { renderStreamStatus, mountStreamCard } from './ui/streamStatusView.js';
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
  // Logs de debug utiles (hotfix Lot 4G) : uniquement sous ?debug=1, jamais en console normale.
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const dbg = (...a) => { if (debug) console.log('[CH public flux]', ...a); };

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
  for (const h of KNOWN_HEADERS) renderField(h, state.get(h), els, document);

  let lastSavedAt = restored ? restored.updatedAt : null;
  let lastLocalRestore = restored ? restored.updatedAt : null;

  // --- État technique de fraîcheur (Lot 3B) ---
  const freshness = createFreshnessState();
  if (restored && restored.updatedAt) {
    const ms = new Date(restored.updatedAt).getTime();
    if (Number.isFinite(ms)) freshness.restoreContent(ms);
  }

  // --- État de flux direct (Lot 4G) : statut public AVANT connexion LiveKit ---
  // La logique métier (streamStatus, observation des headers stream_*, routage,
  // diagnostic) reste active si LiveKit activé. La CARTE publique n'est montée
  // qu'en mode debug (?debug=1) — hors debug, « ÉCOUTER LE DIRECT » reste
  // l'entrée principale et aucun DOM de flux n'est créé.
  let streamStatus = null;
  let streamEls = null;
  let streamAnchor = els.card;
  // Lot 5 (partie B) : span de compteur d'auditeurs (dans la section listener,
  // montée async). Mis à jour depuis streamStatus uniquement quand le libellé
  // change (aria-live polite -> pas de réannonce à chaque tick).
  let streamCountEl = null;
  let lastListenerCountLabel = null;
  if (LIVEKIT_ENABLED) {
    streamStatus = createStreamStatus({ now: Date.now });
    const mounted = mountStreamCard(document, els.card, { debug, livekitEnabled: LIVEKIT_ENABLED, streamStatus });
    if (mounted) {
      streamEls = mounted.els;
      streamAnchor = mounted.section; // la section listener se monte APRÈS ce bloc
    }
  }

  let connStatus = null;
  let lastPublicStatus = null;
  let lastFresh = null;

  let diagApi = null;
  let listenerApi = null;
  let collabApi = null;

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

  // Rend le statut de flux (Lot 4G) + le compteur d'auditeurs (Lot 5). Appelé à
  // chaque header de flux reçu et à chaque tick 1 s (pour rafraîchir la fraîcheur :
  // un état peut devenir STALE sans nouveau header -> STATUT INDISPONIBLE /
  // « Auditeurs : — »). Le compteur est mis à jour seulement si le libellé change
  // (discrétion aria-live : on ne réécrit pas le même texte à chaque tick).
  function renderStreamState() {
    if (!streamStatus) return;
    const snap = streamStatus.getSnapshot();
    if (streamEls) renderStreamStatus(snap, streamEls);
    if (streamCountEl && snap.listenerCountLabel !== lastListenerCountLabel) {
      streamCountEl.textContent = snap.listenerCountLabel;
      lastListenerCountLabel = snap.listenerCountLabel;
    }
  }

  setInterval(() => {
    recomputePublicState();
    renderStreamState();
    if (diagApi) {
      diagApi.refreshFreshness(freshness);
      if (diagApi.refreshLivekit) diagApi.refreshLivekit();
      if (diagApi.refreshStream) diagApi.refreshStream();
    }
  }, 1000);

  // Observe les headers de flux (Lot 4G) après (re)connexion. Idempotent via le
  // guard de socketClient (réémis une fois par socket.id après vrai disconnect).
  function observeStreamHeaders() {
    if (!collabApi || !streamStatus) return;
    for (const h of STREAM_HEADERS) {
      try { const ok = collabApi.observeHeaderOnce(h); if (ok) dbg('observe stream header', h); } catch { /* guard idempotent */ }
    }
  }

  function handleControl(data) {
    // Lot 4G : headers de flux direct (avant tout routeControl, qui n'accepte
    // que les 5 contenus). Aucun secret transporté.
    if (streamStatus && data && STREAM_HEADERS.includes(data.header)) {
      routeStreamControl(data, streamStatus);
      dbg('received stream control', data.header, data.values);
      renderStreamState();
      recomputePublicState();
      if (diagApi) { diagApi.logControl(data); diagApi.refreshStream(); }
      return;
    }
    if (data && data.header === HEARTBEAT_HEADER) {
      freshness.onHeartbeat();
    } else {
      const routed = routeControl(data, (header, value) => {
        state.set(header, value);
        renderField(header, value, els, document);
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
    if (status === 'connected') { dbg('socket connected -> observe stream headers'); observeStreamHeaders(); } // (re)connexion -> réobserve
    if (diagApi) diagApi.setStatus(status);
  }

  connectCollabHub({ serverUrl: SERVER_URL, namespace: NAMESPACE, username: USERNAME, authMode: AUTH_MODE, onControl: handleControl, onStatus: handleStatus })
    .then((api) => {
      collabApi = api;
      observeStreamHeaders(); // 1re connexion (si déjà connectée, guard idempotent)
      if (new URLSearchParams(location.search).get('debug') === '1') {
        const diag = document.getElementById('diagnostic');
        if (diag) import('./diagnostic/diagnosticPanel.js').then((m) => {
          diagApi = m.initDiagnostic(api, diag, {
            initialRestore: lastLocalRestore,
            initialSaved: lastSavedAt,
            clear: () => { const ok = clearSoundState(localStorage); if (ok) { lastSavedAt = null; lastLocalRestore = null; } return ok; },
            livekitDiag: () => ({ enabled: LIVEKIT_ENABLED, snapshot: listenerApi ? listenerApi.getSnapshot() : null }),
            streamDiag: () => streamStatus ? {
              ...streamStatus.getSnapshot(),
              ...streamStatus.getDiagnostics(),
              observedStreamHeaders: collabApi ? STREAM_HEADERS.filter((h) => collabApi.isObserved(h)) : [],
            } : null,
          });
          diagApi.refreshFreshness(freshness);
          if (diagApi.refreshStream) diagApi.refreshStream();
        });
      }
    })
    .catch((err) => console.error('[Collab-Hub] connexion impossible :', err));

  if (LIVEKIT_ENABLED) {
    import('./listener/listenerSection.js')
      .then(({ mountListenerSection }) => {
        listenerApi = mountListenerSection({ mountAfter: streamAnchor });
        // Lot 5 : récupère le span de compteur d'auditeurs après montage de la
        // section listener, puis rafraîchit immédiatement le libellé.
        streamCountEl = document.getElementById('lk-listener-count');
        renderStreamState();
      })
      .catch((e) => console.error('[LiveKit] section listener indisponible :', e));
  }

  recomputePublicState();
}