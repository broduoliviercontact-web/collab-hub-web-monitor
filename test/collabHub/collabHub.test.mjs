// Tests for the collabHub domain — split from the former monolithic test/runTests.mjs (issue #11).
// Behaviour is unchanged; tests and fakes were moved verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK_IDS, BLOCK_LAYOUT_HEADERS, BLOCK_REGISTRY, IMAGE_HEADERS, KNOWN_HEADERS,
  normalizeValue, OBSERVABLE_HEADERS, routeBlockControl, routeControl,
  routeImageControl, routeShowNamePositionControl, routeTextVisibilityControl,
  SHOW_NAME_POSITION_HEADERS, TEXT_VISIBILITY_HEADERS,
} from '../../src/collabHub/messageRouter.js';
import { createObserveGuard, wireSocket } from '../../src/collabHub/observeGuard.js';
import { resolveAuthMode, resolveAuth, buildSocketUrl } from '../../src/collabHub/authMode.js';
import { fakeSocket } from '../helpers/socket.mjs';


test('normalizeValue : ["Premier morceau"] -> "Premier morceau"', () => {
  assert.equal(normalizeValue(['Premier morceau']), 'Premier morceau');
});

// 2. normalisation tableau plusieurs éléments

test('normalizeValue : ["Premier", "morceau"] -> "Premier morceau"', () => {
  assert.equal(normalizeValue(['Premier', 'morceau']), 'Premier morceau');
});

// 3. normalisation scalaire

test('normalizeValue : "Titre" -> "Titre" ; absent -> "" ; nombre -> chaîne', () => {
  assert.equal(normalizeValue('Titre'), 'Titre');
  assert.equal(normalizeValue(undefined), '');
  assert.equal(normalizeValue(null), '');
  assert.equal(normalizeValue(42), '42');
});

// 4. header inconnu ignoré

test('routeControl ignore les headers inconnus', () => {
  let called = false;
  const routed = routeControl({ header: 'unknown', values: ['x'] }, () => { called = true; });
  assert.equal(routed, false);
  assert.equal(called, false);
});


test('routeControl route les headers connus avec valeur normalisée', () => {
  let received = null;
  const routed = routeControl({ header: 'sound_title', values: ['Premier', 'morceau'] }, (h, v) => { received = { h, v }; });
  assert.equal(routed, true);
  assert.deepEqual(received, { h: 'sound_title', v: 'Premier morceau' });
});

// 5. URL https valide acceptée

test('KNOWN_HEADERS contient exactement les 6 headers', () => {
  assert.deepEqual(KNOWN_HEADERS, ['sound_show_name', 'sound_title', 'sound_author', 'sound_subtitle', 'sound_description', 'sound_link']);
});

test('routeImageControl route uniquement les 7 headers image', () => {
  let received = null;
  const routed = routeImageControl({ header: 'sound_image_url', values: ['https://example.com/image.png'] }, (h, v) => { received = { h, v }; });
  assert.equal(routed, true);
  assert.deepEqual(received, { h: 'sound_image_url', v: 'https://example.com/image.png' });
  assert.equal(routeImageControl({ header: 'sound_title', values: ['x'] }, () => {}), false);
  assert.equal(IMAGE_HEADERS.length, 7);
});

test('routeTextVisibilityControl route uniquement les 6 préférences texte', () => {
  let received = null;
  const routed = routeTextVisibilityControl({ header: 'sound_title_visible', values: ['false'] }, (h, v) => { received = { h, v }; });
  assert.equal(routed, true);
  assert.deepEqual(received, { h: 'sound_title_visible', v: 'false' });
  assert.equal(routeTextVisibilityControl({ header: 'sound_title', values: ['x'] }, () => {}), false);
  assert.equal(TEXT_VISIBILITY_HEADERS.length, 6);
  assert.ok(TEXT_VISIBILITY_HEADERS.includes('sound_show_name_visible'));
});

test('routeShowNamePositionControl route uniquement sound_show_name_position', () => {
  let received = null;
  const routed = routeShowNamePositionControl({ header: 'sound_show_name_position', values: ['after_author'] }, (h, v) => { received = { h, v }; });
  assert.equal(routed, true);
  assert.deepEqual(received, { h: 'sound_show_name_position', v: 'after_author' });
  assert.equal(routeShowNamePositionControl({ header: 'sound_title', values: ['top'] }, () => {}), false);
  assert.deepEqual(SHOW_NAME_POSITION_HEADERS, ['sound_show_name_position']);
});

