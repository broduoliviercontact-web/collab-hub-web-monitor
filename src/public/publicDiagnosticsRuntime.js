// Runtime diagnostic public (issue #7). Extrait de mountPublicPage().
//
// Responsabilités : gate VITE_PUBLIC_DEBUG_ENABLED + ?debug=1 (drapeau `debug`
// exposé car partagé avec dbg et la carte de flux), montage du panneau diagnostic
// via le chargeur dynamique injecté, et forwarding des appels diag (logControl,
// setStatus, setLocalSaved, refreshFreshness/Stream/Livekit) vers l'API diag
// montée. Aucun couplage métier : ne connaît ni le socket, ni le contenu, ni le
// flux, ni LiveKit — les snapshots (livekitDiag, streamDiag) sont bâtis par la
// racine de composition et passés via opts.
import { shouldMountPublicDebug } from '../diagnostic/debugGate.js';

export function createDiagnosticsRuntime({ env, loc }) {
  const publicDebugEnabled = env.VITE_PUBLIC_DEBUG_ENABLED === 'true';
  const debugParam = new URLSearchParams(loc.search).get('debug');
  const debug = shouldMountPublicDebug({ debugParam, publicDebugEnabled });
  let diagApi = null;

  return {
    debug,
    // Montage paresseux : no-op si debug désactivé. `mountDiag` est le chargeur
    // dynamique injecté (import('./diagnostic/diagnosticPanel.js') en production).
    mount(api, opts, mountDiag) {
      if (!debug) return Promise.resolve();
      return Promise.resolve(mountDiag(api, opts)).then((d) => { diagApi = d; });
    },
    isMounted: () => diagApi != null,
    logControl(data) { if (diagApi) diagApi.logControl(data); },
    setStatus(status) { if (diagApi) diagApi.setStatus(status); },
    setLocalSaved(at) { if (diagApi) diagApi.setLocalSaved(at); },
    refreshFreshness(freshness) { if (diagApi) diagApi.refreshFreshness(freshness); },
    refreshStream() { if (diagApi && diagApi.refreshStream) diagApi.refreshStream(); },
    refreshLivekit() { if (diagApi && diagApi.refreshLivekit) diagApi.refreshLivekit(); },
  };
}