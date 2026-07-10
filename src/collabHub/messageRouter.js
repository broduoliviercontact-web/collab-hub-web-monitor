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