// Tests de contrat pour les primitives HTTP partagées (issue #10).
// Pinent sendJson (headers + status + body + no-store + extra) et readJsonBody
// (objet / string / Buffer / JSON invalide / absent / type inattendu) — exactement
// le comportement verbatim jusqu'ici dupliqué dans les 4 handlers serverless.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendJson, readJsonBody } from '../../src/server/http.js';

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

test('sendJson : Content-Type + Cache-Control no-store + status + body JSON', () => {
  const res = fakeRes();
  sendJson(res, 200, { ok: true });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'application/json');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(res.body, { ok: true });
});

test('sendJson : headers extra (Allow) posés', () => {
  const res = fakeRes();
  sendJson(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  assert.equal(res.headers.Allow, 'POST');
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('sendJson : retourne res (chaînable, permet return sendJson(...))', () => {
  const res = fakeRes();
  assert.equal(sendJson(res, 204, null), res);
});

test('sendJson : res Express-like (json()) sans setHeader/end', () => {
  const res = { body: null, json(o) { this.body = o; return this; } };
  sendJson(res, 200, { x: 1 });
  assert.deepEqual(res.body, { x: 1 });
});

test('sendJson : res sans status() -> statusCode posé', () => {
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = s ? JSON.parse(s) : null; } };
  sendJson(res, 503, { error: 'x' });
  assert.equal(res.statusCode, 503);
});

test('readJsonBody : objet passé tel quel (Vercel parse déjà)', () => {
  assert.deepEqual(readJsonBody({ body: { role: 'listener' } }), { role: 'listener' });
});

test('readJsonBody : string JSON parsée', () => {
  assert.deepEqual(readJsonBody({ body: '{"role":"listener"}' }), { role: 'listener' });
});

test('readJsonBody : Buffer JSON parsé', () => {
  assert.deepEqual(readJsonBody({ body: Buffer.from('{"a":1}') }), { a: 1 });
});

test('readJsonBody : string JSON invalide -> undefined (-> 400)', () => {
  assert.equal(readJsonBody({ body: 'not-json{' }), undefined);
});

test('readJsonBody : body absent -> null (-> 400)', () => {
  assert.equal(readJsonBody({ body: null }), null);
  assert.equal(readJsonBody({ body: undefined }), null);
});

test('readJsonBody : type inattendu -> null', () => {
  assert.equal(readJsonBody({ body: 42 }), null);
});