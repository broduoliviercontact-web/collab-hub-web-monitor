// Page publique (fiche programme + écoute LiveKit). Corps extrait de main.js
// (Lot 4E) pour permettre le routage single-entry : main.js branche sur le
// pathname et monte soit cette page (statique, bundle principal) soit la
// Control Room (import dynamique). Aucun changement de comportement vs Lot 4D.
//
// Issue #7 : mountPublicPage() est une racine de composition. Les dépendances
// (env, DOM, storage, location, horloge, scheduler, factory socket, chargeurs
// dynamiques diag/listener) sont injectables — par défaut vers les globals
// navigateur et import.meta.env — pour permettre les tests de caractérisation
// sans changement de comportement côté production. Retourne { teardown }
// idempotent (ferme le timer, le listener LiveKit et le socket).

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
import { shouldMountPublicDebug } from './diagnostic/debugGate.js';
import { buildRuntimeConfig } from './diagnostic/runtimeConfig.js';

// Factory socket par défaut — connectCollabHub est un import statique, l'enrober
// n'affecte pas le code-splitting. Les chargeurs dynamiques (diag/listener) ne
// sont PAS enrobés : leurs `import('./...')` littéraux restent inline dans le
// corps (branche production) pour préserver le chunking Rollup identique au
// comportement d'origine ; les tests injectent mountDiag/mountListener.
function defaultConnect(opts) {
  return connectCollabHub(opts);
}

