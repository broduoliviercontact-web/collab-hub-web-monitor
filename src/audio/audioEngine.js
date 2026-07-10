// Façade du moteur audio local du performer (Lot 4B). Machine d'état unique,
// une seule capture, un seul graphe Web Audio. Aucune référence LiveKit, aucune
// persistance locale. Dépendances injectables (mediaDevices, AudioContextClass,
// now) -> testable en Node sans navigateur ni périphérique réel.
//
// États : idle -> requesting_permission -> permission_granted -> starting
//   -> capturing -> stopping -> stopped  (et `error` depuis n'importe quel état actif).

import { ENGINE_STATES, ERROR_CODES, GAIN_DEFAULT, GAIN_MIN, GAIN_MAX } from './constants.js';
import {
  requestAudioPermission,
  listAudioInputDevices,
  findPreferredAudioDevice,
  watchAudioDeviceChanges,
} from './audioDevices.js';
import { captureAudio } from './audioCapture.js';
import { createAudioGraph, clampGain } from './audioGraph.js';
import { createAudioMeter } from './audioMeter.js';
import { normalizeCaptureError } from './audioErrors.js';

function defaultMediaDevices() {
  if (typeof navigator !== 'undefined' && navigator.mediaDevices) return navigator.mediaDevices;
  return null;
}
function defaultAudioContextClass() {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  if (typeof webkitAudioContext !== 'undefined') return webkitAudioContext;
  return null;
}

const ACTIVE = new Set(['starting', 'capturing']); // startCapture est un no-op dans ces états
const SILENCE = { rms: 0, peak: 0, db: -Infinity, clipping: false };

