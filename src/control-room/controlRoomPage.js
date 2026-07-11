// Point d'entrée de la Control Room performer (Lot 4E / 4F.1). Assemble le moteur
// audio réel (audioEngine), le publisher LiveKit réel (livekitPublisher +
// livekitBrowser), le contrôleur, la vue et le VU-mètre. Chargé via import()
// dynamique par controlRoomGatePage.js UNIQUEMENT après authentification serveur
// -> le SDK livekit-client n'est téléchargé qu'après login valide, jamais avant.
//
// Sécurité (Lot 4F.1) : aucun secret côté navigateur, aucun mot de passe en
// Control Room (auth via cookie de session same-origin). Aucune publication /
// capture automatique au chargement : tout démarre sur action utilisateur.
// onLogout : déconnexion explicite (bouton QUITTER). onSessionExpired : détectée
// quand le publisher reçoit token_unauthorized (cookie expiré) -> le gate revient
// au login. beforeunload -> destroy() non bloquant.
//
// Exporté : mountControlRoom({ onLogout, onSessionExpired }).

import { createAudioEngine } from '../audio/audioEngine.js';
import { createLiveKitPublisher } from '../audio/livekitPublisher.js';
import { requestLiveKitToken } from '../livekit/tokenClient.js';
import { Room, LocalAudioTrack, Track, AudioPresets } from '../livekit/livekitBrowser.js';
import { createControlRoomController } from './controlRoomController.js';
import { createStreamPresencePublisher } from './streamPresencePublisher.js';
import { connectCollabHubPublisher } from '../collabHub/publishClient.js';
import {
  buildControlRoomDOM,
  renderControlRoom,
  renderMeter,
  updateBroadcastEnabled,
  wireControlRoom,
} from './controlRoomView.js';
import '../styles/main.css';

