// Point d'entrée unique (Lot 4E / 4F.1) : routeur single-entry sur le pathname.
// - /control-room -> gate Control Room (import dynamique : écran de login léger,
//   aucun SDK livekit-client avant authentification). Le SDK lourd + le moteur
//   audio ne sont chargés qu'après login valide (controlRoomPage.js).
// - tout le reste -> page publique (import statique, bundle principal).
import { mountPublicPage } from './publicPage.js';

const route = (location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
if (route === '/control-room') {
  import('./control-room/controlRoomGatePage.js')
    .then(({ mountControlRoomGate }) => mountControlRoomGate())
    .catch((e) => console.error('[Control Room] gate indisponible :', e));
} else {
  mountPublicPage();
}