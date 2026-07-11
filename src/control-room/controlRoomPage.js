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

  let rafId = null;
  let meterTimer = null;
  let sessionExpiredSignaled = false;
  const reduceMotion = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function startMeter() {
    if (rafId != null || meterTimer != null) return;
    if (reduceMotion) {
      meterTimer = setInterval(() => renderMeter(controller.readMeter(), els), 100);
    } else {
      const tick = () => { renderMeter(controller.readMeter(), els); rafId = requestAnimationFrame(tick); };
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
    // Expiration de session : le token performer est refusé (401) -> token_unauthorized.
    // On ne signale qu'une fois, puis on rend la main au gate (retour au login).
    if (!sessionExpiredSignaled && snap.error && snap.error.code === 'token_unauthorized') {
      sessionExpiredSignaled = true;
      if (typeof onSessionExpired === 'function') onSessionExpired();
    }
    if (debug && debugPre) {
      debugPre.textContent = JSON.stringify(snap, null, 2);
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

  const debug = new URLSearchParams(location.search).get('debug') === '1';
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
    window.addEventListener('beforeunload', () => { controller.destroy(); }, { once: true });
  }

  // Démontage propre (logout / expiration) : stoppe moteurs + retire le DOM.
  async function destroy() {
    if (unloaded) return;
    unloaded = true;
    stopMeter();
    try { await controller.destroy(); } catch {}
    if (root && root.parentNode && typeof root.parentNode.removeChild === 'function') {
      try { root.parentNode.removeChild(root); } catch {}
    }
  }

  return { controller, audioEngine, publisher, els, root, destroy };
}