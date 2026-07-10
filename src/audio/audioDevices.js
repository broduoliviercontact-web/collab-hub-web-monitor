// Accès aux périphériques audio d'entrée (Lot 4B). Pur vis-à-vis du DOM : un
// objet `mediaDevices` (navigator.mediaDevices en prod, un faux en tests) est
// injecté en paramètre. Aucune persistance de permission.

import { VIRTUAL_DEVICE_KEYWORDS } from './constants.js';
import { isPermissionError, normalizeCaptureError } from './audioErrors.js';

// Récupère l'objet mediaDevices global (peut être absent en Node / contexte non
// sécurisé). Utilisé comme défaut quand l'appelant n'injecte rien.
function defaultMediaDevices() {
  if (typeof navigator !== 'undefined' && navigator.mediaDevices) return navigator.mediaDevices;
  return null;
}

// Un label évoque-t-il un périphérique virtuel ? Détection indicative.
export function isVirtualDevice(label) {
  if (!label) return false;
  const l = label.toLowerCase();
  return VIRTUAL_DEVICE_KEYWORDS.some((k) => l.includes(k));
}

// Un device est-il l'entrée par défaut du système ? Chrome expose deviceId
// 'default' (et '') ; le label contient souvent 'Default'.
export function isDefaultDevice(raw) {
  if (!raw) return false;
  if (raw.deviceId === 'default' || raw.deviceId === '') return true;
  return typeof raw.label === 'string' && /default|par défaut|par defaut/i.test(raw.label);
}

// Normalise un MediaDeviceInfo brut vers la structure publique du moteur.
export function normalizeDevice(raw) {
  if (!raw) return null;
  const label = raw.label || '(sans nom)';
  return {
    deviceId: raw.deviceId || '',
    groupId: raw.groupId || '',
    label,
    isDefault: isDefaultDevice(raw),
    isVirtual: isVirtualDevice(label),
  };
}

// Débloque la permission micro + les labels devices via un stream jetable, dont
// on stoppe immédiatement toutes les pistes. Ne conserve aucun flux.
// Lance une erreur normalisée en cas de refus (jamais masquée par l'appelant).
export async function requestAudioPermission(mediaDevices = defaultMediaDevices()) {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    return { code: 'unsupported', message: 'MediaDevices indisponible.' };
  }
  let stream;
  try {
    stream = await mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    if (isPermissionError(e)) throw normalizeCaptureError(e);
    // En l'absence de device, on renvoie un résultat non-fatal (pas une permission).
    if (e?.name === 'NotFoundError') return { code: 'no_device', message: 'Aucun périphérique audio.' };
    throw normalizeCaptureError(e);
  }
  try {
    for (const t of stream.getTracks()) t.stop();
  } catch {
    //.stop peut échouer si déjà stoppé — on ignore.
  }
  return { code: 'ok' };
}

// Énumère uniquement les entrées audio (kind === "audioinput"), normalisées.
export async function listAudioInputDevices(mediaDevices = defaultMediaDevices()) {
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') return [];
  let devices = [];
  try {
    devices = await mediaDevices.enumerateDevices();
  } catch {
    return [];
  }
  return devices
    .filter((d) => d && d.kind === 'audioinput')
    .map(normalizeDevice)
    .filter(Boolean);
}

// Présélection d'entrée par priorité :
// 1. deviceId précédemment sélectionné s'il existe encore ;
// 2. périphérique virtuel ;
// 3. périphérique par défaut ;
// 4. première entrée disponible.
// Retourne le device normalisé ou null.
export function findPreferredAudioDevice(devices, preferredDeviceId = null) {
  if (!Array.isArray(devices) || devices.length === 0) return null;
  if (preferredDeviceId) {
    const prev = devices.find((d) => d.deviceId && d.deviceId === preferredDeviceId);
    if (prev) return prev;
  }
  const virtual = devices.find((d) => d.isVirtual);
  if (virtual) return virtual;
  const def = devices.find((d) => d.isDefault);
  if (def) return def;
  return devices[0];
}

// Abonne un listener à l'événement `devicechange`. Retourne une fonction de
// désabonnement. Ne lève pas si addEventListener est absent (Safari ancien).
export function watchAudioDeviceChanges(mediaDevices = defaultMediaDevices(), onChange) {
  if (!mediaDevices || typeof mediaDevices.addEventListener !== 'function' || typeof onChange !== 'function') {
    return () => {};
  }
  const handler = () => {
    try { onChange(); } catch { /* un listener ne doit pas casser le moteur */ }
  };
  mediaDevices.addEventListener('devicechange', handler);
  return function unsubscribe() {
    if (typeof mediaDevices.removeEventListener === 'function') {
      mediaDevices.removeEventListener('devicechange', handler);
    }
  };
}