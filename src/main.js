// Point d'entrée unique (Lot 4E) : routeur single-entry sur le pathname.
// - /control-room -> Control Room performer (import dynamique : le SDK
//   livekit-client n'est chargé QUE sur cette route, jamais sur la page publique).
// - tout le reste -> page publique (import statique, bundle principal, pas de
//   régression vs Lot 4D). Vercel re écrit /control-room vers /index.html
//   (vercel.json) ; le routage côté client affiche ensuite la bonne page.
import { mountPublicPage } from './publicPage.js';

const route = (location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
if (route === '/control-room') {
  import('./control-room/controlRoomPage.js')
    .then(({ mountControlRoom }) => mountControlRoom())
    .catch((e) => console.error('[Control Room] page indisponible :', e));
} else {
  mountPublicPage();
}