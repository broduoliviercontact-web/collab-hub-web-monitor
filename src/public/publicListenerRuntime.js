// Runtime listener LiveKit public (issue #7). Extrait de mountPublicPage().
//
// Responsabilités : gate VITE_LIVEKIT_ENABLED (drapeau `enabled` exposé car
// partagé avec la création de streamStatus et mountStreamCard), import dynamique
// + montage de la section listener via le chargeur injecté, récupération du span
// de compteur d'auditeurs après montage, et destroy pour le teardown.
// Aucun secret accédé : le runtime ne manipule que le chargeur injecté et le DOM.
import { isLiveKitEnabled } from '../listener/listenerUI.js';

export function createListenerRuntime({ env, doc, mountListener, onError }) {
  const enabled = isLiveKitEnabled(env.VITE_LIVEKIT_ENABLED);
  let listenerApi = null;
  let streamCountEl = null;

  return {
    enabled,
    // Monte la section listener (import dynamique gate par enabled). No-op si
    // LiveKit désactivé -> aucune ressource, aucun DOM listener créé.
    mount(streamAnchor) {
      if (!enabled) return Promise.resolve();
      return Promise.resolve(mountListener({ mountAfter: streamAnchor }))
        .then((api) => {
          listenerApi = api;
          // Lot 5 : récupère le span de compteur d'auditeurs après montage de la
          // section listener. Le rafraîchissement du libellé est fait par la
          // racine de composition (renderStreamState) au prochain tick.
          streamCountEl = doc.getElementById('lk-listener-count');
        })
        .catch((e) => onError('[LiveKit] section listener indisponible :', e));
    },
    getApi: () => listenerApi,
    getCountEl: () => streamCountEl,
    // Teardown : détruit le listener s'il fut monté. Idempotent (guard interne).
    destroy() {
      try { if (listenerApi && listenerApi.destroy) listenerApi.destroy(); } catch { /* listener déjà détruit */ }
    },
  };
}