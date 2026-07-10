// Capture locale getUserMedia (Lot 4B). Construit les contraintes "musique"
// (pas de traitement voix), applique une échelle de fallback, et normalise les
// erreurs. Pur vis-à-vis du DOM : `mediaDevices` injecté.

import { ERROR_CODES } from './constants.js';
import { isPermissionError, isOverconstrainedError, normalizeCaptureError } from './audioErrors.js';

function defaultMediaDevices() {
  if (typeof navigator !== 'undefined' && navigator.mediaDevices) return navigator.mediaDevices;
  return null;
}

// Construit les contraintes complètes (pur). deviceId null/undefined → on laisse
// le navigateur choisir l'entrée par défaut (pas de contrainte exact).
// options.channelCount : absent -> { ideal: 2 } (défaut) ; null -> clé omise
// (fallback quand le navigateur refuse le channelCount) ; autre valeur -> utilisée.
export function buildAudioConstraints(deviceId, options = {}) {
  const hasCC = Object.prototype.hasOwnProperty.call(options, 'channelCount');
  const channelCount = hasCC ? options.channelCount : { ideal: 2 };
  const audio = {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (channelCount !== null && channelCount !== undefined) audio.channelCount = channelCount;
  return { audio, video: false };
}

// Échelle de fallback (du plus contraint au moins contraint). Chaque fonction
// retourne les contraintes à tenter. deviceId est préservé tant que possible.
function constraintLadder(deviceId) {
  return [
    // 1. contraintes complètes (traitement voix OFF, stéréo idéale)
    () => buildAudioConstraints(deviceId, { channelCount: { ideal: 2 } }),
    // 2. retirer channelCount (certains drivers refusent le channelCount idéal)
    () => buildAudioConstraints(deviceId, { channelCount: null }),
    // 3. contraintes simples avec deviceId (sans flags de traitement)
    () => ({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined }, video: false }),
    // 4. audio: true en dernier recours (perte du choix de device)
    () => ({ audio: true, video: false }),
  ];
}

// Démarre getUserMedia avec fallback. Ne masque jamais une erreur de permission.
// Retourne { stream, track, settings, constraintsUsed, stop, onEnded }.
// `onEnded` (optionnel) est appelé si la piste se termine inopinément.
export async function captureAudio(mediaDevices = defaultMediaDevices(), deviceId, { onEnded } = {}) {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    throw { code: ERROR_CODES.CAPTURE_FAILED, message: 'MediaDevices indisponible.' };
  }

  const ladder = constraintLadder(deviceId);
  let lastErr = null;
  let constraintsUsed = null;
  let stream = null;

  for (let i = 0; i < ladder.length; i++) {
    const constraints = ladder[i]();
    try {
      stream = await mediaDevices.getUserMedia(constraints);
      constraintsUsed = constraints;
      break;
    } catch (e) {
      lastErr = e;
      // Permission / sécurité : on ne tente pas de fallback (ne masque pas le refus).
      if (isPermissionError(e)) throw normalizeCaptureError(e);
      // Seules les erreurs de contraintes justifient un fallback.
      if (!isOverconstrainedError(e)) throw normalizeCaptureError(e);
      // Overconstrained : on relâche et on réessaie l'échelon suivant.
    }
  }

  if (!stream) {
    // Échelle épuisée sur des Overconstrained → contraintes non satisfaites.
    throw lastErr && isOverconstrainedError(lastErr)
      ? normalizeCaptureError(lastErr)
      : normalizeCaptureError(lastErr);
  }

  const tracks = stream.getAudioTracks ? stream.getAudioTracks() : stream.getTracks();
  const track = tracks && tracks[0];
  if (!track) {
    try { for (const t of stream.getTracks()) t.stop(); } catch {}
    throw { code: ERROR_CODES.DEVICE_NOT_FOUND, message: 'Aucune piste audio dans le flux capturé.' };
  }

  // Détection de fin inattendue de la piste (débranchement, arrêt externe).
  if (typeof track.addEventListener === 'function') {
    track.addEventListener('ended', () => {
      try { if (typeof onEnded === 'function') onEnded(); } catch {}
    });
  }

  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    try { for (const t of stream.getTracks()) t.stop(); } catch {}
  }

  let settings = {};
  try { settings = (track.getSettings && track.getSettings()) || {}; } catch {}

  return {
    stream,
    track,
    settings,
    constraintsUsed,
    stop,
  };
}