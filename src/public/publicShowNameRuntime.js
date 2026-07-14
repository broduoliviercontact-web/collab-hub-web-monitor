// Runtime éphémère du placement du nom d'émission, indépendant de sa valeur et
// de sa préférence de visibilité.
import { routeShowNamePositionControl } from '../collabHub/messageRouter.js';
import { placeShowName } from '../ui/placeShowName.js';

export function createShowNamePositionRuntime({ els }) {
  let position = placeShowName('top', els);

  return {
    applyControl(data) {
      return routeShowNamePositionControl(data, (_header, value) => {
        position = placeShowName(value, els);
      });
    },
    snapshot: () => ({ sound_show_name_position: position }),
  };
}