export function mountControlRoom({ onLogout, onSessionExpired } = {}) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return null;

  const mount = doc.body || doc.documentElement;
  const { root, els } = buildControlRoomDOM(doc, mount);
  if (!root) return null;

  const debug = new URLSearchParams(location.search).get('debug') === '1';

  const audioEngine = createAudioEngine();
  const publisher = createLiveKitPublisher({
    tokenClient: { requestLiveKitToken },
    RoomClass: Room,
    LocalAudioTrackClass: LocalAudioTrack,
    trackSource: Track.Source.Microphone,
    publishOptions: { dtx: false, forceStereo: true, audioPreset: AudioPresets.musicHighQualityStereo },
    trackName: 'program-audio',
    roomOptions: {},
  });
  const controller = createControlRoomController({ audioEngine, publisher });

  // --- Lot 4G : publication du statut de flux direct sur Collab-Hub ---
  // Connexion Collab-Hub en mode publication (même serveur/namespace que la page
  // publique). Aucun secret (valeurs publiques : onair, level, peak, timestamp).
  // emitterRef mutable : l'emitter est branché quand la connexion résout ; avant,
  // le publisher no-op (publication désactivée propre, le reste fonctionne).
  const CH_SERVER_URL = (import.meta.env.VITE_COLLAB_HUB_URL || 'https://server.collab-hub.io').replace(/\/+$/, '');
  const CH_NAMESPACE = (import.meta.env.VITE_COLLAB_HUB_NAMESPACE ?? '').replace(/^\/+|\/+$/g, '');
  let streamConn = null;                       // connexion Collab-Hub (pour destroy)
  const emitterRef = { current: null };       // {publish} branché à la connexion
  const streamEmitter = {
    publish(header, values) {
      const e = emitterRef.current;
      if (e && typeof e.publish === 'function') e.publish(header, values);
    },
  };
  const streamPublisher = createStreamPresencePublisher({ now: Date.now, emitter: streamEmitter });
  connectCollabHubPublisher({
    serverUrl: CH_SERVER_URL,
    namespace: CH_NAMESPACE,
    username: `CH-CR_${Math.floor(Math.random() * 1000)}`,
    debug,
  })
    .then((c) => { streamConn = c; emitterRef.current = { publish: c.publish }; })
    .catch((e) => { console.warn('[Control Room] publication flux Collab-Hub désactivée :', e && e.message); });

  let rafId = null;
  let meterTimer = null;
  let sessionExpiredSignaled = false;
  const reduceMotion = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function startMeter() {
    if (rafId != null || meterTimer != null) return;
    if (reduceMotion) {
      meterTimer = setInterval(() => {
        const m = controller.readMeter();
        renderMeter(m, els);
        streamPublisher.update(controller.getSnapshot(), m);
      }, 100);
    } else {
      const tick = () => {
        const m = controller.readMeter();
        renderMeter(m, els);
        streamPublisher.update(controller.getSnapshot(), m);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }
  }
  function stopMeter() {
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    if (meterTimer != null) { clearInterval(meterTimer); meterTimer = null; }
    renderMeter(null, els);
  }

  function onSnapshot(snap) {
    renderControlRoom(snap, els, { debug });
    updateBroadcastEnabled(els);
    if (snap.audioState === 'capturing') startMeter(); else stopMeter();
    // Lot 5 (partie B) : publication immédiate sur toute transition qui n'attend
    // pas le prochain tick du VU-mètre — notamment un changement du compteur
    // d'auditeurs (participantConnected/Disconnected/reconnected -> publisher
    // notify -> controller notify -> ici) ou une transition onAir (start/stop
    // diffusion). streamPublisher.update est idempotent vis-à-vis du throttle ;
    // countChanged/onAirTransition forcent l'émission hors throttle. Le tick du
    // VU-mètre (startMeter) continue à piloter level/peak en continu.
    streamPublisher.update(snap, snap.meter);
    // Expiration de session : le token performer est refusé (401) -> token_unauthorized.
    // On ne signale qu'une fois, puis on rend la main au gate (retour au login).
    if (!sessionExpiredSignaled && snap.error && snap.error.code === 'token_unauthorized') {
      sessionExpiredSignaled = true;
      if (typeof onSessionExpired === 'function') onSessionExpired();
    }
    if (debug && debugPre) {
      const sp = streamPublisher.getDiagnostics();
      const cp = streamConn && typeof streamConn.getDiagnostics === 'function'
        ? streamConn.getDiagnostics()
        : { connected: false, note: 'connexion non résolue' };
      debugPre.textContent = JSON.stringify({
        ...snap,
        streamPresence: sp,
        collabHubPublisher: cp,
        // Lot 5 (partie B) : diagnostic dédié au compteur d'auditeurs. Aucune
        // identité/SID d'auditeur (juste le compte + l'état d'enregistrement du
        // header sur Collab-Hub).
        listenerCount: {
          streamListenerHeaderRegistered:
            !!(streamConn && typeof streamConn.isRegistered === 'function'
              && streamConn.isRegistered('stream_listener_count')),
          liveListenerCount: snap.liveListenerCount ?? 0,
          lastPublishedListenerCount: sp.lastPublishedListenerCount,
          listenerCountPublishCount: sp.listenerCountPublishCount,
        },
      }, null, 2);
    }
  }
  controller.subscribe(onSnapshot);

  wireControlRoom({
    els,
    handlers: {
      async onAuthorize() {
        await controller.requestPermission();
        await controller.refreshDevices();
      },
      async onRefreshDevices() { await controller.refreshDevices(); },
      onSelectDevice(id) { controller.selectDevice(id); },
      async onStartCapture() { await controller.startCapture(); },
      async onStopCapture() { await controller.stopCapture(); },
      onGain(pct) { controller.setGain(pct); },
      async onStartBroadcast() { await controller.startBroadcast(); },
      async onStopBroadcast() { await controller.stopBroadcast(); },
      onLogout() { if (typeof onLogout === 'function') onLogout(); },
    },
  });

  let debugPre = null;
  if (debug) {
    const dbg = doc.createElement('section');
    dbg.className = 'cr-debug';
    const h = doc.createElement('h2'); h.className = 'lk-title'; h.textContent = 'Diagnostic';
    debugPre = doc.createElement('pre'); debugPre.className = 'cr-debug-pre';
    dbg.append(h, debugPre);
    root.append(dbg);
  }

  onSnapshot(controller.getSnapshot());

  let unloaded = false;
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      try { streamPublisher.stop(); } catch {}
      try { streamConn && streamConn.destroy(); } catch {}
      controller.destroy();
    }, { once: true });
  }

  // Démontage propre (logout / expiration) : stoppe moteurs + retire le DOM.
  async function destroy() {
    if (unloaded) return;
    unloaded = true;
    stopMeter();
    try { streamPublisher.stop(); } catch {}
    try { streamConn && streamConn.destroy(); } catch {}
    try { await controller.destroy(); } catch {}
    if (root && root.parentNode && typeof root.parentNode.removeChild === 'function') {
      try { root.parentNode.removeChild(root); } catch {}
    }
  }

  return { controller, audioEngine, publisher, els, root, destroy };
}