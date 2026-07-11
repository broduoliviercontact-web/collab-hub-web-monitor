// Assemblage de l'export diagnostic (copie / téléchargement JSON). PUR ->
// testable en Node. Regroupe les sous-systèmes puis passe le tout au sanitizer
// récursif (diagnosticSanitizer.js) : aucun token/password/secret/cookie ni
// identity complète ne sort jamais.
//
// Lot Ops Debug §7 : l'export contient health, runtime config non sensible,
// freshness, headers, snapshot LiveKit listener, snapshot Collab-Hub, compteur
// d'auditeurs, logs bornés. Sont EXPLICITEMENT exclus (via sanitizer) : token,
// access_token, cookie, authorization, password, secret, API key, identity
// complète si personnelle.

import { sanitizeDiagnostic } from './diagnosticSanitizer.js';

// `at` (epoch ms) est passé par l'appelant (pas de Date.now ici -> testable).
export function buildDiagnosticExport({
  health,
  runtimeConfig,
  freshness,
  headers,
  listenerSnapshot,
  collabHubStats,
  listenerCount,
  logs,
  networkStats,
  at,
} = {}) {
  const payload = {
    generatedAt: Number.isFinite(at) ? new Date(at).toISOString() : '—',
    health: health || null,
    runtime: runtimeConfig || null,
    freshness: freshness || null,
    headers: headers || null,
    liveKit: { listener: listenerSnapshot || null, network: networkStats || null },
    collabHub: collabHubStats || null,
    listenerCount: listenerCount || null,
    logs: logs || null,
  };
  return sanitizeDiagnostic(payload);
}