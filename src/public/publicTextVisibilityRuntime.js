// Runtime des six préférences d'affichage texte, indépendant du contenu et de
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
        // Le lien et le nom du show décident eux-mêmes s'ils ont une valeur : on
        // les rerend avant de lever leur masquage explicite pour ne jamais
        // révéler de conteneur vide.
        if (parseTextVisible(value) && ['sound_link', 'sound_show_name'].includes(contentHeader)) rerenderContent(contentHeader);
        renderTextVisibility(state.snapshot(), els, contentHeader);
      });
    },
    applyForContent(contentHeader) {
      return renderTextVisibility(state.snapshot(), els, contentHeader);
    },
    snapshot: () => state.snapshot(),
  };
}
