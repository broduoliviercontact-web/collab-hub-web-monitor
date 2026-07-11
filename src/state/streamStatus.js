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

  function ingest(header, values) {
    const v = parseStreamValue(values);
    receivedAt = now();
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
    };
  }

  return {
    ingest,
    getSnapshot: computeSnapshot,
    reset() { onAir = null; level = null; peak = null; updatedAt = null; receivedAt = null; },
  };
}