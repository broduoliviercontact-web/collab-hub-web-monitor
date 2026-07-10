// Normalisation des erreurs de capture (Lot 4B). Pur : mappe une exception
// navigateur (DOMException) ou un objet d'erreur vers un code stable + message
// lisible. Aucune valeur secrète, aucun log.

import { ERROR_CODES } from './constants.js';

const PERMISSION_NAMES = new Set([
  'NotAllowedError',
  'PermissionDeniedError',
  'SecurityError',
]);

// Une erreur de permission ne doit jamais être masquée par un fallback.
export function isPermissionError(e) {
  return !!e && PERMISSION_NAMES.has(e?.name);
}

// Une erreur de contraintes justifie un fallback (relâcher les contraintes).
export function isOverconstrainedError(e) {
  return !!e && e?.name === 'OverconstrainedError';
}

// Mappe une erreur brute vers { code, message }. `prefix` optionnel pour le
// contexte (ex. permission vs capture).
export function normalizeCaptureError(e) {
  if (!e) return { code: ERROR_CODES.CAPTURE_FAILED, message: 'Erreur capture inconnue.' };
  const name = e.name || (e instanceof Error ? e.constructor.name : 'Error');
  const msg = typeof e.message === 'string' && e.message ? e.message : `Erreur capture : ${name}`;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return { code: ERROR_CODES.PERMISSION_DENIED, message: 'Permission audio refusée.' };
    case 'SecurityError':
      return { code: ERROR_CODES.PERMISSION_DENIED, message: 'Contexte non sécurisé : HTTPS/localhost requis.' };
    case 'NotFoundError':
      return { code: ERROR_CODES.DEVICE_NOT_FOUND, message: 'Aucun périphérique audio trouvé.' };
    case 'NotReadableError':
      return { code: ERROR_CODES.DEVICE_BUSY, message: 'Périphérique audio illisible (déjà utilisé ?).' };
    case 'OverconstrainedError':
      return { code: ERROR_CODES.CONSTRAINTS_FAILED, message: 'Contraintes audio non satisfaites.' };
    default:
      return { code: ERROR_CODES.CAPTURE_FAILED, message: msg };
  }
}