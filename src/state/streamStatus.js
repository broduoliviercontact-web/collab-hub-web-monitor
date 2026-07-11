// État public du direct (Lot 4G) : statut de présence du flux AVANT connexion
// LiveKit. Pur, horloge injectable -> testable en Node sans Date.now réel. Aucun
// secret, token, cookie ou mot de passe : on ne manipule que des niveaux audio
// normalisés (0..1) et un timestamp public publié par la Control Room.
//
// Contrainte : ne JAMAIS afficher un faux EN DIRECT à partir d'une ancienne
// valeur. Un état est considéré frais uniquement si un header de flux a été reçu
// il y a moins de STALE_MS ; au-delà -> STATUT INDISPONIBLE (on ignore la
// dernière valeur connue, même si elle disait onair=1).

// Headers Collab-Hub publiés par la Control Room (Lot 4G). Publics, sans secret.
// Source de vérité unique : src/collabHub/messageRouter.js (réutilisée par le
// routeur de flux et l'observation côté page publique).
import { STREAM_HEADERS } from '../collabHub/messageRouter.js';
export { STREAM_HEADERS };

// Seuils explicites et testables.
export const STALE_MS = 3000;        // > 3 s sans mise à jour -> INDISPONIBLE
export const SIGNAL_THRESHOLD = 0.01; // RMS > 0.01 = signal présent (documenté)

// États dérivés affichables.
export const STREAM_STATUS = {
  LIVE: 'live',          // EN DIRECT
  OFF_AIR: 'off_air',    // HORS ANTENNE
  UNAVAILABLE: 'unavailable', // STATUT INDISPONIBLE
};

export const STREAM_SIGNAL = {
  PRESENT: 'present',
  SILENT: 'silent',
  NONE: '—',
};

