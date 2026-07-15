// Routage des messages Collab-Hub. Pur, sans DOM ni import.meta.env -> testable en node.

export const KNOWN_HEADERS = [
  'sound_show_name',
  'sound_title',
  'sound_author',
  'sound_subtitle',
  'sound_description',
  'sound_link',
];

// Headers visuels éphémères (issue #26). Ils sont observés comme les contenus,
// mais restent hors de KNOWN_HEADERS : aucune image ni préférence d'affichage ne
// doit être restaurée ou écrite dans localStorage.
export const IMAGE_HEADERS = [
  'sound_image_url',
  'sound_image_visible',
  'sound_image_width',
  'sound_image_height',
  'sound_image_fit',
  'sound_image_position',
  'sound_image_slot',
];

// Préférences d'affichage éphémères des six champs de contenu. Elles ne
// changent jamais le contenu et ne doivent pas être stockées localement.
export const TEXT_VISIBILITY_HEADERS = [
  'sound_show_name_visible',
  'sound_title_visible',
  'sound_author_visible',
  'sound_subtitle_visible',
  'sound_description_visible',
  'sound_link_visible',
];

// Position éphémère du nom d'émission. Elle emploie les mêmes cinq ancres que
// l'image, sans modifier sa valeur ou sa visibilité.
export const SHOW_NAME_POSITION_HEADERS = ['sound_show_name_position'];

// Protocole v2 (issue #42) : huit blocs ordonnables. Les anciens headers
// sound_* restent observés pendant la migration mais ne sont plus requis par
// le nouveau patch Max.
export const BLOCK_IDS = [
  'snd_info_3', 'snd_info_1', 'snd_info_2', 'snd_show',
  'snd_title', 'snd_author', 'snd_img_1', 'snd_img_2',
];
export const BLOCK_TEXT_HEADERS = BLOCK_IDS.slice(0, 6);
export const BLOCK_IMAGE_HEADERS = BLOCK_IDS.slice(6);
export const BLOCK_LAYOUT_HEADERS = ['visibility', 'order'];

// Header technique (Lot 3B) : heartbeat périodique publié par Max pour signaler
// son activité. Jamais affiché comme contenu, jamais persisté.
export const HEARTBEAT_HEADER = 'sound_heartbeat';

// Headers de flux direct (Lot 4G + Lot 5 compteur auditeurs) : publiés par la
// Control Room pour informer la page publique de la présence du flux AVANT
// connexion LiveKit. Publics, sans secret (aucune identité/SID d'auditeur).
// Non routés par routeControl (réservé aux 6 contenus) -> gérés par
// routeStreamControl (state/streamStatus.js). Non inclus dans OBSERVABLE_HEADERS
// (observation gérée à part, seulement si LiveKit activé).
export const STREAM_HEADERS = [
  'stream_onair',
  'stream_level',
  'stream_peak',
  'stream_updated_at',
  'stream_listener_count',
];

// Tous les headers à observer au démarrage : contenus, image éphémère et heartbeat.
export const OBSERVABLE_HEADERS = [
  ...KNOWN_HEADERS, ...IMAGE_HEADERS, ...TEXT_VISIBILITY_HEADERS,
  ...SHOW_NAME_POSITION_HEADERS, ...BLOCK_IDS, ...BLOCK_LAYOUT_HEADERS,
  HEARTBEAT_HEADER,
];

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

// Route un contrôle d'image sans le mélanger aux six contenus persistés.
export function routeImageControl(data, onUpdate) {
  if (!data || typeof data !== 'object') return false;
  const { header } = data;
  if (!IMAGE_HEADERS.includes(header)) return false;
  onUpdate(header, normalizeValue(data.values));
  return true;
}

// Route une préférence de visibilité sans toucher au contenu éditorial ni à sa
// persistance. Les valeurs sont normalisées comme les autres contrôles Max.
export function routeTextVisibilityControl(data, onUpdate) {
  if (!data || typeof data !== 'object') return false;
  const { header } = data;
  if (!TEXT_VISIBILITY_HEADERS.includes(header)) return false;
  onUpdate(header, normalizeValue(data.values));
  return true;
}

export function routeShowNamePositionControl(data, onUpdate) {
  if (!data || typeof data !== 'object') return false;
  const { header } = data;
  if (!SHOW_NAME_POSITION_HEADERS.includes(header)) return false;
  onUpdate(header, normalizeValue(data.values));
  return true;
}

// Route les nouveaux contrôles de bloc sans les confondre avec les six champs
// historiques. Les listes restent brutes : leur validation stricte est faite
// par le runtime de mise en page afin de ne jamais appliquer un état partiel.
export function routeBlockControl(data, onUpdate) {
  if (!data || typeof data !== 'object') return false;
  const { header } = data;
  if (![...BLOCK_IDS, ...BLOCK_LAYOUT_HEADERS].includes(header)) return false;
  onUpdate(header, data.values);
  return true;
}
