// Connexion Socket.IO à Collab-Hub. Isole le protocole du reste de l'app.
// Préserve : namespace configurable, fallback anonyme (guest 404 -> anonyme),
// compat serveur 0.3.4, re-observation des headers à chaque (re)connexion.
import { io } from 'socket.io-client';
import { KNOWN_HEADERS } from './messageRouter.js';
import { createObserveGuard, wireSocket } from './observeGuard.js';

const trimSlash = (s) => (s || '').replace(/\/+$/, '');
const stripSlash = (s) => (s || '').replace(/^\/+|\/+$/g, '');

// Tente l'auth invitée ; en cas d'échec/404, renvoie {} (connexion anonyme).
// Comportement hérité du spike (CH-ClientScript.js:133-152) : sur un serveur
// sans /api/v1/auth/guest (ex. public v0.3.4), on retombe sur le socket anonyme.
async function resolveAuth(serverUrl, username) {
  try {
    const res = await fetch(`${trimSlash(serverUrl)}/api/v1/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.accessToken) return { token: data.accessToken };
    }
  } catch {
    /* réseau/CORS bloqué -> fallback anonyme */
  }
  return {};
}

export async function connectCollabHub({ serverUrl, namespace, username, onControl, onStatus }) {
  const base = stripSlash(namespace)
    ? `${trimSlash(serverUrl)}/${stripSlash(namespace)}`
    : trimSlash(serverUrl);

  const auth = await resolveAuth(serverUrl, username);

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