// Runtime des cinq préférences d'affichage texte, indépendant du contenu et de
// sa persistance. Une nouvelle valeur texte repasse ici pour respecter un champ
// déjà masqué ; réactiver un lien relance son rendu sûr avant de l'afficher.
import { routeTextVisibilityControl } from '../collabHub/messageRouter.js';
import { createTextVisibilityState } from '../state/textVisibilityState.js';
import {
  contentHeaderForVisibility, parseTextVisible, renderTextVisibility,
} from '../ui/renderTextVisibility.js';

export function createTextVisibilityRuntime({ els }) {
  const state = createTextVisibilityState();

  return {
    applyControl(data, rerenderContent = () => {}) {
      return routeTextVisibilityControl(data, (header, value) => {
        state.set(header, value);
        const contentHeader = contentHeaderForVisibility(header);
        // Le lien décide lui-même s'il est valide/vide : on le rerend avant de
        // lever son masquage explicite afin de ne jamais révéler un lien vide.
        if (parseTextVisible(value) && contentHeader === 'sound_link') rerenderContent(contentHeader);
        renderTextVisibility(state.snapshot(), els, contentHeader);
      });
    },
    applyForContent(contentHeader) {
      return renderTextVisibility(state.snapshot(), els, contentHeader);
    },
    snapshot: () => state.snapshot(),
  };
}