test('routeBlockControl route le registre fixe et les contrôles de bloc associés', () => {
  assert.deepEqual(BLOCK_IDS, [
    'snd_show', 'snd_title', 'snd_author', 'snd_info_1',
    'snd_info_2', 'snd_info_3', 'snd_info_4', 'snd_info_5',
  ]);
  assert.deepEqual(BLOCK_REGISTRY.map(({ index, id }) => [index, id]), BLOCK_IDS.map((id, index) => [index, id]));
  assert.deepEqual(BLOCK_LAYOUT_HEADERS, ['visibility', 'mode', 'drawing_preset', 'drawing_align', 'block_config']);
  let received = null;
  assert.equal(routeBlockControl({ header: 'snd_info_3', values: ['Intro'] }, (h, v) => { received = { h, v }; }), true);
  assert.deepEqual(received, { h: 'snd_info_3', v: ['Intro'] });
  assert.equal(routeBlockControl({ header: 'visibility', values: ['1 1 0 1 0 0 1 1'] }, () => {}), true);
  assert.equal(routeBlockControl({ header: 'mode', values: ['content content content content content content drawing content'] }, () => {}), true);
  assert.equal(routeBlockControl({ header: 'drawing_preset', values: ['bars'] }, () => {}), true);
  assert.equal(routeBlockControl({ header: 'drawing_align', values: ['center'] }, () => {}), true);
  assert.equal(routeBlockControl({ header: 'block_config', values: ['snd_show image_position left'] }, () => {}), true);
  assert.equal(routeBlockControl({ header: 'order', values: ['7 6 5 4 3 2 1 0'] }, () => {}), false);
  assert.equal(routeBlockControl({ header: 'snd_img_1', values: ['x'] }, () => {}), false);
  assert.equal(routeBlockControl({ header: 'sound_title', values: ['x'] }, () => {}), false);
});

test('OBSERVABLE_HEADERS inclut le protocole v2 complet', () => {
  for (const header of [...BLOCK_IDS, ...BLOCK_LAYOUT_HEADERS]) {
    assert.ok(OBSERVABLE_HEADERS.includes(header), `header v2 observable : ${header}`);
  }
});

// --- Lot 1.1 : observation idempotente (observeGuard / wireSocket) ---

// Fake socket minimal pour tester wireSocket (pas de socket.io-client réel).

test('observeGuard : header observé 2x n émet qu une fois', () => {
  const emitted = [];
  const g = createObserveGuard({ emit: (h) => emitted.push(h) });
  g.setConnected(true);
  assert.equal(g.observeHeaderOnce('sound_title'), true);
  assert.equal(g.observeHeaderOnce('sound_title'), false);
  assert.deepEqual(emitted, ['sound_title']);
});

// 11. six headers observés deux fois -> exactement 6 émissions

test('observeGuard : 6 headers x2 -> 6 émissions, tous marqués observés', () => {
  const emitted = [];
  const g = createObserveGuard({ emit: (h) => emitted.push(h) });
  g.setConnected(true);
  g.observeKnownHeadersOnce();
  g.observeKnownHeadersOnce();
  assert.equal(emitted.length, 6);
  assert.deepEqual(emitted.sort(), [...KNOWN_HEADERS].sort());
  assert.equal(KNOWN_HEADERS.every((h) => g.isObserved(h)), true);
  assert.equal(g.observedCount(), 6);
});

// 12. après reset (disconnect), on peut réobserver

test('observeGuard : disconnect vide le suivi, reconnect permet de réobserver', () => {
  const emitted = [];
  const g = createObserveGuard({ emit: (h) => emitted.push(h) });
  g.setConnected(true);
  g.observeHeaderOnce('sound_title');
  g.setConnected(false); // vrai disconnect
  assert.equal(g.isObserved('sound_title'), false);
  g.setConnected(true);
  assert.equal(g.observeHeaderOnce('sound_title'), true); // réobservable
  assert.equal(emitted.filter((h) => h === 'sound_title').length, 2);
});

// 13. header inconnu non observé par observeKnownHeadersOnce

test('observeGuard : observeKnownHeadersOnce n observe pas un header inconnu', () => {
  const g = createObserveGuard({ emit: () => {} });
  g.setConnected(true);
  g.observeKnownHeadersOnce();
  assert.equal(g.isObserved('unknown'), false);
  assert.equal(g.observedCount(), 6);
});

// 14. changement de socket.id réinitialise l état (disconnect puis connect)

test('observeGuard : un header extra est oublié après disconnect', () => {
  const g = createObserveGuard({ emit: () => {} });
  g.setConnected(true);
  g.observeHeaderOnce('diag_custom');
  assert.equal(g.isObserved('diag_custom'), true);
  g.setConnected(false); // nouveau socket.id -> reset
  assert.equal(g.isObserved('diag_custom'), false);
});

// 15. wireSocket : un seul listener par événement + observation idempotente

