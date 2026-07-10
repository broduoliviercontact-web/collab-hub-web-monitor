// État courant des cinq champs. Pur, testable en node.
import { KNOWN_HEADERS } from '../collabHub/messageRouter.js';

export const DEFAULTS = Object.freeze({
  sound_title: 'En attente du prochain morceau',
  sound_author: 'Auteur inconnu',
  sound_subtitle: 'Connexion à Collab-Hub…',
  sound_description: 'Les informations seront mises à jour depuis Max.',
  sound_link: '',
});

export function createSoundState(initial = DEFAULTS) {
  const state = { ...initial };
  return {
    get: (header) => state[header],
    // Ne modifie que les headers connus ; renvoie true si changé.
    set: (header, value) => {
      if (!KNOWN_HEADERS.includes(header)) return false;
      state[header] = value;
      return true;
    },
    snapshot: () => ({ ...state }),
  };
}