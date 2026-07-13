// Tests for the server domain — split from the former monolithic test/runTests.mjs (issue #11).
// Behaviour is unchanged; tests and fakes were moved verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, {
  grantsFor, generateIdentity, validateConfig, safeEqualPassword,
  ROOM_NAME, TTL_SECONDS,
} from '../../api/livekit/token.js';
import {
  createSessionValue, verifySessionValue, validateSessionConfig,
  setCookieString, clearCookieString, parseCookies, readSessionCookie,
  isSecureEnv, COOKIE_NAME, SESSION_TTL_SECONDS,
} from '../../src/server/controlRoomSession.js';
import loginHandler from '../../api/control-room/login.js';
import logoutHandler from '../../api/control-room/logout.js';
import sessionHandler from '../../api/control-room/session.js';
import { T0 } from '../helpers/session-fixtures.mjs';

const FAKE_ENV = {
  LIVEKIT_URL: 'wss://test.livekit.cloud',
  LIVEKIT_API_KEY: 'testkey',
  LIVEKIT_API_SECRET: 'testsecret',
  PERFORMER_PASSWORD: 'test-password-long',
  CONTROL_ROOM_SESSION_SECRET: 'test-session-secret-long-1234567890',
};

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(s) { this.statusCode = s; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    json(o) { this.body = o; return this; },
    end(s) { this.body = s ? JSON.parse(s) : null; return this; },
  };
}

function fakeReq({ method = 'POST', body, headers = {}, cookie = null } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  return { method, body, headers: h };
}

function decodeJwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

function mintSession(env = FAKE_ENV, { now = () => 1234567890000 } = {}) {
  return createSessionValue(env, { now }).value;
}

async function callEndpoint({ method = 'POST', body, env = FAKE_ENV, cookie = null, now = () => 1234567890000 } = {}) {
  const req = fakeReq({ method, body, cookie });
  const res = fakeRes();
  await handler(req, res, env, { now });
  return res;
}

function callLogin({ method = 'POST', body, env = FAKE_ENV, now = () => T0 } = {}) {
  const req = fakeReq({ method, body });
  const res = fakeRes();
  return loginHandler(req, res, env, { now }).then(() => res);
}

function callLogout({ method = 'POST', env = FAKE_ENV } = {}) {
  const req = fakeReq({ method });
  const res = fakeRes();
  return logoutHandler(req, res, env).then(() => res);
}

function callSession({ method = 'GET', cookie = null, env = FAKE_ENV, now = () => T0 } = {}) {
  const req = fakeReq({ method, cookie });
  const res = fakeRes();
  return sessionHandler(req, res, env, { now }).then(() => res);
}

