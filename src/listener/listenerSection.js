// Orchestrateur de la section d'écoute publique LiveKit (Lot 4D). Chargé
// dynamiquement par src/main.js UNIQUEMENT si VITE_LIVEKIT_ENABLED=true. C'est le
// SEUL module navigateur qui importe livekit-client (via livekitBrowser.js) : il
// assemble le moteur (livekitListener), l'adaptateur <audio> (listenerAudioElement)
// et l'UI pure (listenerUI).
//
// Stratégie de connexion (§12) : connexion au premier clic utilisateur sur
// ÉCOUTER LE DIRECT. Aucune connexion automatique au chargement. Le geste
// utilisateur déclenche connect() ; si l'autoplay est ensuite bloqué (le geste a
// expiré pendant la négociation token/Room), l'utilisateur clique à nouveau ->
// startAudio().

import { Room, roomEvents, trackKinds } from '../livekit/livekitBrowser.js';
import { requestLiveKitToken } from '../livekit/tokenClient.js';
import { createLiveKitListener } from '../livekit/livekitListener.js';
import { createListenerAudioElement } from './listenerAudioElement.js';
import { buildListenerDOM, renderListenerState, wireListenerControls } from './listenerUI.js';

export function mountListenerSection({ mountAfter } = {}) {
  const anchor = mountAfter || document.querySelector('main.card') || null;
  const { els } = buildListenerDOM(document, anchor);
  if (!els) return null;

  const audioSink = createListenerAudioElement({ documentRef: document });
  const tokenClient = { requestLiveKitToken };

  const listener = createLiveKitListener({
    tokenClient,
    RoomClass: Room,
    roomEvents,
    trackKinds,
    audioSink,
  });

  renderListenerState(listener.getSnapshot(), els);

  const unsub = listener.subscribe((snap) => renderListenerState(snap, els));

  async function onPrimary() {
    const st = listener.getState();
    if (st === 'idle' || st === 'stopped' || st === 'error') {
      try { await listener.connect(); } catch { /* erreur déjà rendue via snapshot */ }
    } else if (st === 'waiting_for_user' || st === 'track_available') {
      try { await listener.startAudio(); } catch {}
    }
  }
  function onMuteToggle() {
    const snap = listener.getSnapshot();
    listener.setMuted(!snap.muted);
  }
  function onVolume(v) { listener.setVolume(v); }

  wireListenerControls({ els, onPrimary, onMuteToggle, onVolume });

  // Nettoyage non bloquant au déchargement (§15) : pas de fetch supplémentaire,
  // pas de log de token.
  const onUnload = () => { try { listener.destroy(); } catch {} };
  window.addEventListener('beforeunload', onUnload, { once: true });

  return {
    getSnapshot: () => listener.getSnapshot(),
    getState: () => listener.getState(),
    connect: () => listener.connect(),
    startAudio: () => listener.startAudio(),
    setVolume: (v) => listener.setVolume(v),
    setMuted: (b) => listener.setMuted(b),
    stop: () => listener.stop(),
    destroy: () => { unsub(); window.removeEventListener('beforeunload', onUnload); return listener.destroy(); },
  };
}