// Etat éphémère de l'image de programme (issue #26). Il ne dépend pas de la
// persistance sound_* : un rechargement de page repart sans image.
import { IMAGE_HEADERS } from '../collabHub/messageRouter.js';

export const IMAGE_DEFAULTS = {
  sound_image_url: '',
  sound_image_visible: 'true',
  sound_image_width: '100%',
  sound_image_height: 'auto',
  sound_image_fit: 'contain',
  sound_image_position: 'center',
  sound_image_slot: 'after_subtitle',
};

export function createImageState(initial = IMAGE_DEFAULTS) {
  const fields = { ...IMAGE_DEFAULTS, ...initial };

  return {
    get(header) { return fields[header]; },
    set(header, value) {
      if (!IMAGE_HEADERS.includes(header)) return false;
      fields[header] = String(value ?? '');
      return true;
    },
    snapshot() { return { ...fields }; },
  };
}
