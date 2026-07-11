// Endpoint serverless Vercel — connexion Control Room performer (Lot 4F.1).
// POST uniquement. Compare le mot de passe à PERFORMER_PASSWORD via timingSafeEqual,
// puis pose un cookie de session signé (control_room_session, 2 h, HttpOnly,
// SameSite=Strict, Secure en production). Aucune valeur secrète n'est renvoyée ni
// logguée ; le mot de passe n'est JAMAIS loggué.
//
// Variables serveur (JAMAIS VITE_) :
//   CONTROL_ROOM_SESSION_SECRET (signature HMAC), PERFORMER_PASSWORD.
//
// Réponse : { authenticated: true, expiresIn } ou { error } (401/400/405/503).

import {
  validateSessionConfig,
  safeEqualPassword,
  createSessionValue,
  setCookieString,
  isSecureEnv,
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '../../src/server/controlRoomSession.js';

function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  }
  if (typeof res.status === 'function') res.status(status);
  else res.statusCode = status;
  if (typeof res.end === 'function') res.end(payload);
  else if (typeof res.json === 'function') res.json(body);
  return res;
}

function readBody(req) {
  let body = req.body;
  if (body == null) return null;
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    try { return JSON.parse(body.toString()); } catch { return undefined; }
  }
  if (typeof body === 'object') return body;
  return null;
}

export default async function handler(req, res, env = process.env, { now = Date.now } = {}) {
  if (!req || req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  }

  const body = readBody(req);
  if (body === undefined) return json(res, 400, { error: 'invalid_request' });
  if (body === null || typeof body !== 'object') return json(res, 400, { error: 'invalid_request' });

  const cfg = validateSessionConfig(env);
  if (!cfg.ok) {
    // Log serveur SANS valeur secrète (uniquement les noms de variables).
    console.error('[control-room/login] configuration incomplète:', cfg.missing.join(',') || cfg.reasons.join(','));
    return json(res, 503, { error: 'auth_unavailable' });
  }

  const provided = typeof body.password === 'string' ? body.password : '';
  // Comparaison timing-safe ; 401 générique (pas de distinction absent/incorrect).
  if (!safeEqualPassword(env.PERFORMER_PASSWORD, provided)) {
    return json(res, 401, { error: 'unauthorized' });
  }

  const { value } = createSessionValue(env, { now });
  const secure = isSecureEnv(env);
  if (typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', setCookieString({ name: COOKIE_NAME, value, secure }));
  }
  return json(res, 200, { authenticated: true, expiresIn: SESSION_TTL_SECONDS });
}

export { COOKIE_NAME, SESSION_TTL_SECONDS };