test('livekit/token : GET -> 405 + Allow POST', async () => {
  const res = await callEndpoint({ method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
});

// 2. POST body invalide -> 400

test('livekit/token : body non JSON -> 400', async () => {
  const res = await callEndpoint({ body: 'not-json{' });
  assert.equal(res.statusCode, 400);
});

// 3. rôle inconnu -> 400

test('livekit/token : rôle inconnu -> 400', async () => {
  const res = await callEndpoint({ body: { role: 'admin' } });
  assert.equal(res.statusCode, 400);
});

// 4. performer sans session -> 401 (Lot 4F.1 : auth par cookie, plus de password)

test('livekit/token : performer sans session -> 401', async () => {
  const res = await callEndpoint({ body: { role: 'performer' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

// 5. performer session invalide -> 401

test('livekit/token : performer session invalide -> 401', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=eyJbad.sigvalue` });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

// 6. performer avec session valide -> token

test('livekit/token : performer session valide -> 200 + token', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  assert.equal(res.statusCode, 200);
  assert.ok(typeof res.body.token === 'string' && res.body.token.length > 0);
});

// 7. listener -> token

test('livekit/token : listener -> 200 + token', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.statusCode, 200);
  assert.ok(typeof res.body.token === 'string' && res.body.token.length > 0);
});

// 8. room forcée à main

test('livekit/token : room forcée à main', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.body.room, 'main');
  assert.equal(decodeJwtPayload(res.body.token).video.room, 'main');
});

// 9. identity générée serveur (le client n en fournit pas)

test('livekit/token : identity générée côté serveur', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.ok(typeof res.body.identity === 'string' && res.body.identity.length > 5);
  assert.equal(decodeJwtPayload(res.body.token).sub, res.body.identity);
});

// 10. identity performer préfixée

test('livekit/token : identity performer préfixée', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  assert.ok(res.body.identity.startsWith('performer-'));
});

// 11. identity listener préfixée

test('livekit/token : identity listener préfixée', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.ok(res.body.identity.startsWith('listener-'));
});

// 12. grants performer corrects

test('livekit/token : grants performer (canPublish true, canSubscribe false, canPublishData false)', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  const v = decodeJwtPayload(res.body.token).video;
  assert.equal(v.roomJoin, true);
  assert.equal(v.canPublish, true);
  assert.equal(v.canSubscribe, false);
  assert.equal(v.canPublishData, false);
});

// 13. grants listener corrects

test('livekit/token : grants listener (canPublish false, canSubscribe true)', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  const v = decodeJwtPayload(res.body.token).video;
  assert.equal(v.canPublish, false);
  assert.equal(v.canSubscribe, true);
  assert.equal(v.canPublishData, false);
});

// 14. TTL explicite 2h

test('livekit/token : TTL explicite 7200s', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.body.expiresIn, 7200);
  const p = decodeJwtPayload(res.body.token);
  assert.equal(p.exp - p.nbf, 7200);
});

// 15. config absente -> 503

test('livekit/token : config absente -> 503', async () => {
  const res = await callEndpoint({ body: { role: 'listener' }, env: {} });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'livekit_unavailable');
});

// 16. URL absente -> 503

test('livekit/token : URL absente -> 503', async () => {
  const res = await callEndpoint({ body: { role: 'listener' }, env: { ...FAKE_ENV, LIVEKIT_URL: '' } });
  assert.equal(res.statusCode, 503);
});

// 17. secret absent -> 503

test('livekit/token : API secret absent -> 503', async () => {
  const res = await callEndpoint({ body: { role: 'listener' }, env: { ...FAKE_ENV, LIVEKIT_API_SECRET: '' } });
  assert.equal(res.statusCode, 503);
});

// 18. aucune API key dans la réponse

test('livekit/token : réponse sans champ API key', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.body.apiKey, undefined);
  assert.equal(res.body.api_key, undefined);
  assert.equal(res.body.LIVEKIT_API_KEY, undefined);
});

// 19. aucun secret dans la réponse

test('livekit/token : réponse sans champ API secret', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.body.apiSecret, undefined);
  assert.equal(res.body.LIVEKIT_API_SECRET, undefined);
});

// 20. Cache-Control no-store

test('livekit/token : header Cache-Control no-store', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

// --- tokenClient (12) ---


test('session : login GET -> 405 + Allow POST', async () => {
  const res = await callLogin({ method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
});

// 2. login body invalide -> 400

test('session : login body non JSON -> 400', async () => {
  const res = await callLogin({ body: 'not-json{' });
  assert.equal(res.statusCode, 400);
});

// 3. mauvais mot de passe -> 401 générique

test('session : login mauvais mot de passe -> 401 unauthorized', async () => {
  const res = await callLogin({ body: { password: 'wrong' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

// 4. bon mot de passe -> cookie HttpOnly

test('session : login bon mot de passe -> 200 + Set-Cookie HttpOnly', async () => {
  const res = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.authenticated, true);
  const sc = res.headers['Set-Cookie'];
  assert.ok(sc.includes('HttpOnly'));
  assert.ok(sc.startsWith(`${COOKIE_NAME}=`));
});

// 5. cookie Secure en production

test('session : cookie Secure en production', async () => {
  const prodEnv = { ...FAKE_ENV, VERCEL_ENV: 'production' };
  const res = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD }, env: prodEnv });
  assert.ok(res.headers['Set-Cookie'].includes('Secure'));
  const devRes = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD }, env: FAKE_ENV });
  assert.ok(!devRes.headers['Set-Cookie'].includes('Secure'));
});

// 6. SameSite Strict

test('session : cookie SameSite=Strict', async () => {
  const res = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD } });
  assert.ok(res.headers['Set-Cookie'].includes('SameSite=Strict'));
});

// 7. expiration définie (Max-Age 7200)

test('session : cookie Max-Age=7200', async () => {
  const res = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD } });
  assert.ok(res.headers['Set-Cookie'].includes('Max-Age=7200'));
});

// 8. aucun mot de passe dans la réponse

test('session : réponse sans mot de passe ni secret', async () => {
  const res = await callLogin({ body: { password: FAKE_ENV.PERFORMER_PASSWORD } });
  assert.equal(res.body.password, undefined);
  assert.equal(res.body.PERFORMER_PASSWORD, undefined);
  assert.equal(res.body.secret, undefined);
  assert.ok(!JSON.stringify(res.body).includes(FAKE_ENV.PERFORMER_PASSWORD));
});

// 9. session valide -> authenticated true

test('session : GET session cookie valide -> authenticated true + exp', async () => {
  const value = mintSession(FAKE_ENV, { now: () => T0 });
  const res = await callSession({ cookie: `${COOKIE_NAME}=${value}`, now: () => T0 + 1000 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.authenticated, true);
  assert.equal(res.body.exp, T0 + SESSION_TTL_SECONDS * 1000);
});

// 10. session absente -> authenticated false (pas 401)

test('session : GET sans cookie -> authenticated false', async () => {
  const res = await callSession({ cookie: null });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.authenticated, false);
});

// 11. cookie altéré -> rejeté (authenticated false)

test('session : cookie altéré -> authenticated false', async () => {
  const value = mintSession();
  const tampered = value.slice(0, -2) + 'AA';
  const res = await callSession({ cookie: `${COOKIE_NAME}=${tampered}` });
  assert.equal(res.body.authenticated, false);
});

// 12. cookie expiré -> rejeté

test('session : cookie expiré -> authenticated false', async () => {
  const expired = mintSession(FAKE_ENV, { now: () => 0 });
  const res = await callSession({ cookie: `${COOKIE_NAME}=${expired}`, now: () => 9999999999999 });
  assert.equal(res.body.authenticated, false);
});

// 13. logout efface cookie (Max-Age=0)

test('session : logout -> Set-Cookie Max-Age=0', async () => {
  const res = await callLogout();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.authenticated, false);
  assert.ok(res.headers['Set-Cookie'].includes('Max-Age=0'));
});

// 14. configuration absente -> 503

test('session : login config absente -> 503', async () => {
  const res = await callLogin({ body: { password: 'x' }, env: { ...FAKE_ENV, CONTROL_ROOM_SESSION_SECRET: '' } });
  assert.equal(res.statusCode, 503);
});

// 15. aucune valeur secrète logguée (la fonction ne renvoie jamais le secret)

test('session : validateSessionConfig ne renvoie aucune valeur secrète', () => {
  const cfg = validateSessionConfig(FAKE_ENV);
  assert.equal(cfg.ok, true);
  assert.ok(!JSON.stringify(cfg).includes(FAKE_ENV.CONTROL_ROOM_SESSION_SECRET));
  assert.ok(!JSON.stringify(cfg).includes(FAKE_ENV.PERFORMER_PASSWORD));
  // placeholder refusé
  const bad = validateSessionConfig({ ...FAKE_ENV, CONTROL_ROOM_SESSION_SECRET: 'replace-with-a-long-random-secret' });
  assert.equal(bad.ok, false);
});


test('token4F1 : performer sans session -> 401', async () => {
  const res = await callEndpoint({ body: { role: 'performer' } });
  assert.equal(res.statusCode, 401);
});

// 2. performer session expirée -> 401

test('token4F1 : performer session expirée -> 401', async () => {
  const expired = mintSession(FAKE_ENV, { now: () => 0 });
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${expired}`, now: () => 9999999999999 });
  assert.equal(res.statusCode, 401);
});

// 3. performer session valide -> token

test('token4F1 : performer session valide -> 200 + token', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  assert.equal(res.statusCode, 200);
  assert.ok(typeof res.body.token === 'string' && res.body.token.length > 0);
});

// 4. listener reste accessible sans session

test('token4F1 : listener sans session -> 200', async () => {
  const res = await callEndpoint({ body: { role: 'listener' } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token);
});

// 5. champ password corps ignoré (avec session valide -> 200, sans session -> 401)

test('token4F1 : champ password corps ignoré (session prime)', async () => {
  const resOk = await callEndpoint({ body: { role: 'performer', password: 'whatever' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  assert.equal(resOk.statusCode, 200);
  const resNo = await callEndpoint({ body: { role: 'performer', password: 'whatever' } });
  assert.equal(resNo.statusCode, 401);
});

// 6. grants inchangés (canPublish true, canSubscribe false)

test('token4F1 : grants performer inchangés via session', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  const v = decodeJwtPayload(res.body.token).video;
  assert.equal(v.canPublish, true);
  assert.equal(v.canSubscribe, false);
  assert.equal(v.canPublishData, false);
});

// 7. aucun secret dans la réponse

test('token4F1 : réponse sans secret serveur', async () => {
  const res = await callEndpoint({ body: { role: 'performer' }, cookie: `${COOKIE_NAME}=${mintSession()}` });
  assert.equal(res.body.apiKey, undefined);
  assert.equal(res.body.apiSecret, undefined);
  assert.ok(!JSON.stringify(res.body).includes(FAKE_ENV.LIVEKIT_API_SECRET));
});

