// Endpoint serverless Vercel — vérification de session Control Room (Lot 4F.1).
// GET uniquement. Lit le cookie control_room_session, vérifie la signature HMAC
// et l'expiration. Aucune valeur secrète. Réponse : { authenticated, exp? } ou
// { error } (405/503). 401 n'est pas renvoyé : une session absente/expirée est
// simplement { authenticated: false } (l'UI revient à l'écran de login).

import {
  validateSessionConfig,
  verifySessionValue,
  readSessionCookie,
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

export default async function handler(req, res, env = process.env, { now = Date.now } = {}) {
  if (!req || req.method !== 'GET') {
    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
  }

  const cfg = validateSessionConfig(env);
  if (!cfg.ok) {
    console.error('[control-room/session] configuration incomplète:', cfg.missing.join(',') || cfg.reasons.join(','));
    return json(res, 503, { error: 'auth_unavailable' });
  }

  const value = readSessionCookie(req);
  const sess = verifySessionValue(value, env, { now });
  if (sess.authenticated) {
    return json(res, 200, { authenticated: true, exp: sess.exp });
  }
  return json(res, 200, { authenticated: false });
}