// Bornage 0..1 (niveau audio normalisé). Toute valeur non finie -> 0.
export function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// Normalise un compteur d'auditeurs reçu via Collab-Hub (Lot 5, partie B).
// Règle documentée :
//   - null/undefined/non-fini/négatif -> null (invalide -> "Auditeurs : —") ;
//   - décimal -> entier tronqué vers le bas (Math.floor).
// Retourne donc un entier >= 0, ou null si la valeur est inexploitable.
export function normalizeCount(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

// Formate un compteur d'auditeurs valide (entier >= 0) en libellé public.
// Singulier : "0 auditeur" / "1 auditeur" ; pluriel : "N auditeurs" (N >= 2).
// Ne doit être appelé qu'avec un entier valide ; par sécurité, toute valeur
// non exploitable -> "Auditeurs : —".
export function formatListenerCount(n) {
  if (!Number.isFinite(n) || n < 0) return 'Auditeurs : —';
  return n >= 2 ? `${n} auditeurs` : `${n} auditeur`;
}

// Normalise la valeur reçue d'un header (tableau -> 1er élément, scalaire -> tel
// quel). Retourne null si absent / non scalaire exploitable.
export function parseStreamValue(values) {
  if (Array.isArray(values)) {
    if (values.length === 0) return null;
    return values[0];
  }
  if (values === undefined || values === null) return null;
  return values;
}

// Parse onair : 1 (truthy numérique "1"/1) -> 1, 0 (falsy "0"/0) -> 0, sinon null
// (invalide -> fallback sûr côté compute).
export function parseOnAir(v) {
  if (v === 1 || v === '1' || v === true) return 1;
  if (v === 0 || v === '0' || v === false) return 0;
  return null;
}

// Parse le timestamp : accepte epoch ms (nombre ou chaîne numérique) ou ISO 8601.
// Retourne null si non exploitable.
export function parseTimestamp(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const num = Number(v);
    if (Number.isFinite(num) && v.trim() !== '') return num;
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

// Route un évènement "control" de flux vers l'état streamStatus. Retourne true
// si routé (header de flux), false sinon (header non flux ou data invalide).
// Pure : n'utilise que l'instance `stream` passée (createStreamStatus).
export function routeStreamControl(data, stream) {
  if (!data || typeof data !== 'object') return false;
  const { header } = data;
  if (!STREAM_HEADERS.includes(header)) return false;
  if (typeof stream.ingest !== 'function') return false;
  stream.ingest(header, data.values);
  return true;
}

// Crée un état de flux direct. `now` renvoie l'epoch ms (Date.now par défaut).
// La fraîcheur est mesurée en HORLOGE LOCALE réception (receivedAt) pour rester
// insensible au skew d'horloge entre Control Room et listener ; `updatedAt`
// (timestamp publié) est conservé pour affichage/diagnostic.
export function createStreamStatus({ now = Date.now } = {}) {
  let onAir = null;       // 1 | 0 | null (jamais reçu)
  let level = null;       // 0..1 | null
  let peak = null;        // 0..1 | null
  let updatedAt = null;   // timestamp publié par la Control Room (epoch ms)
  let receivedAt = null;   // heure locale de dernière réception d'un header de flux
  // Lot 5 (partie B) : compteur public d'auditeurs. `listenerCount` = dernier
  // compte valide (entier >= 0) ou null (jamais reçu / invalide). Aucune
  // identité/SID d'auditeur n'est stocké — uniquement le nombre.
  let listenerCount = null;
  let listenerCountReceivedAt = null;
  let rawListenerCount = null;
  // Diagnostic renforcé (hotfix Lot 4G) : compteurs par header, dernier header,
  // dernières valeurs brutes reçues. Aucun secret (valeurs publiques 0..1 / bool / ts).
  const receivedCount = { stream_onair: 0, stream_level: 0, stream_peak: 0, stream_updated_at: 0, stream_listener_count: 0 };
  const rawLastValues = {};
  let lastStreamHeader = null;

  function ingest(header, values) {
    const v = parseStreamValue(values);
    receivedAt = now();
    if (STREAM_HEADERS.includes(header)) {
      receivedCount[header] = (receivedCount[header] || 0) + 1;
      rawLastValues[header] = v;
      lastStreamHeader = header;
    }
    if (header === 'stream_onair') {
      const o = parseOnAir(v);
      if (o !== null) onAir = o;
      // onair invalide -> on conserve la dernière valeur (fallback sûr).
    } else if (header === 'stream_level') {
      level = clamp01(v);
    } else if (header === 'stream_peak') {
      peak = clamp01(v);
    } else if (header === 'stream_updated_at') {
      const ts = parseTimestamp(v);
      if (ts !== null) updatedAt = ts;
    } else if (header === 'stream_listener_count') {
      // Compteur d'auditeurs : valide -> entier ; invalide/négatif -> null
      // (affiché "Auditeurs : —"). Une valeur invalide marque le compte inconnu
      // (on n'affiche JAMAIS un ancien compte comme s'il était frais).
      rawListenerCount = v;
      const n = normalizeCount(v);
      listenerCount = n;
      listenerCountReceivedAt = now();
    }
  }

  function computeSnapshot() {
    const t = now();
    const ageMs = receivedAt === null ? null : t - receivedAt;
    const fresh = receivedAt !== null && ageMs !== null && ageMs <= STALE_MS;

    let status;
    if (!fresh || onAir === null) {
      status = STREAM_STATUS.UNAVAILABLE;
    } else if (onAir === 1) {
      status = STREAM_STATUS.LIVE;
    } else {
      status = STREAM_STATUS.OFF_AIR;
    }

    let signal;
    if (status !== STREAM_STATUS.LIVE) {
      signal = STREAM_SIGNAL.NONE;
    } else if ((level ?? 0) > SIGNAL_THRESHOLD) {
      signal = STREAM_SIGNAL.PRESENT;
    } else {
      signal = STREAM_SIGNAL.SILENT;
    }

    // Lot 5 (partie B) : fraîcheur DU compteur d'auditeurs (horloge locale de
    // réception). On ne publie jamais un compte ancien comme frais : si le
    // header stream_listener_count n'a pas été reçu récemment -> "Auditeurs : —".
    const listenerAgeMs = listenerCountReceivedAt === null ? null : t - listenerCountReceivedAt;
    const listenerCountKnown = listenerCount !== null
      && listenerAgeMs !== null
      && listenerAgeMs <= STALE_MS;
    const listenerCountLabel = listenerCountKnown
      ? formatListenerCount(listenerCount)
      : 'Auditeurs : —';

    return {
      onAir: onAir,
      level: level ?? 0,
      peak: peak ?? 0,
      updatedAt,
      ageMs,
      fresh,
      signalPresent: signal === STREAM_SIGNAL.PRESENT,
      signal,
      computedStatus: status,
      // Compteur public d'auditeurs (Lot 5). Aucune identité/SID exposé.
      listenerCount: listenerCountKnown ? listenerCount : null,
      listenerCountKnown,
      listenerCountLabel,
      listenerCountReceivedAt,
    };
  }

  // Diagnostic renforcé (hotfix Lot 4G) : état d'observation/réception publique.
  // Aucun secret : compteurs, dernier header, heure locale de dernière réception,
  // dernières valeurs brutes. `observedStreamHeaders` est fourni par la page
  // publique (via le guard) et fusionné dans le diagnostic rendu.
  function getDiagnostics() {
    return {
      receivedCount: { ...receivedCount },
      lastStreamHeader,
      lastReceivedAt: receivedAt,
      rawLastValues: { ...rawLastValues },
      // Lot 5 (partie B) : diagnostic du compteur d'auditeurs. Aucune identité/SID.
      rawListenerCount,
      listenerCount,
      listenerCountKnown: listenerCount !== null && listenerCountReceivedAt !== null
        && (now() - listenerCountReceivedAt) <= STALE_MS,
      listenerCountLabel: (listenerCount !== null && listenerCountReceivedAt !== null
        && (now() - listenerCountReceivedAt) <= STALE_MS)
        ? formatListenerCount(listenerCount) : 'Auditeurs : —',
      listenerCountReceivedAt,
    };
  }

  return {
    ingest,
    getSnapshot: computeSnapshot,
    getDiagnostics,
    reset() {
      onAir = null; level = null; peak = null; updatedAt = null; receivedAt = null;
      listenerCount = null; listenerCountReceivedAt = null; rawListenerCount = null;
      for (const k of Object.keys(receivedCount)) receivedCount[k] = 0;
      for (const k of Object.keys(rawLastValues)) delete rawLastValues[k];
      lastStreamHeader = null;
    },
  };
}