test('wireSocket : un listener par event, réobservation idempotente sur reconnect', () => {
  const sock = fakeSocket();
  const emitted = [];
  const guard = createObserveGuard({ emit: (h) => emitted.push(h) });
  wireSocket(sock, guard, { onStatus: () => {}, onControl: () => {} });
  for (const e of ['connect', 'reconnect', 'reconnect_attempt', 'disconnect', 'connect_error', 'control']) {
    assert.equal(sock.listenerCount(e), 1, `listener unique pour ${e}`);
  }
  sock.fire('connect');            // contenus, image, visibilités et heartbeat
  assert.equal(emitted.length, OBSERVABLE_HEADERS.length);
  sock.fire('reconnect');          // déclenche aussi connect ensuite -> déjà observé
  assert.equal(emitted.length, OBSERVABLE_HEADERS.length);
  sock.fire('disconnect');         // vide le guard
  sock.fire('connect');            // reconnect -> une nouvelle série
  assert.equal(emitted.length, OBSERVABLE_HEADERS.length * 2);
});

// 16. forget() permet de réobserver après un unobserve explicite

test('observeGuard : forget permet de réobserver après unobserve', () => {
  const emitted = [];
  const g = createObserveGuard({ emit: (h) => emitted.push(h) });
  g.setConnected(true);
  g.observeHeaderOnce('sound_title');
  g.forget('sound_title');
  assert.equal(g.observeHeaderOnce('sound_title'), true);
  assert.equal(emitted.filter((h) => h === 'sound_title').length, 2);
});

// --- Mode d'authentification (Lot 2C) ---

// 17. resolveAuth anonymous : AUCUNE requête vers /api/v1/auth/guest

test('resolveAuth anonymous : aucun fetch /api/v1/auth/guest', async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; return Promise.resolve({ ok: false, json: () => Promise.resolve({}) }); };
  const auth = await resolveAuth({ serverUrl: 'https://server.collab-hub.io', username: 'u', authMode: 'anonymous', fetchImpl });
  assert.equal(calls, 0, 'anonymous ne doit pas appeler fetch');
  assert.deepEqual(auth, {});
});

// 18. resolveAuth guest : tente /api/v1/auth/guest et utilise le token

test('resolveAuth guest : POST /api/v1/auth/guest + token utilisé', async () => {
  let calledWith = null;
  const fetchImpl = (url, opts) => {
    calledWith = { url, opts };
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ accessToken: 'tok-123' }) });
  };
  const auth = await resolveAuth({ serverUrl: 'https://server.collab-hub.io', username: 'u', authMode: 'guest', fetchImpl });
  assert.equal(calledWith.url, 'https://server.collab-hub.io/api/v1/auth/guest');
  assert.equal(calledWith.opts.method, 'POST');
  assert.deepEqual(auth, { token: 'tok-123' });
});

// 19. mode inconnu -> fallback anonyme (safe, pas de fetch)

test('resolveAuthMode : mode inconnu -> anonymous', async () => {
  assert.equal(resolveAuthMode('anonymous'), 'anonymous');
  assert.equal(resolveAuthMode('guest'), 'guest');
  assert.equal(resolveAuthMode('bogus'), 'anonymous');
  assert.equal(resolveAuthMode(undefined), 'anonymous');
  let calls = 0;
  const fetchImpl = () => { calls++; return Promise.resolve({ ok: false, json: () => Promise.resolve({}) }); };
  const auth = await resolveAuth({ serverUrl: 'https://server.collab-hub.io', username: 'u', authMode: 'bogus', fetchImpl });
  assert.equal(calls, 0);
  assert.deepEqual(auth, {});
});

// 20. buildSocketUrl conserve le namespace /hub (pas de slash initial)

test('buildSocketUrl : namespace /hub sans slash initial', () => {
  assert.equal(buildSocketUrl('https://server.collab-hub.io', 'hub'), 'https://server.collab-hub.io/hub');
  assert.equal(buildSocketUrl('https://server.collab-hub.io/', '/hub/'), 'https://server.collab-hub.io/hub');
  assert.equal(buildSocketUrl('https://server.collab-hub.io', ''), 'https://server.collab-hub.io');
});

// --- Persistance locale (Lot 3A) ---


test('freshness : un seul listener par event (pas de doublon wireSocket)', () => {
  const sock = fakeSocket();
  const guard = createObserveGuard({ emit: () => {} });
  wireSocket(sock, guard, { onStatus: () => {}, onControl: () => {} });
  for (const e of ['connect', 'reconnect', 'reconnect_attempt', 'disconnect', 'connect_error', 'control']) {
    assert.equal(sock.listenerCount(e), 1, `listener unique pour ${e}`);
  }
});

// 11. setServerStatus reflète la connexion
