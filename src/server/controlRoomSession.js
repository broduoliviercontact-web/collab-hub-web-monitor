// Session performer Control Room (Lot 4F.1) — PUR, testable, sans dépendance hors
// node:crypto. Signe et vérifie un cookie de session court (2 h) avec HMAC-SHA256,
// compare les signatures de manière timing-safe, et construit les attributs du
// cookie Set-Cookie. Aucune valeur secrète n'est jamais renvoyée par ces
// fonctions ; le mot de passe n'est jamais manipulé ici (comparé côté endpoint
// login via safeEqualPassword).
//
// Variable serveur (JAMAIS préfixée VITE_) : CONTROL_ROOM_SESSION_SECRET, distincte
// de PERFORMER_PASSWORD, LIVEKIT_API_SECRET, LIVEKIT_API_KEY.
//
// Format du cookie : base64url(payloadJson) + "." + base64url(hmacSha256(secret,
// payloadJson)). Payload minimal : { role, exp } (exp = timestamp ms).

import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'control_room_session';
export const SESSION_TTL_SECONDS = 7200; // 2 heures (alignée sur le TTL token performer)

// Placeholders manifestement factices du .env.example -> refusés (503).
const PLACEHOLDER_SECRET = 'replace-with-a-long-random-secret';
const MIN_SECRET_LEN = 16;
const MIN_PASSWORD_LEN = 8;
const PLACEHOLDER_PASSWORD = 'change-me';

// Comparaison timing-safe de chaînes (gère les longueurs différentes sans lever
// et sans révéler la longueur attendue). Identique en esprit à token.js.
export function safeEqualPassword(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) {
    try { timingSafeEqual(b, b); } catch {} // lisse le timing
    return false;
  }
  try { return timingSafeEqual(a, b); } catch { return false; }
}

// Comparaison timing-safe de Buffers de même longueur (signatures de session).
function safeEqualBuf(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

// Valide la configuration session (secret + mot de passe). Ne renvoie jamais de
// valeur secrète. `reasons`/`missing` ne contiennent que des noms de variables.
export function validateSessionConfig(env = process.env) {
  const secret = env.CONTROL_ROOM_SESSION_SECRET;
  const password = env.PERFORMER_PASSWORD;
  const missing = [];
  const reasons = [];

  if (!secret) missing.push('CONTROL_ROOM_SESSION_SECRET');
  else if (secret === PLACEHOLDER_SECRET || secret.length < MIN_SECRET_LEN ||
           /replace-with|your-|change-me|example/i.test(secret)) {
    reasons.push('CONTROL_ROOM_SESSION_SECRET placeholder/weak');
  }
  if (!password) missing.push('PERFORMER_PASSWORD');
  else if (password === PLACEHOLDER_PASSWORD || password.length < MIN_PASSWORD_LEN) {
    reasons.push('PERFORMER_PASSWORD too short');
  }

  return { ok: missing.length === 0 && reasons.length === 0, missing, reasons };
}

// Détection « production » pour l'attribut Secure du cookie. Vercel positionne
// VERCEL_ENV / VERCEL ; NODE_ENV=production couvre le reste.
export function isSecureEnv(env = process.env) {
  return env.NODE_ENV === 'production' ||
    env.VERCEL_ENV === 'production' ||
    env.VERCEL === '1';
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

// Crée la valeur signée du cookie. Retourne { value, exp } sans secret.
export function createSessionValue(env = process.env, { now = Date.now } = {}) {
  const secret = env.CONTROL_ROOM_SESSION_SECRET;
  if (typeof secret !== 'string' || !secret) throw new Error('CONTROL_ROOM_SESSION_SECRET manquant.');
  const exp = now() + SESSION_TTL_SECONDS * 1000;
  const payloadJson = JSON.stringify({ role: 'performer', exp });
  const payloadB64 = b64url(payloadJson);
  const mac = createHmac('sha256', secret).update(payloadB64).digest();
  return { value: `${payloadB64}.${mac.toString('base64url')}`, exp };
}

// Vérifie une valeur de cookie. Retourne { authenticated, reason, exp }.
// Raisons : 'no_cookie' | 'malformed' | 'bad_signature' | 'expired'.
export function verifySessionValue(value, env = process.env, { now = Date.now } = {}) {
  if (typeof value !== 'string' || !value) return { authenticated: false, reason: 'no_cookie' };
  const idx = value.indexOf('.');
  if (idx <= 0 || idx === value.length - 1) return { authenticated: false, reason: 'malformed' };
  const payloadB64 = value.slice(0, idx);
  const sigB64 = value.slice(idx + 1);
  const secret = env.CONTROL_ROOM_SESSION_SECRET;
  if (typeof secret !== 'string' || !secret) return { authenticated: false, reason: 'bad_signature' };

  let expectedMac;
  try {
    expectedMac = createHmac('sha256', secret).update(payloadB64).digest();
  } catch {
    return { authenticated: false, reason: 'bad_signature' };
  }
  let providedMac;
  try { providedMac = Buffer.from(sigB64, 'base64url'); }
  catch { return { authenticated: false, reason: 'bad_signature' }; }
  if (!safeEqualBuf(expectedMac, providedMac)) return { authenticated: false, reason: 'bad_signature' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { authenticated: false, reason: 'malformed' };
  }
  if (!payload || payload.role !== 'performer' || typeof payload.exp !== 'number') {
    return { authenticated: false, reason: 'malformed' };
  }
  if (payload.exp <= now()) return { authenticated: false, reason: 'expired' };
  return { authenticated: true, reason: null, exp: payload.exp };
}

// Chaîne Set-Cookie complète. `secure` ajoute l'attribut Secure (production).
export function setCookieString({ name = COOKIE_NAME, value, maxAgeSeconds = SESSION_TTL_SECONDS, secure = false } = {}) {
  const attrs = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

// Chaîne Set-Cookie d'effacement (Max-Age=0).
export function clearCookieString({ name = COOKIE_NAME, secure = false } = {}) {
  const attrs = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

// Parse l'en-tête Cookie en objet nom -> valeur.
export function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string' || !header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

// Lit la valeur du cookie de session depuis la requête (req.cookies objet ou
// req.headers.cookie chaîne). Retourne la valeur brute ou null.
export function readSessionCookie(req) {
  if (!req) return null;
  if (req.cookies && typeof req.cookies === 'object' && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  const header = req.headers && (req.headers.cookie || req.headers.Cookie);
  if (typeof header === 'string') {
    return parseCookies(header)[COOKIE_NAME] || null;
  }
  return null;
}