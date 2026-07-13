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
import { renderConnectionStatus } from './ui/renderConnectionStatus.js';
import { computePublicStatus } from './state/freshness.js';
import { buildRuntimeConfig } from './diagnostic/runtimeConfig.js';
import { createDiagnosticsRuntime } from './public/publicDiagnosticsRuntime.js';
import { createListenerRuntime } from './public/publicListenerRuntime.js';
import { createStreamRuntime } from './public/publicStreamRuntime.js';
import { createContentRuntime } from './public/publicContentRuntime.js';

// Factory socket par défaut — connectCollabHub est un import statique, l'enrober
// n'affecte pas le code-splitting. Les chargeurs dynamiques (diag/listener) sont
// des flèches par défaut contenant le littéral `import('./...')` (Rollup code-
// splitte toujours depuis un littéral) ; les tests injectent des fakes.
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
    mountDiag = (api, opts) => {
      const root = doc.getElementById('diagnostic');
      if (!root) return Promise.resolve(null);
      return import('./diagnostic/diagnosticPanel.js').then((m) => m.initDiagnostic(api, root, opts));
    },
    mountListener = (opts) => import('./listener/listenerSection.js').then(({ mountListenerSection }) => mountListenerSection(opts)),
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
  // Gate + montage listener + destroy extraits dans publicListenerRuntime (issue #7).
  const listener = createListenerRuntime({ env, doc, mountListener, onError });
  const LIVEKIT_ENABLED = listener.enabled;
  // Lot Ops Debug §1 : le panneau d'exploitation ne se monte QUE si ?debug=1 ET
  // la variable build publique VITE_PUBLIC_DEBUG_ENABLED vaut exactement 'true'.
  // En production (variable false) -> /?debug=1 monte AUCUN panneau (sécurité).
  // Le debug Control Room est gated par session performer (contrôlé ailleurs).
  // Gate + montage diag extraits dans publicDiagnosticsRuntime (issue #7).
  const diag = createDiagnosticsRuntime({ env, loc });
  const debug = diag.debug;
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

  // --- Contenu (Lot 3A/3B) : 5 champs sound_*, persistance locale, fraîcheur
  // contenu Max. Extrait dans publicContentRuntime (issue #7). Le runtime expose
  // `freshness` (consommé par le statut public + le diag) et un `clear()` (diag).
  const content = createContentRuntime({
    doc,
    els: { title: els.title, author: els.author, subtitle: els.subtitle, description: els.description, linkWrap: els.linkWrap, link: els.link },
    storage, now,
  });
  const freshness = content.freshness;

  // --- État de flux direct (Lot 4G) : statut public AVANT connexion LiveKit ---
  // La logique métier (streamStatus, observation des headers stream_*, routage,
  // carte de flux + mini VU, compteur d'auditeurs, fraîcheur stale/fresh, snapshot
  // diag) est extraite dans publicStreamRuntime (issue #7). `getCountEl` injecté
  // (span détenu par le runtime listener) — aucun couplage direct listener/stream.
  const stream = createStreamRuntime({
    doc, card: els.card, enabled: LIVEKIT_ENABLED, debug, now,
    getCountEl: () => listener.getCountEl(), dbg,
  });

  let connStatus = null;
  let lastPublicStatus = null;
  let lastFresh = null;

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

  // Rend le statut de flux + le compteur d'auditeurs (délégué au runtime stream).
  const renderStreamState = () => stream.render();

  const intervalHandle = schedule(() => {
    recomputePublicState();
    renderStreamState();
    if (diag.isMounted()) {
      diag.refreshFreshness(freshness);
      diag.refreshLivekit();
      diag.refreshStream();
    }
  }, 1000);

  function handleControl(data) {
    // Lot 4G : headers de flux direct (avant tout routeControl, qui n'accepte
    // que les 5 contenus). Aucun secret transporté. Routage + rendu délégués au
    // runtime stream ; seul l'orchestration (fraîcheur, diag) reste ici.
    if (stream.ingest(data)) {
      dbg('received stream control', data.header, data.values);
      renderStreamState();
      recomputePublicState();
      diag.logControl(data);
      diag.refreshStream();
      return;
    }
    // Contenu (sound_* via routeControl, ou heartbeat) délégué au runtime contenu.
    // applyControl rend, rafraîchit la fraîcheur, persiste ; retourne le timestamp
    // sauvegardé (null si heartbeat / non routé / sauvegarde échouée).
    const savedAt = content.applyControl(data);
    if (savedAt) diag.setLocalSaved(savedAt);
    recomputePublicState();
    diag.logControl(data);
    diag.refreshFreshness(freshness);
  }

  function handleStatus(status) {
    connStatus = status;
    freshness.setServerStatus(status);
    recomputePublicState();
    if (status === 'connected') { dbg('socket connected -> observe stream headers'); stream.observeHeaders(collabApi); } // (re)connexion -> réobserve
    diag.setStatus(status);
  }

  connect({ serverUrl: SERVER_URL, namespace: NAMESPACE, username: USERNAME, authMode: AUTH_MODE, onControl: handleControl, onStatus: handleStatus })
    .then((api) => {
      collabApi = api;
      stream.observeHeaders(api); // 1re connexion (si déjà connectée, guard idempotent)
      const diagOpts = {
        initialRestore: content.getInitialRestore(),
        initialSaved: content.getInitialSavedAt(),
        runtimeConfig,
        clear: () => content.clear(),
        livekitDiag: () => ({ enabled: LIVEKIT_ENABLED, snapshot: listener.getApi() ? listener.getApi().getSnapshot() : null }),
        streamDiag: () => stream.diagSnapshot(collabApi),
      };
      // Montage diag gated par `debug` à l'intérieur du runtime (issue #7).
      diag.mount(api, diagOpts, mountDiag).then(() => {
        diag.refreshFreshness(freshness);
        diag.refreshStream();
      });
    })
    .catch((err) => onError('[Collab-Hub] connexion impossible :', err));

  if (LIVEKIT_ENABLED) {
    // Monte la section listener (import dynamique gate par enabled dans le runtime).
    // Après montage, le span de compteur d'auditeurs est disponible -> rafraîchit
    // immédiatement le libellé.
    listener.mount(stream.getAnchor()).then(() => { renderStreamState(); });
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
    listener.destroy();
    try { if (collabApi && collabApi.socket && typeof collabApi.socket.close === 'function') collabApi.socket.close(); } catch { /* socket déjà fermée */ }
  }

  return { teardown };
}