export function createAudioEngine({
  mediaDevices = defaultMediaDevices(),
  AudioContextClass = defaultAudioContextClass(),
  now = Date.now,
} = {}) {
  let state = 'idle';
  let error = null;
  let devices = [];
  let selectedDeviceId = null;
  let selectedDeviceLabel = null;
  let gain = GAIN_DEFAULT;

  let capture = null;       // résultat de captureAudio ({stream, track, stop})
  let graph = null;         // résultat de createAudioGraph
  let meter = null;         // résultat de createAudioMeter
  let lastMeter = null;

  let updatedAt = now();
  const listeners = new Set();
  let unsubscribeDeviceChange = null;
  let destroyed = false;

  function setState(next) {
    if (state === next) return;
    state = next;
    updatedAt = now();
    notify();
  }

  function setError(code, message) {
    error = { code, message };
    setState('error');
  }

  function clearError() {
    if (error) error = null;
  }

  function notify() {
    const snap = getSnapshot();
    for (const l of listeners) {
      try { l(snap); } catch { /* un listener ne doit pas casser le moteur */ }
    }
  }

  function hasDevice(deviceId) {
    return devices.some((d) => d.deviceId && d.deviceId === deviceId);
  }

  async function refreshDevices() {
    devices = await listAudioInputDevices(mediaDevices);
    updatedAt = now();
    notify();
  }

  // Gestion de devicechange : rafraîchir, et réagir à la disparition du device
  // sélectionné. Pas de redémarrage automatique de la capture.
  async function onDeviceChange() {
    await refreshDevices();
    const stillThere = selectedDeviceId ? hasDevice(selectedDeviceId) : true;
    if (stillThere) return;
    if (state === 'capturing' || state === 'starting') {
      // Le device sélectionné a disparu pendant la capture -> erreur + arrêt.
      await internalStop();
      setError(ERROR_CODES.DEVICE_NOT_FOUND, 'Périphérique sélectionné déconnecté.');
    } else {
      // En idle : on retombe sur un fallback (sans démarrer de capture).
      const fallback = findPreferredAudioDevice(devices, null);
      selectedDeviceId = fallback ? fallback.deviceId : null;
      selectedDeviceLabel = fallback ? fallback.label : null;
      updatedAt = now();
      notify();
    }
  }

  async function requestPermission() {
    if (destroyed) return;
    clearError();
    setState('requesting_permission');
    try {
      const res = await requestAudioPermission(mediaDevices);
      if (res && res.code === 'ok') {
        await refreshDevices();
        if (!selectedDeviceId) {
          const pref = findPreferredAudioDevice(devices, null);
          selectedDeviceId = pref ? pref.deviceId : null;
          selectedDeviceLabel = pref ? pref.label : null;
        }
        setState('permission_granted');
        return res;
      }
      // Pas de device, mais pas une erreur fatale : on reste permission_granted sans devices.
      await refreshDevices();
      setState('permission_granted');
      return res;
    } catch (e) {
      const err = e && e.code ? e : normalizeCaptureError(e);
      setError(err.code, err.message);
      throw err;
    }
  }

  async function listDevices() {
    await refreshDevices();
    return devices;
  }

  function selectDevice(deviceId) {
    if (destroyed) return;
    selectedDeviceId = deviceId || null;
    const found = devices.find((d) => d.deviceId === deviceId);
    selectedDeviceLabel = found ? found.label : null;
    updatedAt = now();
    notify();
  }

  async function startCapture() {
    if (destroyed) return;
    if (ACTIVE.has(state)) return; // anti double-capture : pas de second stream
    clearError();
    setState('starting');
    try {
      // S'assurer d'avoir une sélection de device (préférée) si vide.
      if (!selectedDeviceId) {
        if (devices.length === 0) await refreshDevices();
        const pref = findPreferredAudioDevice(devices, null);
        selectedDeviceId = pref ? pref.deviceId : null;
        selectedDeviceLabel = pref ? pref.label : null;
      }

      capture = await captureAudio(mediaDevices, selectedDeviceId, {
        onEnded: () => {
          // Fin inattendue de la piste (débranchement, arrêt externe).
          if (state === 'capturing' || state === 'starting') {
            internalStop().then(() => setError(ERROR_CODES.TRACK_ENDED, 'La piste audio s’est arrêtée.'));
          }
        },
      });

      graph = createAudioGraph({ stream: capture.stream, AudioContextClass });
      graph.setGain(gain);
      await graph.resume();
      meter = createAudioMeter(graph.analyserNode);
      lastMeter = meter.read();

      selectedDeviceLabel = (capture.settings && capture.settings.label) || capture.track?.label || selectedDeviceLabel;
      setState('capturing');
    } catch (e) {
      const err = e && e.code ? e : normalizeCaptureError(e);
      await internalStop();
      setError(err.code, err.message);
      throw err;
    }
  }

  // Arrêt interne sans transition d'état visible (utilisé avant error/relance).
  function internalStop() {
    return Promise.resolve().then(() => {
      if (capture) { try { capture.stop(); } catch {} }
      if (graph) { try { graph.close(); } catch {} }
      capture = null;
      graph = null;
      meter = null;
      lastMeter = null;
    });
  }

  // Arrêt public, idempotent.
  async function stopCapture() {
    if (state === 'idle' || state === 'stopped') return;
    setState('stopping');
    await internalStop();
    setState('stopped');
  }

  function setMasterGain(value) {
    gain = clampGain(value);
    if (graph) graph.setGain(gain);
    updatedAt = now();
    notify();
    return gain;
  }

  function readMeter() {
    if (!meter) { lastMeter = SILENCE; return SILENCE; }
    lastMeter = meter.read();
    return lastMeter;
  }

  function getOutputStream() {
    return graph ? graph.outputStream : null;
  }

  function getSnapshot() {
    return {
      state,
      selectedDeviceId,
      selectedDeviceLabel,
      devices: devices.slice(),
      settings: capture ? capture.settings : null,
      gain,
      meter: lastMeter ? { ...lastMeter } : null,
      error: error ? { ...error } : null,
      hasSourceStream: !!(capture && capture.stream),
      hasOutputStream: !!(graph && graph.outputStream),
      updatedAt,
    };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  // Enregistre le listener devicechange une seule fois.
  if (mediaDevices) {
    unsubscribeDeviceChange = watchAudioDeviceChanges(mediaDevices, onDeviceChange);
  }

  async function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (unsubscribeDeviceChange) { try { unsubscribeDeviceChange(); } catch {} unsubscribeDeviceChange = null; }
    await internalStop();
    listeners.clear();
    state = 'stopped';
    updatedAt = now();
  }

  return {
    requestPermission,
    listDevices,
    selectDevice,
    startCapture,
    stopCapture,
    setMasterGain,
    readMeter,
    getOutputStream,
    getSnapshot,
    subscribe,
    destroy,
    // Exposé pour les tests / diagnostic (pas de secret, pas d'objet interne mutable).
    getState: () => state,
  };
}

export { ENGINE_STATES, GAIN_MIN, GAIN_MAX, GAIN_DEFAULT };