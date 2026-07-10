// Point d'entrée de la page /control-room (Lot 4E). Assemble le moteur audio
// réel (audioEngine), le publisher LiveKit réel (livekitPublisher + livekitBrowser
// pour Room/LocalAudioTrack/Track/AudioPresets), le contrôleur, la vue, et le
// VU-mètre. Chargé via import() dynamique par src/main.js uniquement sur la
// route /control-room -> le SDK livekit-client n'est jamais téléchargé sur la
// page publique.
//
// Sécurité : aucun secret côté navigateur. Le mot de passe performer est lu dans
// l'<input> et transmis au contrôleur (-> publisher -> tokenClient -> endpoint
// serverless) puis vidé de l'<input> sur succès. Aucune publication / capture
// automatique au chargement : tout démarre sur action utilisateur. beforeunload
// -> destroy() non bloquant.
//
// Exporté : mountControlRoom().

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

export function mountControlRoom() {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return null;

  const mount = doc.body || doc.documentElement;
  const { root, els } = buildControlRoomDOM(doc, mount);
  if (!root) return null;

  // Moteurs réels. audioEngine utilise navigator.mediaDevices + AudioContext du
  // navigateur. publisher injecte Room/LocalAudioTrack/Track.Source.Microphone et
  // le preset musique stéréo haute qualité (128 kbps, DTX off, stéréo forcée).
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

  // --- VU-mètre : rAF en capture, cadence réduite si prefers-reduced-motion ---
  let rafId = null;
  let meterTimer = null;
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

  // --- Rendu : abonnement au snapshot composite (aucune valeur secrète) ---
  function onSnapshot(snap) {
    renderControlRoom(snap, els, { debug });
    updateBroadcastEnabled(els);
    if (snap.audioState === 'capturing') startMeter(); else stopMeter();
    if (debug && debugPre) {
      // Diagnostic : snapshot composite complet (jamais de token/mot de passe/clé).
      debugPre.textContent = JSON.stringify(snap, null, 2);
    }
  }
  controller.subscribe(onSnapshot);

  // --- Câblage des contrôles ---
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
      async onStartBroadcast(password) {
        const r = await controller.startBroadcast(password);
        // Mot de passe vidé de l'<input> sur succès (jamais conservé).
        if (r && r.ok && els.password) { els.password.value = ''; updateBroadcastEnabled(els); }
      },
      async onStopBroadcast() { await controller.stopBroadcast(); },
    },
  });

  // --- Diagnostic ?debug=1 : audio + LiveKit, jamais de token/mot de passe/clé ---
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

  // Première passe.
  onSnapshot(controller.getSnapshot());

  // beforeunload : nettoyage non bloquant, sans fetch supplémentaire.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => { controller.destroy(); }, { once: true });
  }

  return { controller, audioEngine, publisher, els, root };
}