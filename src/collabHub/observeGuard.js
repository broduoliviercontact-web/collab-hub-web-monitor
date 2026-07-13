// Suivi idempotent de l'observation des headers, par connexion Socket.IO.
// Pur (aucun import io / DOM / import.meta.env) -> testable en Node.
//
// Règle : un header n'est émis (observeControl) qu'une seule fois par
// connexion (socket.id). Le suivi est vidé lors d'un vrai disconnect ;
// après un nouveau connect, on réobserve exactement une fois les headers.
import { KNOWN_HEADERS, OBSERVABLE_HEADERS } from './messageRouter.js';

export function createObserveGuard({ emit }) {
  const observed = new Set();
  let connected = false;

  // Émet observeControl pour `header` ssi connecté ET pas déjà observé.
  const observeHeaderOnce = (header) => {
    if (!connected) return false;
    if (observed.has(header)) return false;
    emit(header);
    observed.add(header);
    return true;
  };

  return {
    // connected=true : prêt à observer. connected=false : vrai disconnect -> on vide.
    setConnected(c) { connected = c; if (!c) observed.clear(); },
    observeHeaderOnce,
    observeKnownHeadersOnce(headers = KNOWN_HEADERS) { return headers.map(observeHeaderOnce); },
    // Permet de réobserver après un unobserve explicite (diagnostic).
    forget(header) { observed.delete(header); },
    isObserved: (h) => observed.has(h),
    observedCount: () => observed.size,
    observedHeaders: () => [...observed],
    reset() { observed.clear(); },
  };
}

// Câble UNE seule fois chaque listener sur le socket. Pas de listener
// dupliqué connect/control. La réobservation est idempotent via le guard.
export function wireSocket(socket, guard, { onStatus, onControl }) {
  // Ordre important : observer AVANT onStatus('connected') pour que le
  // diagnostic (notifié via onStatus) voie déjà les 5 headers observés.
  const onConnect = () => {
    guard.setConnected(true);
    // Observe les 5 contenus + le heartbeat (Lot 3B).
    guard.observeKnownHeadersOnce(OBSERVABLE_HEADERS);
    onStatus('connected');
  };
  socket.on('connect', onConnect);
  socket.on('reconnect', onConnect); // reconnect -> disconnect a vidé le guard -> idempotent
  socket.on('reconnect_attempt', () => onStatus('reconnecting'));
  socket.on('disconnect', () => { guard.setConnected(false); onStatus('disconnected'); });
  socket.on('connect_error', () => onStatus('error'));
  socket.on('control', onControl);
  return socket;
}