export function mountPublicPage(deps = {}) {
  const {
    env = import.meta.env,
    doc = document,
    storage = localStorage,
    loc = location,
    now = Date.now,
    schedule = setInterval,
    clearSchedule = clearInterval,
    buildInfo = {
      version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null,
      gitCommitSha: typeof __GIT_COMMIT_SHA__ !== 'undefined' ? __GIT_COMMIT_SHA__ : null,
      buildTimestamp: typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : null,
      vercelEnv: typeof __VERCEL_ENV__ !== 'undefined' ? __VERCEL_ENV__ : null,
    },
    connect = defaultConnect,
    mountDiag,
    mountListener,
    onError = (label, err) => console.error(label, err),
    log = (...a) => console.log(...a),
  } = deps;

  // --- Configuration (centralisée via env) ---
  const SERVER_URL = (env.VITE_COLLAB_HUB_URL || 'https://server.collab-hub.io').replace(/\/+$/, '');
  const NAMESPACE = (env.VITE_COLLAB_HUB_NAMESPACE ?? '').replace(/^\/+|\/+$/g, '');
  const AUTH_MODE = env.VITE_COLLAB_HUB_AUTH_MODE;
  const USERNAME = `CH-Web_${Math.floor(Math.random() * 1000)}`;
  // Lot 4D : section d'écoute LiveKit. true -> active ; false/absent -> masquée ;
  // valeur inconnue -> false + warning (isLiveKitEnabled). L'import du SDK LiveKit
  // est dynamique et gate par ce flag -> aucun chargement si désactivé.
  const LIVEKIT_ENABLED = isLiveKitEnabled(env.VITE_LIVEKIT_ENABLED);
  // Lot Ops Debug §1 : le panneau d'exploitation ne se monte QUE si ?debug=1 ET
  // la variable build publique VITE_PUBLIC_DEBUG_ENABLED vaut exactement 'true'.
  // En production (variable false) -> /?debug=1 monte AUCUN panneau (sécurité).
  // Le debug Control Room est gated par session performer (contrôlé ailleurs).
  const PUBLIC_DEBUG_ENABLED = env.VITE_PUBLIC_DEBUG_ENABLED === 'true';
  const debugParam = new URLSearchParams(loc.search).get('debug');
  const debug = shouldMountPublicDebug({ debugParam, publicDebugEnabled: PUBLIC_DEBUG_ENABLED });
  // Infos de build injectées via vite `define` (vite.config.js). typeof garde le
  // cas où le bloc define est absent (ex. tests hors build) -> null -> affiché « — ».
  const runtimeConfig = buildRuntimeConfig({ env, build: buildInfo });
  // Logs de debug utiles (hotfix Lot 4G) : uniquement sous debug gated, jamais en console normale.
  const dbg = (...a) => { if (debug) log('[CH public flux]', ...a); };

  // --- Refs DOM ---
  const els = {
    card: doc.querySelector('main.card'),
    title: doc.getElementById('sound-title'),
    author: doc.getElementById('sound-author'),
    subtitle: doc.getElementById('sound-subtitle'),
    description: doc.getElementById('sound-description'),
    linkWrap: doc.getElementById('sound-link-wrap'),
    link: doc.getElementById('sound-link'),
    statusText: doc.getElementById('status-text'),
    statusDot: doc.getElementById('status-dot'),
  };

  // --- Restauration locale (Lot 3A) : dernier contenu reçu, sinon défauts ---
  const restored = loadSoundState(storage);
  const initial = restored ? { ...DEFAULTS, ...restored.fields } : DEFAULTS;
  const state = createSoundState(initial);
  for (const h of KNOWN_HEADERS) renderField(h, state.get(h), els, doc);

  let lastSavedAt = restored ? restored.updatedAt : null;
  let lastLocalRestore = restored ? restored.updatedAt : null;

  // --- État technique de fraîcheur (Lot 3B) ---
  // `now` injecté (défaut Date.now) -> testable en Node sans horloge réelle.
  const freshness = createFreshnessState({ now });
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
    streamStatus = createStreamStatus({ now });
    const mounted = mountStreamCard(doc, els.card, { debug, livekitEnabled: LIVEKIT_ENABLED, streamStatus });
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

  const intervalHandle = schedule(() => {
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
        renderField(header, value, els, doc);
        const key = fieldElementKey(header);
        if (key) flashElement(els[key]);
      });
      if (routed) {
        freshness.onContentUpdate();
        const saved = saveSoundState(storage, state.snapshot());
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

  connect({ serverUrl: SERVER_URL, namespace: NAMESPACE, username: USERNAME, authMode: AUTH_MODE, onControl: handleControl, onStatus: handleStatus })
    .then((api) => {
      collabApi = api;
      observeStreamHeaders(); // 1re connexion (si déjà connectée, guard idempotent)
      if (debug) {
        const diagOpts = {
          initialRestore: lastLocalRestore,
          initialSaved: lastSavedAt,
          runtimeConfig,
          clear: () => { const ok = clearSoundState(storage); if (ok) { lastSavedAt = null; lastLocalRestore = null; } return ok; },
          livekitDiag: () => ({ enabled: LIVEKIT_ENABLED, snapshot: listenerApi ? listenerApi.getSnapshot() : null }),
          streamDiag: () => streamStatus ? {
            ...streamStatus.getSnapshot(),
            ...streamStatus.getDiagnostics(),
            observedStreamHeaders: collabApi ? STREAM_HEADERS.filter((h) => collabApi.isObserved(h)) : [],
          } : null,
        };
        // import('./...') littéral inline (branche production) -> chunking Rollup
        // identique à l'origine ; mountDiag injecté (tests) court-circuite l'import.
        const diagPromise = mountDiag
          ? Promise.resolve(mountDiag(api, diagOpts))
          : (() => { const root = doc.getElementById('diagnostic'); if (!root) return Promise.resolve(null); return import('./diagnostic/diagnosticPanel.js').then((m) => m.initDiagnostic(api, root, diagOpts)); })();
        diagPromise.then((d) => {
          if (!d) return;
          diagApi = d;
          diagApi.refreshFreshness(freshness);
          if (diagApi.refreshStream) diagApi.refreshStream();
        });
      }
    })
    .catch((err) => onError('[Collab-Hub] connexion impossible :', err));

  if (LIVEKIT_ENABLED) {
    // import('./...') littéral inline (branche production) -> chunking Rollup
    // identique à l'origine ; mountListener injecté (tests) court-circuite l'import.
    const listenerPromise = mountListener
      ? Promise.resolve(mountListener({ mountAfter: streamAnchor }))
      : import('./listener/listenerSection.js').then(({ mountListenerSection }) => mountListenerSection({ mountAfter: streamAnchor }));
    listenerPromise
      .then((api) => {
        listenerApi = api;
        // Lot 5 : récupère le span de compteur d'auditeurs après montage de la
        // section listener, puis rafraîchit immédiatement le libellé.
        streamCountEl = doc.getElementById('lk-listener-count');
        renderStreamState();
      })
      .catch((e) => onError('[LiveKit] section listener indisponible :', e));
  }

  recomputePublicState();

  // Issue #7 : teardown idempotent. Non appelé en production (main.js ignore la
  // valeur de retour) ; utilisé par les tests pour fermer timer, listener et
  // socket sans fuite et valider l'absence de double montage.
  let tornDown = false;
  function teardown() {
    if (tornDown) return;
    tornDown = true;
    if (intervalHandle !== undefined && intervalHandle !== null) clearSchedule(intervalHandle);
    try { if (listenerApi && listenerApi.destroy) listenerApi.destroy(); } catch { /* listener déjà détruit */ }
    try { if (collabApi && collabApi.socket && typeof collabApi.socket.close === 'function') collabApi.socket.close(); } catch { /* socket déjà fermée */ }
  }

  return { teardown };
}