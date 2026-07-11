// Connexion Socket.IO à Collab-Hub en mode PUBLICATION (Lot 4G). Côté Control
// Room uniquement : publie les headers de flux direct (stream_onair, stream_level,
// stream_peak, stream_updated_at) pour la page publique. Réutilise la résolution
// d'auth/namespace de authMode.js (même serveur + namespace que la page publique
// -> VITE_COLLAB_HUB_URL / VITE_COLLAB_HUB_NAMESPACE).
//
// Aucune logique métier ici : wrapper fin autour de io() + emit('control', ...).
// Le protocole Collab-Hub (register/deliver) : la 1re publication enregistre le
// header, les suivantes poussent la valeur aux observateurs (cf.
// scripts/diagnostics/probe-e2e2.mjs). Aucun secret transmis (valeurs publiques).

import { io } from 'socket.io-client';
import { resolveAuthMode, resolveAuth, buildSocketUrl } from './authMode.js';

export async function connectCollabHubPublisher({ serverUrl, namespace, username, authMode } = {}) {
  const mode = resolveAuthMode(authMode);
  const base = buildSocketUrl(serverUrl, namespace);
  const auth = await resolveAuth({ serverUrl, username, authMode: mode });

  const socket = io(base, {
    auth,
    query: { username },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  return {
    socket,
    // Publie un header de flux vers tous les observateurs (target:'all').
    publish(header, values) {
      socket.emit('control', { mode: 'publish', target: 'all', header, values });
    },
    isConnected: () => socket.connected,
    destroy() { try { socket.disconnect(); } catch { /* idempotent */ } },
  };
}