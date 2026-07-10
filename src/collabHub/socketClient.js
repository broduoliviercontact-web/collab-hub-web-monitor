// Connexion Socket.IO à Collab-Hub. Isole le protocole du reste de l'app.
// Préserve : namespace configurable, fallback anonyme (guest 404 -> anonyme),
// compat serveur 0.3.4, re-observation des headers à chaque (re)connexion.
import { io } from 'socket.io-client';
import { KNOWN_HEADERS } from './messageRouter.js';
import { createObserveGuard, wireSocket } from './observeGuard.js';
import { resolveAuthMode, resolveAuth, buildSocketUrl } from './authMode.js';

export async function connectCollabHub({ serverUrl, namespace, username, authMode, onControl, onStatus }) {
  const mode = resolveAuthMode(authMode);
  const base = buildSocketUrl(serverUrl, namespace);

  // anonymous : aucune requête /api/v1/auth/guest (mode public v0.3.4).
  // guest : tente le token, retombe sur l'anonyme en cas d'échec.
  const auth = await resolveAuth({ serverUrl, username, authMode: mode });

  const socket = io(base, {
    auth,
    query: { username },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  // Observation idempotente : un header émis une seule fois par socket.id.
  // Voir observeGuard.js. L'état affiché n'est pas effacé -> pas de perte de
  // la dernière valeur lors d'une reconnexion (seul le suivi est vidé).
  const guard = createObserveGuard({ emit: (h) => socket.emit('observeControl', { header: h }) });
  wireSocket(socket, guard, { onStatus, onControl });

  return {
    socket,
    observeHeaderOnce: guard.observeHeaderOnce,
    observeKnownHeadersOnce: () => guard.observeKnownHeadersOnce(KNOWN_HEADERS),
    isObserved: guard.isObserved,
    observedCount: guard.observedCount,
    forget: guard.forget,
  };
}