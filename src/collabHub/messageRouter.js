// Routage des messages Collab-Hub. Pur, sans DOM ni import.meta.env -> testable en node.

export const KNOWN_HEADERS = [
  'sound_title',
  'sound_author',
  'sound_subtitle',
  'sound_description',
  'sound_link',
];

// Header technique (Lot 3B) : heartbeat périodique publié par Max pour signaler
// son activité. Jamais affiché comme contenu, jamais persisté.
export const HEARTBEAT_HEADER = 'sound_heartbeat';

// Headers de flux direct (Lot 4G + Lot 5 compteur auditeurs) : publiés par la
// Control Room pour informer la page publique de la présence du flux AVANT
// connexion LiveKit. Publics, sans secret (aucune identité/SID d'auditeur).
// Non routés par routeControl (réservé aux 5 contenus) -> gérés par
// routeStreamControl (state/streamStatus.js). Non inclus dans OBSERVABLE_HEADERS
// (observation gérée à part, seulement si LiveKit activé).
export const STREAM_HEADERS = [
  'stream_onair',
  'stream_level',
  'stream_peak',
  'stream_updated_at',
  'stream_listener_count',
];

// Tous les headers à observer au démarrage : 5 contenus + le heartbeat.
export const OBSERVABLE_HEADERS = [...KNOWN_HEADERS, HEARTBEAT_HEADER];

// Normalise data.values en chaîne.
// - tableau -> join(' ')
// - scalaire -> String(...)
// - absent (null/undefined) -> ''
export function normalizeValue(values) {
  if (Array.isArray(values)) return values.join(' ');
  if (values === undefined || values === null) return '';
  return String(values);
}

// Route un événement "control". N'appelle onUpdate que pour les headers connus.
// Retourne true si routé, false si ignoré (header inconnu ou data invalide).
export function routeControl(data, onUpdate) {
  if (!data || typeof data !== 'object') return false;
  const { header } = data;
  if (!KNOWN_HEADERS.includes(header)) return false;
  onUpdate(header, normalizeValue(data.values));
  return true;
}