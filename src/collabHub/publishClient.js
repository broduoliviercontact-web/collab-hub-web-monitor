// Connexion Socket.IO à Collab-Hub en mode PUBLICATION (Lot 4G). Côté Control
// Room uniquement : publie les headers de flux direct (stream_onair, stream_level,
// stream_peak, stream_updated_at) pour la page publique. Réutilise la résolution
// d'auth/namespace de authMode.js (même serveur + namespace que la page publique
// -> VITE_COLLAB_HUB_URL / VITE_COLLAB_HUB_NAMESPACE).
//
// Protocole Collab-Hub vérifié (scripts/diagnostics/probe-e2e2.mjs + probe-order
// + mémoire collab-hub-protocol-divergence) : il n'existe PAS d'événement
// registerControl/deliverControl séparé. L'unique événement est
//   socket.emit('control', { mode:'publish', target:'all', header, values })
// avec une sémantique register/deliver : la 1re publication d'un header
// L'ENREGISTRE seulement (availableControls) et ne pousse AUCUNE valeur aux
// observers ; seules les publications SUBSÉQUENTES livrent la valeur (événement
// `control` reçu côté observer). Le patch Max reproduit ce cycle en double
// passage (register immédiat, deliver 300 ms plus tard).
//
// Ce wrapper implémente donc explicitement le cycle register/deliver :
//   1. attendre la connexion socket ;
//   2. enregistrer chaque header une fois (passage register) à la connexion ;
//   3. ne livrer qu'après enregistrement (les publish suivants = deliver) ;
//   4. réenregistrer après reconnexion (l'état serveur a pu repartir) ;
//   5. ne pas réenregistrer à chaque tick (idempotent via Set) ;
//   6. mettre en file d'attente la dernière valeur tant qu'on n'est pas prêt,
//      puis flush après l'enregistrement (délai prudent).
// Aucun secret transmis (valeurs publiques : booléen onair, niveaux 0..1, timestamp).

import { io } from 'socket.io-client';
import { resolveAuthMode, resolveAuth, buildSocketUrl } from './authMode.js';
import { buildSocketOptions } from './config.js';
import { STREAM_HEADERS } from './messageRouter.js';

// Délai prudent entre le publish d'enregistrement (register, 1er -> pas de push)
// et le publish de livraison (deliver, 2e+ -> push aux observers). Le patch Max
// utilise 300 ms ; probe-e2e2 utilise ~1,7 s. On reste réactif (50 ms) : en steady
// state l'enregistrement se fait à la connexion et le 1er tick de capture est déjà
// un publish subséquent (deliver), ce délai ne sert qu'au cas publish-avant-register.
const REGISTER_FLUSH_MS = 50;

export async function connectCollabHubPublisher({
  serverUrl,
  namespace,
  username,
  authMode,
  headers = STREAM_HEADERS,
  debug = false,
  // Injectables pour les tests (aucun effet en production) :
  ioFactory = io,
  now = Date.now,
  setTimeoutFn = setTimeout,
} = {}) {
  const mode = resolveAuthMode(authMode);
  const base = buildSocketUrl(serverUrl, namespace);
  const auth = await resolveAuth({ serverUrl, username, authMode: mode });

  const initialHeaders = Array.isArray(headers) ? headers.slice() : STREAM_HEADERS.slice();
  const registered = new Set();      // headers enregistrés pour ce socket.id
  const pending = new Map();         // header -> dernières valeurs (avant register/connexion)
  const lastPublishedValues = {};
  const publishErrors = [];
  let connected = false;
  let lastRegisterAt = null;
  let lastDeliverAt = null;
  let registerCount = 0;
  let deliverCount = 0;
  let lastError = null;

  const dbg = (...a) => { if (debug) console.log('[CH publisher]', ...a); };

  const socket = ioFactory(base, buildSocketOptions({ auth, username }));

  function emitControl(header, values) {
    try {
      socket.emit('control', { mode: 'publish', target: 'all', header, values });
      return true;
    } catch (e) {
      lastError = (e && e.message) || String(e);
      publishErrors.push(`${new Date(now()).toISOString()} ${lastError}`);
      if (publishErrors.length > 8) publishErrors.shift();
      dbg('emit error', header, lastError);
      return false;
    }
  }

  // Passage REGISTER : 1er publish d'un header -> disponible côté serveur
  // (availableControls), ne pousse PAS aux observers. Idempotent par socket.id
  // (le Set `registered` évite de réenregistrer à chaque tick).
  function registerHeader(header) {
    if (registered.has(header)) return false;
    emitControl(header, [0]); // valeur neutre : le register ne pousse pas aux observers.
    registered.add(header);
    registerCount++;
    dbg('register', header);
    return true;
  }

  function registerInitial() {
    let did = false;
    for (const h of initialHeaders) if (registerHeader(h)) did = true;
    if (did) lastRegisterAt = now();
  }

  // Livraison des valeurs en attente : un publish SUBSÉQUENT au register pousse
  // aux observers. Le register seul ne pousse rien -> délai prudent avant le flush.
  function flushPending() {
    if (!connected) return;
    for (const [h, values] of pending) {
      if (emitControl(h, values)) {
        lastDeliverAt = now();
        deliverCount++;
        lastPublishedValues[h] = values;
        dbg('deliver (flush)', h, values);
      }
    }
    pending.clear();
  }

  socket.on('connect', () => {
    connected = true;
    registered.clear(); // nouveau socket.id -> l'état serveur a pu repartir -> réenregistrer
    dbg('connected', socket.id);
    registerInitial();
    // Flush des valeurs accumulées pendant la déconnexion (livraison après register).
    setTimeoutFn(flushPending, REGISTER_FLUSH_MS);
  });
  socket.on('disconnect', () => {
    connected = false;
    registered.clear(); // re-register au prochain connect
    dbg('disconnected');
  });

  // Publie une valeur pour un header. S'assure que le header est enregistré avant
  // de livrer (cycle register/deliver). Met en file d'attente si pas connecté.
  // Garantit : pas de deliver avant connexion ; pas de re-register à chaque tick ;
  // dernière valeur conservée pendant la déconnexion ; livraison après register.
  function publish(header, values) {
    if (!connected) {
      pending.set(header, values); // conserve la dernière valeur (écrase la précédente)
      dbg('queued (disconnected)', header, values);
      return;
    }
    if (!registered.has(header)) {
      // Pas encore enregistré : register puis livre après délai prudent.
      pending.set(header, values);
      registerHeader(header);
      lastRegisterAt = now();
      setTimeoutFn(flushPending, REGISTER_FLUSH_MS);
      return;
    }
    // Déjà enregistré : ce publish est une livraison (2e+) -> pousse aux observers.
    if (emitControl(header, values)) {
      lastDeliverAt = now();
      deliverCount++;
      lastPublishedValues[header] = values;
      dbg('deliver', header, values);
    }
  }

  function getDiagnostics() {
    return {
      connected,
      socketId: socket.id || null,
      registeredHeaders: [...registered],
      pendingHeaders: [...pending.keys()],
      lastRegisterAt,
      lastDeliverAt,
      registerCount,
      deliverCount,
      publishErrors: publishErrors.slice(),
      lastPublishedValues: { ...lastPublishedValues },
      lastError,
    };
  }

  return {
    socket,
    publish,
    isConnected: () => socket.connected,
    isRegistered: (h) => registered.has(h),
    getDiagnostics,
    destroy() { try { socket.disconnect(); } catch { /* idempotent */ } },
  };
}