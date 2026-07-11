// Endpoint serverless Vercel — déconnexion Control Room (Lot 4F.1).
// POST uniquement. Efface le cookie de session (Max-Age=0, mêmes attributs).
// Aucune valeur secrète. Réponse : { authenticated: false }.

import {
  clearCookieString,
  isSecureEnv,
  COOKIE_NAME,
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

export default async function handler(req, res, env = process.env) {
  if (!req || req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  }
  const secure = isSecureEnv(env);
  if (typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', clearCookieString({ name: COOKIE_NAME, secure }));
  }
  return json(res, 200, { authenticated: false });
}

export { COOKIE_NAME };