// Endpoint serverless Vercel — déconnexion Control Room (Lot 4F.1).
// POST uniquement. Efface le cookie de session (Max-Age=0, mêmes attributs).
// Aucune valeur secrète. Réponse : { authenticated: false }.

import {
  clearCookieString,
  isSecureEnv,
  COOKIE_NAME,
} from '../../src/server/controlRoomSession.js';
import { sendJson } from '../../src/server/http.js';

export default async function handler(req, res, env = process.env) {
  if (!req || req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  }
  const secure = isSecureEnv(env);
  if (typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', clearCookieString({ name: COOKIE_NAME, secure }));
  }
  return sendJson(res, 200, { authenticated: false });
}

export { COOKIE_NAME };