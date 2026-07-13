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
import { sendJson, readJsonBody } from '../../src/server/http.js';

export default async function handler(req, res, env = process.env, { now = Date.now } = {}) {
  if (!req || req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  }

  const body = readJsonBody(req);
  if (body === undefined) return sendJson(res, 400, { error: 'invalid_request' });
  if (body === null || typeof body !== 'object') return sendJson(res, 400, { error: 'invalid_request' });

  const cfg = validateSessionConfig(env);
  if (!cfg.ok) {
    // Log serveur SANS valeur secrète (uniquement les noms de variables).
    console.error('[control-room/login] configuration incomplète:', cfg.missing.join(',') || cfg.reasons.join(','));
    return sendJson(res, 503, { error: 'auth_unavailable' });
  }

  const provided = typeof body.password === 'string' ? body.password : '';
  // Comparaison timing-safe ; 401 générique (pas de distinction absent/incorrect).
  if (!safeEqualPassword(env.PERFORMER_PASSWORD, provided)) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }

  const { value } = createSessionValue(env, { now });
  const secure = isSecureEnv(env);
  if (typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', setCookieString({ name: COOKIE_NAME, value, secure }));
  }
  return sendJson(res, 200, { authenticated: true, expiresIn: SESSION_TTL_SECONDS });
}

export { COOKIE_NAME, SESSION_TTL_SECONDS };