// Suivi par header pour le tableau d'exploitation (Lot Ops Debug). PUR, horloge
// injectable -> testable en Node. Aucune identité/SID/token : on ne stocke que
// des compteurs, horodatages et la dernière valeur brute reçue par header.
//
// `createHeaderTracker({ now })` enregistre chaque contrôle reçu et expose les
// stats nécessaires au tableau (reçu ?, compteur, dernière réception, âge, valeur
// brute). `deriveHeadersTable` fusionne ces stats avec l'ensemble des headers
// observés pour produire les lignes du tableau (statut OK/JAMAIS REÇU/STALE/NON
// OBSERVÉ, valeur brute tronquée visuellement).

import {
  MAX_ACTIVE_THRESHOLD_MS,
  CONTENT_FRESH_THRESHOLD_MS,
} from '../state/freshness.js';
import { STALE_MS } from '../state/streamStatus.js';
import { IMAGE_HEADERS, TEXT_VISIBILITY_HEADERS } from '../collabHub/messageRouter.js';

// Seuil de péremption par header. Les headers de flux (stream_*) sont périmés
// après STALE_MS (3 s, spec Lot 4G). Le heartbeat Max après 25 s (activité Max).
// Les 6 contenus après 5 min (fraîcheur contenu). Ces seuils sont les mêmes que
// ceux utilisés par freshness.js / streamStatus.js -> cohérence avec le reste.
const CONTENT_HEADERS = new Set([
  'sound_show_name', 'sound_title', 'sound_author', 'sound_subtitle', 'sound_description', 'sound_link',
]);

export function thresholdFor(header) {
  if (header === 'sound_heartbeat') return MAX_ACTIVE_THRESHOLD_MS;
  if (typeof header === 'string' && header.startsWith('stream_')) return STALE_MS;
  if (CONTENT_HEADERS.has(header)) return CONTENT_FRESH_THRESHOLD_MS;
  return CONTENT_FRESH_THRESHOLD_MS; // défaut prudent (5 min)
}

export const HEADERS_TABLE = [
  'sound_show_name',
  'sound_title',
  'sound_author',
  'sound_subtitle',
  'sound_description',
  'sound_link',
  ...IMAGE_HEADERS,
  ...TEXT_VISIBILITY_HEADERS,
  'sound_heartbeat',
  'stream_onair',
  'stream_level',
  'stream_peak',
  'stream_updated_at',
  'stream_listener_count',
];

export const HEADER_STATUS = {
  OK: 'OK',
  JAMAIS_RECU: 'JAMAIS REÇU',
  STALE: 'STALE',
  NON_OBSERVE: 'NON OBSERVÉ',
};

// Longueur max de l'aperçu de la valeur brute affiché dans le tableau. La valeur
// COMPLÈTE n'est conservée que dans l'export JSON (sécurisé par sanitizer).
export const RAW_PREVIEW_MAX = 40;

export function truncateRaw(value) {
  if (value === null || value === undefined) return '—';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (s.length <= RAW_PREVIEW_MAX) return s;
  return s.slice(0, RAW_PREVIEW_MAX) + '…';
}

export function createHeaderTracker({ now = Date.now } = {}) {
  const count = Object.create(null);
  const lastReceivedAt = Object.create(null);
  const rawValue = Object.create(null);

  function record(header, value) {
    if (typeof header !== 'string' || header === '') return;
    count[header] = (count[header] || 0) + 1;
    lastReceivedAt[header] = now();
    rawValue[header] = value;
  }

  function getStats() {
    const t = now();
    const out = Object.create(null);
    for (const h of HEADERS_TABLE) {
      const c = count[h] || 0;
      const last = lastReceivedAt[h] || null;
      const age = last === null ? null : t - last;
      out[h] = {
        received: c > 0,
        count: c,
        lastReceivedAt: last,
        ageMs: age,
        rawValue: c > 0 ? rawValue[h] : null,
      };
    }
    return out;
  }

  function clear() {
    for (const k of Object.keys(count)) delete count[k];
    for (const k of Object.keys(lastReceivedAt)) delete lastReceivedAt[k];
    for (const k of Object.keys(rawValue)) delete rawValue[k];
  }

  return { record, getStats, clear };
}

// Construit les lignes du tableau. `observed` = ensemble/Set des headers
// actuellement observés (isObserved). `stats` = tracker.getStats(). `streamStats`
// (optionnel) = stats de flux (streamStatus.getDiagnostics()) qui peuvent
// compléter/comparer les compteurs de réception des headers stream_*.
export function deriveHeadersTable({
  headers = HEADERS_TABLE,
  stats = {},
  observed = null,
  now: nowFn = Date.now,
  streamStats = null,
} = {}) {
  const t = nowFn();
  const obsSet = observed instanceof Set ? observed : new Set(observed || []);
  return headers.map((header) => {
    const s = stats[header] || { received: false, count: 0, lastReceivedAt: null, ageMs: null, rawValue: null };
    // Pour les headers stream_*, on croise avec streamStats (source de vérité
    // côté streamStatus) si disponible : reçu si count>0 côté tracker OU streamStats.
    let received = !!s.received;
    let countVal = s.count;
    let lastAt = s.lastReceivedAt;
    let raw = s.rawValue;
    if (streamStats && typeof header === 'string' && header.startsWith('stream_')) {
      const rc = streamStats.receivedCount && streamStats.receivedCount[header];
      if (typeof rc === 'number' && rc > countVal) {
        countVal = rc;
        received = true;
      }
      if (streamStats.rawLastValues && streamStats.rawLastValues[header] != null && raw == null) {
        raw = streamStats.rawLastValues[header];
      }
    }
    const observedFlag = obsSet.has(header);
    const ageMs = lastAt === null ? null : t - lastAt;
    let status;
    if (!observedFlag) status = HEADER_STATUS.NON_OBSERVE;
    else if (!received) status = HEADER_STATUS.JAMAIS_RECU;
    else if (ageMs !== null && ageMs > thresholdFor(header)) status = HEADER_STATUS.STALE;
    else status = HEADER_STATUS.OK;
    return {
      header,
      observed: observedFlag,
      received,
      count: countVal,
      lastReceivedAt: lastAt,
      ageMs,
      rawPreview: truncateRaw(raw),
      status,
    };
  });
}
