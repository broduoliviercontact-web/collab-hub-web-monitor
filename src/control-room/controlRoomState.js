// État composite de la Control Room performer (Lot 4E) — PUR, testable, sans
// DOM ni LiveKit. Dérive un état unique à partir de l'état du moteur audio
// (audioEngine) et du publisher (livekitPublisher), plus les libellés de statut
// et les messages d'erreur en français. Aucune valeur secrète (token, mot de
// passe, clé) n'apparaît jamais ici : on ne manipule que des codes/états.

// États composites (§5) : couvrent tout le cycle permission -> capture ->
// diffusion -> arrêt, plus reconnecting/error.
export const COMPOSITE_STATES = [
  'idle',
  'requesting_permission',
  'permission_granted',
  'selecting_device',
  'starting_capture',
  'capturing',
  'requesting_token',
  'connecting',
  'publishing',
  'live',
  'reconnecting',
  'stopping',
  'stopped',
  'error',
];

// Map d'état publisher -> état composite (prioritaire tant que la diffusion est
// active / en cours / en arrêt).
const PUB_MAP = {
  requesting_token: 'requesting_token',
  connecting: 'connecting',
  connected: 'publishing',
  publishing: 'publishing',
  live: 'live',
  reconnecting: 'reconnecting',
  stopping: 'stopping',
};

// Map d'état audio -> état composite (utilisée quand le publisher est idle /
// stopped / error-avec-capture-préservée).
const AUDIO_MAP = {
  idle: 'idle',
  requesting_permission: 'requesting_permission',
  permission_granted: 'permission_granted',
  starting: 'starting_capture',
  capturing: 'capturing',
  stopping: 'stopping',
  stopped: 'stopped',
};

// État composite unique. `hasDevices` distingue permission_granted (device dispo)
// de selecting_device (permission ok mais aucune source à choisir).
export function deriveCompositeState(audioState, pubState, hasDevices = false) {
  if (pubState === 'error' || audioState === 'error') return 'error';
  if (Object.prototype.hasOwnProperty.call(PUB_MAP, pubState)) return PUB_MAP[pubState];
  if (audioState === 'permission_granted') {
    return hasDevices ? 'permission_granted' : 'selecting_device';
  }
  if (Object.prototype.hasOwnProperty.call(AUDIO_MAP, audioState)) return AUDIO_MAP[audioState];
  return 'idle';
}

// Libellé de statut de diffusion (§15). ON AIR uniquement quand composite==='live'.
const BROADCAST_LABELS = {
  live: 'ON AIR',
  reconnecting: 'RECONNEXION…',
  requesting_token: 'CONNEXION…',
  connecting: 'CONNEXION…',
  publishing: 'CONNEXION…',
  stopping: 'ARRÊT…',
  error: 'ERREUR',
  idle: 'HORS ANTENNE',
  stopped: 'HORS ANTENNE',
  requesting_permission: 'HORS ANTENNE',
  permission_granted: 'HORS ANTENNE',
  selecting_device: 'HORS ANTENNE',
  starting_capture: 'HORS ANTENNE',
  capturing: 'HORS ANTENNE',
};

export function broadcastStatus(composite) {
  return BROADCAST_LABELS[composite] || 'HORS ANTENNE';
}

export function isOnAir(composite) {
  return composite === 'live';
}

// Classe du point de statut (réutilise .status-dot du thème).
const DOT_CLASS = {
  live: 'is-ok',
  reconnecting: 'is-wait',
  requesting_token: 'is-wait',
  connecting: 'is-wait',
  publishing: 'is-wait',
  stopping: 'is-wait',
  starting_capture: 'is-wait',
  requesting_permission: 'is-wait',
  error: 'is-off',
  idle: 'is-off',
  stopped: 'is-off',
  permission_granted: 'is-off',
  selecting_device: 'is-off',
  capturing: 'is-off',
};

export function broadcastDotClass(composite) {
  return `status-dot ${DOT_CLASS[composite] || 'is-off'}`;
}

// Niveau de permission micro (dérivé de l'état audio + erreur).
export function derivePermission(audioState, error) {
  if (audioState === 'requesting_permission') return 'requesting';
  if (error && error.code === 'permission_denied') return 'denied';
  if (audioState === 'permission_granted' || audioState === 'starting' ||
      audioState === 'capturing' || audioState === 'stopping' || audioState === 'stopped') {
    return 'granted';
  }
  return 'not_requested';
}

// Messages d'erreur en français (§18). Aucune valeur secrète.
const ERROR_MESSAGES = {
  // moteur audio (Lot 4B)
  permission_denied: 'Micro refusé : autorisez l’accès au microphone dans le navigateur.',
  device_not_found: 'Périphérique audio introuvable (débranché ?).',
  device_busy: 'Périphérique audio occupé par une autre application.',
  constraints_failed: 'Contraintes audio non satisfaites (sample rate / canaux).',
  capture_failed: 'Échec de la capture audio.',
  track_ended: 'La piste audio s’est arrêtée.',
  // publisher / token (Lot 4C)
  no_output_stream: 'Aucun flux de capture — démarrez la capture d’abord.',
  no_audio_track: 'Aucune piste audio live dans le flux de capture.',
  token_unauthorized: 'Mot de passe incorrect.',
  token_unavailable: 'Service LiveKit indisponible (réessayez plus tard).',
  token_invalid_response: 'Réponse du service LiveKit invalide.',
  token_network_error: 'Erreur réseau lors de la demande de token.',
  token_timeout: 'Délai dépassé pour la demande de token.',
  token_failed: 'Échec d’authentification LiveKit.',
  connect_failed: 'Échec de connexion à la room LiveKit.',
  publish_failed: 'Échec de publication de la piste audio.',
  disconnected: 'Connexion LiveKit perdue.',
  publisher_failed: 'Erreur du publisher.',
  publisher_busy: 'Diffusion déjà active.',
  no_password: 'Saisissez le mot de passe performer.',
};

export function describeError(code) {
  return ERROR_MESSAGES[code] || 'Erreur inconnue.';
}

// États publisher actifs (pas de startBroadcast possible / garde double-clic).
export const PUBLISHER_ACTIVE = new Set([
  'requesting_token', 'connecting', 'connected', 'publishing', 'live', 'reconnecting',
]);