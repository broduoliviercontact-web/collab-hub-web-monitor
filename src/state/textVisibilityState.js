// Etat éphémère des options afficher/masquer des champs éditoriaux. Les textes
// restent dans soundState ; ces préférences repartent à true après rechargement.
import { TEXT_VISIBILITY_HEADERS } from '../collabHub/messageRouter.js';

export const TEXT_VISIBILITY_DEFAULTS = {
  sound_show_name_visible: 'true',
  sound_title_visible: 'true',
  sound_author_visible: 'true',
  sound_subtitle_visible: 'true',
  sound_description_visible: 'true',
  sound_link_visible: 'true',
};

export function createTextVisibilityState(initial = TEXT_VISIBILITY_DEFAULTS) {
  const fields = { ...TEXT_VISIBILITY_DEFAULTS, ...initial };

  return {
    get(header) { return fields[header]; },
    set(header, value) {
      if (!TEXT_VISIBILITY_HEADERS.includes(header)) return false;
      fields[header] = String(value ?? '');
      return true;
    },
    snapshot() { return { ...fields }; },
  };
}
