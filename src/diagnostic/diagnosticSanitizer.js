// Sanitizer récursif pour l'export/copie du diagnostic. PUR -> testable en Node.
//
// Lot Ops Debug §7/§9 : le JSON exporté (et la copie presse-papier) ne doit
// JAMAIS contenir token, access_token, cookie, authorization, password, secret,
// API key, ni d'identity complète si elle peut être personnelle.
//
// Stratégie :
//   - clés sensibles (token/password/secret/cookie/authorization/api_key…) ->
//     remplacées par '[REDACTED]' (la présence du champ reste visible pour
//     l'ops, la valeur jamais);
//   - clés d'identité/SID (identity, participantSid, trackSid, audioTrackSid,
//     performerIdentity, sid…) -> valeur masquée (préfixe + •••) : on garde un
//     indice utile à l'ops sans exposer l'identifiant complet;
//   - chaînes : on ne scanner PAS arbitrairement (trop de faux positifs); on
//     s'appuie sur les clés + un motif `token=`/`password=` explicite dans les
//     chaînes (couvre les URL/log avec query token).
//
// Le sanitizer ne lève jamais : toute erreur -> la valeur est redactée.

const REDACT_KEYS = /^(token|access_?token|auth_?token|refresh_?token|authorization|auth|password|passwd|pass|secret|api_?key|api_?secret|session_?secret|cookie|cookies|set_?cookie)$/i;

const IDENTITY_KEYS = /^(identity|participant_?sid|participantid|track_?sid|tracksid|audio_?track_?sid|audiotracksid|performer_?identity|performeridentity|listener_?identity|listeneridentity|sid|participant_?identity)$/i;

// Masque une chaîne d'identité : on garde un court préfixe (utile à l'ops pour
// distinguer deux entrées) + un marqueur •••. Jamais la valeur complète.
export function redactIdentity(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'string') return redactIdentity(String(value));
  if (value === '') return '—';
  if (value.length <= 6) return value.slice(0, 2) + '•••';
  return value.slice(0, 4) + '•••';
}

// Si une chaîne contient un fragment sensible explicite (token=…, password=…,
// api_key=…, secret=…), on le masque. Conservateur : ne touche que ces motifs.
export function redactSensitiveInString(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/([?&](?:token|access_token|password|api_key|api_secret|secret)=)[^&\s#]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, '$1[REDACTED]');
}

export function sanitizeDiagnostic(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') return redactSensitiveInString(value);
    return value;
  }
  if (seen.has(value)) return '[REDACTED:circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => sanitizeDiagnostic(v, seen));
  }

  const out = {};
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (REDACT_KEYS.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (IDENTITY_KEYS.test(key)) {
      out[key] = redactIdentity(v);
      continue;
    }
    out[key] = sanitizeDiagnostic(v, seen);
  }
  return out;
}