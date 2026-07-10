// État technique de fraîcheur (Lot 3B) : distingue connexion serveur, activité
// Max (heartbeat) et ancienneté du contenu. Pur, horloge injectable -> testable
// en Node sans Date.now réel. Aucune persistance du heartbeat.

// Seuils explicites et testables.
export const MAX_ACTIVE_THRESHOLD_MS = 25000;   // heartbeat reçu depuis < 25 s = Max actif
export const CONTENT_FRESH_THRESHOLD_MS = 300000; // contenu mis à jour depuis < 5 min = récent

export const HEARTBEAT_HEADER = 'sound_heartbeat';

// États de connexion serveur possibles venant de socketClient.
const SERVER_DOWN = new Set(['disconnected', 'error']);

// Crée un état de fraîcheur. `now` renvoie l'epoch ms (Date.now par défaut).
export function createFreshnessState({ now = Date.now } = {}) {
  let serverConnected = false;     // socket Collab-Hub connecté
  let maxLastSeenAt = null;        // epoch ms dernier heartbeat ; null = jamais
  let contentLastUpdatedAt = null; // epoch ms dernière màj d'un champ de contenu

  return {
    setServerStatus(status) { serverConnected = !SERVER_DOWN.has(status); },
    isServerConnected() { return serverConnected; },

    // À la réception d'un heartbeat : on ne touche PAS au contenu.
    onHeartbeat() { maxLastSeenAt = now(); },
    getMaxLastSeenAt() { return maxLastSeenAt; },

    // À la réception d'un champ de contenu : on date la màj.
    onContentUpdate() { contentLastUpdatedAt = now(); },
    getContentLastUpdatedAt() { return contentLastUpdatedAt; },
    // Restauration (Lot 3A) : le contenu restauré est daté depuis localStorage.
    restoreContent(updatedAtMs) { contentLastUpdatedAt = Number.isFinite(updatedAtMs) ? updatedAtMs : null; },

    // Max actif = un heartbeat reçu il y a moins de MAX_ACTIVE_THRESHOLD_MS.
    isMaxActive() { return maxLastSeenAt !== null && (now() - maxLastSeenAt) < MAX_ACTIVE_THRESHOLD_MS; },
    // Contenu récent = mis à jour il y a moins de CONTENT_FRESH_THRESHOLD_MS.
    isContentFresh() { return contentLastUpdatedAt !== null && (now() - contentLastUpdatedAt) < CONTENT_FRESH_THRESHOLD_MS; },

    maxAgeMs() { return maxLastSeenAt === null ? null : now() - maxLastSeenAt; },
    contentAgeMs() { return contentLastUpdatedAt === null ? null : now() - contentLastUpdatedAt; },
  };
}

// Calcule le statut public à partir du statut de connexion serveur et de
// l'activité Max. Le serveur est prioritaire : si déconnecté, on ne montre
// jamais "Max actif/silencieux". Retourne une clé pour renderConnectionStatus.
export function computePublicStatus(connStatus, maxActive) {
  if (connStatus === 'reconnecting') return 'reconnecting';
  if (SERVER_DOWN.has(connStatus)) return 'disconnected';
  // connected
  return maxActive ? 'max_active' : 'max_silent';
}