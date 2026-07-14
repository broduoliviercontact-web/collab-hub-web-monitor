// Runtime image séparé : reçoit les six headers image sans modifier la
// fraîcheur, les textes ni la persistance locale des sound_* éditoriaux.
import { routeImageControl } from '../collabHub/messageRouter.js';
import { createImageState } from '../state/imageState.js';
import { renderSoundImage } from '../ui/renderSoundImage.js';

export function createImageRuntime({ els }) {
  const state = createImageState();
  renderSoundImage(state.snapshot(), els);

  return {
    applyControl(data) {
      return routeImageControl(data, (header, value) => {
        state.set(header, value);
        renderSoundImage(state.snapshot(), els);
      });
    },
    snapshot: () => state.snapshot(),
  };
}
