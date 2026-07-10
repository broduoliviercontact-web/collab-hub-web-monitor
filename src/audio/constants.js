// Constantes du moteur audio local (Lot 4B). Source de vérité unique pour les
// seuils partagés entre modules. Aucune dépendance, aucun DOM.

// Mots-clés indicatifs d'un périphérique audio virtuel (BlackHole n'est qu'un cas).
// Détection douce sur le label — ne doit jamais être la seule source de vérité.
export const VIRTUAL_DEVICE_KEYWORDS = [
  'blackhole',
  'loopback',
  'soundflower',
  'vb-audio',
  'virtual',
];

// Codes d'erreur normalisés (stables pour l'UI/les tests).
export const ERROR_CODES = {
  PERMISSION_DENIED: 'permission_denied',
  DEVICE_NOT_FOUND: 'device_not_found',
  DEVICE_BUSY: 'device_busy',
  CONSTRAINTS_FAILED: 'constraints_failed',
  CAPTURE_FAILED: 'capture_failed',
  TRACK_ENDED: 'track_ended',
};

// Gain master borné [0, 1] : 0 = silence, 1 = niveau source, jamais d'amplification.
export const GAIN_MIN = 0;
export const GAIN_MAX = 1;
export const GAIN_DEFAULT = 1;

// VU-mètre : plancher dBFS et seuil de clipping.
export const METER_DB_FLOOR = -96;
export const METER_CLIP_THRESHOLD = 0.99;

// États de la machine d'état du moteur.
export const ENGINE_STATES = [
  'idle',
  'requesting_permission',
  'permission_granted',
  'starting',
  'capturing',
  'stopping',
  'stopped',
  'error',
];