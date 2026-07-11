// Bandeau santé du panneau d'exploitation. PUR, sans DOM ni horloge -> testable.
//
// deriveSystemHealth({ collabHub, maxFreshness, liveKit, streamStatus }) calcule
// un résumé compact lisible en < 3 s : un état par sous-système + un état global.
// Aucune identité/SID/token n'entre ici (les entrées ne contiennent que des
// statuts/booléens/états).
//
// Entrées (toutes optionnelles, forme plateau -> testable) :
//   collabHub     : 'connected' | 'reconnecting' | 'disconnected' | 'error' | null
//   maxFreshness  : { active: bool, everSeen: bool }
//   liveKit       : { enabled: bool, state: string }
//   streamStatus  : { received: bool, fresh: bool }
//
// Sortie : { collabHub, max, liveKit, stream, global } (libellés ci-dessous).

export const HEALTH = {
  COLLAB_HUB: { OK: 'OK', RECONNECTING: 'RECONNEXION', ERREUR: 'ERREUR', HORS_LIGNE: 'HORS LIGNE' },
  MAX: { ACTIF: 'ACTIF', SILENCIEUX: 'SILENCIEUX', JAMAIS_VU: 'JAMAIS VU' },
  LIVEKIT: {
    PLAYING: 'PLAYING',
    ATTENTE_PISTE: 'ATTENTE PISTE',
    ATTENTE_UTILISATEUR: 'ATTENTE UTILISATEUR',
    CONNEXION: 'CONNEXION',
    ERREUR: 'ERREUR',
    INACTIF: 'INACTIF',
  },
  STREAM: { FRAIS: 'FRAIS', STALE: 'STALE', INDISPONIBLE: 'INDISPONIBLE' },
  GLOBAL: { OPERATIONNEL: 'OPÉRATIONNEL', DEGRADE: 'DÉGRADÉ', ERREUR: 'ERREUR' },
};

function deriveCollabHub(s) {
  if (s === 'connected') return HEALTH.COLLAB_HUB.OK;
  if (s === 'reconnecting') return HEALTH.COLLAB_HUB.RECONNECTING;
  if (s === 'error') return HEALTH.COLLAB_HUB.ERREUR;
  return HEALTH.COLLAB_HUB.HORS_LIGNE; // disconnected / null / inconnu
}

function deriveMax(m) {
  const mf = m || {};
  if (mf.active) return HEALTH.MAX.ACTIF;
  if (mf.everSeen) return HEALTH.MAX.SILENCIEUX;
  return HEALTH.MAX.JAMAIS_VU;
}

const LK_CONNEXION = new Set(['requesting_token', 'connecting', 'connected', 'reconnecting']);
const LK_ATTENTE_PISTE = new Set(['waiting_for_track', 'track_available']);

function deriveLiveKit(lk) {
  const l = lk || {};
  if (!l.enabled) return HEALTH.LIVEKIT.INACTIF;
  const st = l.state;
  if (st === 'playing') return HEALTH.LIVEKIT.PLAYING;
  if (st === 'waiting_for_user') return HEALTH.LIVEKIT.ATTENTE_UTILISATEUR;
  if (LK_ATTENTE_PISTE.has(st)) return HEALTH.LIVEKIT.ATTENTE_PISTE;
  if (LK_CONNEXION.has(st)) return HEALTH.LIVEKIT.CONNEXION;
  if (st === 'error') return HEALTH.LIVEKIT.ERREUR;
  return HEALTH.LIVEKIT.INACTIF; // idle / stopped / stopping / inconnu
}

function deriveStream(ss) {
  const s = ss || {};
  if (!s.received) return HEALTH.STREAM.INDISPONIBLE;
  return s.fresh ? HEALTH.STREAM.FRAIS : HEALTH.STREAM.STALE;
}

// Sévérité par sous-système : 0 = nominal, 1 = dégradé, 2 = inaccessible, 3 = erreur.
// INACTIF LiveKit = 0 (nominal : auditeur public non connecté).
function severities(h) {
  const ch = { OK: 0, RECONNEXION: 1, HORS_LIGNE: 2, ERREUR: 3 }[h.collabHub] ?? 2;
  const mx = { ACTIF: 0, SILENCIEUX: 1, JAMAIS_VU: 1 }[h.max] ?? 1;
  const lk = {
    PLAYING: 0, INACTIF: 0, ATTENTE_PISTE: 1, ATTENTE_UTILISATEUR: 1,
    CONNEXION: 1, ERREUR: 3,
  }[h.liveKit] ?? 1;
  const st = { FRAIS: 0, STALE: 1, INDISPONIBLE: 1 }[h.stream] ?? 1;
  return [ch, mx, lk, st];
}

function deriveGlobal(h) {
  const sevs = severities(h);
  if (sevs.some((s) => s >= 3)) return HEALTH.GLOBAL.ERREUR;
  if (sevs.some((s) => s >= 1)) return HEALTH.GLOBAL.DEGRADE;
  return HEALTH.GLOBAL.OPERATIONNEL;
}

export function deriveSystemHealth({ collabHub, maxFreshness, liveKit, streamStatus } = {}) {
  const h = {
    collabHub: deriveCollabHub(collabHub),
    max: deriveMax(maxFreshness),
    liveKit: deriveLiveKit(liveKit),
    stream: deriveStream(streamStatus),
  };
  h.global = deriveGlobal(h);
  return h;
}