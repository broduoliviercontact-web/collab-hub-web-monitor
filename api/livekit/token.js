// Endpoint serverless Vercel — génération de tokens LiveKit temporaires (Lot 4C).
// POST uniquement. Room forcée "main", identity générée côté serveur, grants par
// rôle, TTL explicite 2h. Aucune valeur secrète renvoyée ou logguée.
//
// Variables serveur (Vercel Environment Variables, JAMAIS préfixées VITE_) :
//   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, PERFORMER_PASSWORD
//
// Le navigateur ne reçoit que : { token, url, room, identity, role, expiresIn }.

import { AccessToken } from 'livekit-server-sdk';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  validateSessionConfig,
  verifySessionValue,
  readSessionCookie,
} from '../../src/server/controlRoomSession.js';
import { sendJson, readJsonBody } from '../../src/server/http.js';

const ROOM_NAME = 'main';
const TTL_SECONDS = 7200; // 2 heures (performer et listener)
const PERFORMER_PREFIX = 'performer-';
const LISTENER_PREFIX = 'listener-';
const MIN_PASSWORD_LEN = 8;

// Placeholders manifestement factices du .env.example -> refusés (503).
const PLACEHOLDER_URL = 'wss://your-project.livekit.cloud';
const PLACEHOLDER_KEY = 'your-api-key';
const PLACEHOLDER_SECRET = 'your-api-secret';
const PLACEHOLDER_PASSWORD = 'change-me';

// Grants LiveKit par rôle. Audio uniquement dans l'usage applicatif ; pas de
// permission vidéo supplémentaire. canPublishData:false (pas de data channel).
export function grantsFor(role) {
  if (role === 'performer') {
    return { roomJoin: true, room: ROOM_NAME, canPublish: true, canSubscribe: false, canPublishData: false };
  }
  return { roomJoin: true, room: ROOM_NAME, canPublish: false, canSubscribe: true, canPublishData: false };
}

export function generateIdentity(role) {
  const id = randomUUID();
  return (role === 'performer' ? PERFORMER_PREFIX : LISTENER_PREFIX) + id;
}

// Comparaison de mot de passe résistante au timing. Gère les longueurs
// différentes sans lever (renvoie false) et sans révéler la longueur attendue.
export function safeEqualPassword(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) {
    // Compare quand même des buffers de même longueur pour lisser le timing,
    // puis renvoie false (sans lever).
    try { timingSafeEqual(b, b); } catch {}
    return false;
  }
  try { return timingSafeEqual(a, b); } catch { return false; }
}

// Valide la configuration serveur. Retourne { ok, missing, reasons } sans
// jamais inclure de valeur secrète.
export function validateConfig(env = process.env) {
  const url = env.LIVEKIT_URL;
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  const password = env.PERFORMER_PASSWORD;
  const missing = [];
  const reasons = [];

  if (!url) missing.push('LIVEKIT_URL');
  else {
    if (!/^wss:\/\//.test(url) && !/^ws:\/\//.test(url)) reasons.push('LIVEKIT_URL must start with wss://');
    if (url === PLACEHOLDER_URL || /your-project|example\.com/i.test(url)) reasons.push('LIVEKIT_URL placeholder');
  }
  if (!apiKey) missing.push('LIVEKIT_API_KEY');
  else if (apiKey === PLACEHOLDER_KEY) reasons.push('LIVEKIT_API_KEY placeholder');
  if (!apiSecret) missing.push('LIVEKIT_API_SECRET');
  else if (apiSecret === PLACEHOLDER_SECRET) reasons.push('LIVEKIT_API_SECRET placeholder');
  if (!password) missing.push('PERFORMER_PASSWORD');
  else if (password === PLACEHOLDER_PASSWORD || password.length < MIN_PASSWORD_LEN) {
    reasons.push('PERFORMER_PASSWORD too short');
  }

  const ok = missing.length === 0 && reasons.length === 0;
  return { ok, missing, reasons };
}

// Handler serverless Vercel : export default async function handler(req, res).
// `env` injectable pour les tests (défaut : process.env en production).
// `now` injectable pour les tests (défaut : Date.now).
export default async function handler(req, res, env = process.env, { now = Date.now } = {}) {
  // 1. méthode : POST uniquement.
  if (!req || req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  }

  // 2. body JSON.
  const body = readJsonBody(req);
  if (body === undefined) return sendJson(res, 400, { error: 'invalid_request' });
  if (body === null || typeof body !== 'object') return sendJson(res, 400, { error: 'invalid_request' });

  // 3. configuration serveur (avant rôle/mot de passe -> 503 générique).
  const cfg = validateConfig(env);
  if (!cfg.ok) {
    // Log serveur SANS valeur secrète (uniquement les noms de variables).
    console.error('[livekit/token] configuration incomplète:', cfg.missing.join(',') || cfg.reasons.join(','));
    return sendJson(res, 503, { error: 'livekit_unavailable' });
  }

  // 4. rôle.
  const role = body.role;
  if (role !== 'performer' && role !== 'listener') {
    return sendJson(res, 400, { error: 'invalid_role' });
  }

  // 5. authentification performer (Lot 4F.1) : session Control Room signée via
  //    cookie same-origin. Aucun mot de passe n'est accepté dans le corps ; le
  //    champ password client est ignoré. Session absente/expirée/altérée -> 401
  //    générique (pas de distinction). Le listener n'a pas besoin de session.
  if (role === 'performer') {
    const sessCfg = validateSessionConfig(env);
    if (!sessCfg.ok) {
      console.error('[livekit/token] configuration session incomplète:', sessCfg.missing.join(',') || sessCfg.reasons.join(','));
      return sendJson(res, 503, { error: 'livekit_unavailable' });
    }
    const cookieValue = readSessionCookie(req);
    const sess = verifySessionValue(cookieValue, env, { now });
    if (!sess.authenticated) {
      return sendJson(res, 401, { error: 'unauthorized' });
    }
  }

  // 6. émission du token.
  const identity = generateIdentity(role);
  let token;
  try {
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity,
      ttl: TTL_SECONDS,
    });
    at.addGrant(grantsFor(role));
    token = await at.toJwt();
  } catch (err) {
    console.error('[livekit/token] émission token échouée (détail masqué)');
    return sendJson(res, 503, { error: 'livekit_unavailable' });
  }

  return sendJson(res, 200, {
    token,
    url: env.LIVEKIT_URL,
    room: ROOM_NAME,
    identity,
    role,
    expiresIn: TTL_SECONDS,
  });
}

export { ROOM_NAME, TTL_SECONDS };