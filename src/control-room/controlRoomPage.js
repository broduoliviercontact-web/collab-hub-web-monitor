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
// Issue #8 : mountControlRoom() est une racine de composition mince. Les runtimes
// (audio/LiveKit, présence Collab-Hub, boucle VU-mètre, diagnostics) sont extraits
// dans des modules dédiés et injectables (défaut = implémentations réelles) pour
// les tests de caractérisation — aucun effet en production. Les dépendances
// navigateur (doc/loc/win) sont injectables également. Retourne
// { controller, audioEngine, publisher, els, root, destroy } avec destroy()
// idempotent (stoppe meter + présence + contrôleur, retire le DOM).

import '../styles/main.css';
import {
  buildControlRoomDOM,
  renderControlRoom,
  updateBroadcastEnabled,
  wireControlRoom,
} from './controlRoomView.js';
import { createControlRoomRuntime } from './controlRoomRuntime.js';
import { createCollabHubPresenceRuntime } from './collabHubPresenceRuntime.js';
import { createMeterLoop } from './meterLoop.js';
import { createDiagnosticsRenderer } from './controlRoomDiagnostics.js';

export function mountControlRoom(deps = {}) {
  const {
    env = import.meta.env,
    doc = (typeof document !== 'undefined' ? document : null),
    loc = (typeof location !== 'undefined' ? location : { search: '' }),
    win = (typeof window !== 'undefined' ? window : null),
    createRuntime = createControlRoomRuntime,
    createPresence = createCollabHubPresenceRuntime,
    createMeter = createMeterLoop,
    onLogout,
    onSessionExpired,
  } = deps;
  if (!doc) return null;

  const mount = doc.body || doc.documentElement;
  const { root, els } = buildControlRoomDOM(doc, mount);
  if (!root) return null;

  const debug = new URLSearchParams(loc.search).get('debug') === '1';

  // --- Runtime audio local + publication LiveKit (issue #8) ---
  // audioEngine + publisher (piste program-audio, options figées) + contrôleur.
  // Audio-graph inchangé : voir controlRoomRuntime.js (contrat figé issue #8).
  const { audioEngine, publisher, controller } = createRuntime();

  // --- Runtime présence Collab-Hub (issue #8) ---
  // streamPublisher créé synchrone (consommé ci-dessous) ; connexion résout
  // async. Publication désactivée propre avant résolution. Aucun secret.
  const presence = createPresence({ env, debug });

  // --- Boucle du VU-mètre (issue #8) ---
  // rAF nominal, setInterval si prefers-reduced-motion. start/stop idempotents.
  const meter = createMeter({
    controller,
    els,
    streamPublisher: presence.streamPublisher,
  });

  // --- Diagnostics (issue #8) : section debug + renderer ---
  let debugPre = null;
  if (debug) {
    const dbg = doc.createElement('section');
    dbg.className = 'cr-debug';
    const h = doc.createElement('h2'); h.className = 'lk-title'; h.textContent = 'Diagnostic';
    debugPre = doc.createElement('pre'); debugPre.className = 'cr-debug-pre';
    dbg.append(h, debugPre);
    root.append(dbg);
  }
  const renderDiagnostics = createDiagnosticsRenderer({
    streamPublisher: presence.streamPublisher,
    getConn: presence.getConn,
    debugPre,
  });

  // --- Snapshot -> rendu + publication + cycle de vie ---
  let sessionExpiredSignaled = false;
  function onSnapshot(snap) {
    renderControlRoom(snap, els, { debug });
    updateBroadcastEnabled(els);
    if (snap.audioState === 'capturing') meter.start(); else meter.stop();
    // Lot 5 (partie B) : publication immédiate sur toute transition qui n'attend
    // pas le prochain tick du VU-mètre — notamment un changement du compteur
    // d'auditeurs (participantConnected/Disconnected/reconnected -> publisher
    // notify -> controller notify -> ici) ou une transition onAir (start/stop
    // diffusion). streamPublisher.update est idempotent vis-à-vis du throttle ;
    // countChanged/onAirTransition forcent l'émission hors throttle. Le tick du
    // VU-mètre (meter.start) continue à piloter level/peak en continu.
    presence.streamPublisher.update(snap, snap.meter);
    // Expiration de session : le token performer est refusé (401) -> token_unauthorized.
    // On ne signale qu'une fois, puis on rend la main au gate (retour au login).
    if (!sessionExpiredSignaled && snap.error && snap.error.code === 'token_unauthorized') {
      sessionExpiredSignaled = true;
      if (typeof onSessionExpired === 'function') onSessionExpired();
    }
    renderDiagnostics(snap);
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

  onSnapshot(controller.getSnapshot());

  // beforeunload : stoppe publication + contrôleur (non bloquant, sync). Recopié
  // verbatim de l'ancien comportement (controller.destroy sans await).
  if (win) {
    win.addEventListener('beforeunload', () => {
      presence.destroy();
      controller.destroy();
    }, { once: true });
  }

  // Démontage propre (logout / expiration) : stoppe moteurs + retire le DOM.
  // Idempotent (unloaded) — recopié verbatim de l'ancien destroy().
  let unloaded = false;
  async function destroy() {
    if (unloaded) return;
    unloaded = true;
    meter.stop();
    presence.destroy();
    try { await controller.destroy(); } catch {}
    if (root && root.parentNode && typeof root.parentNode.removeChild === 'function') {
      try { root.parentNode.removeChild(root); } catch {}
    }
  }

  return { controller, audioEngine, publisher, els, root, destroy };
}