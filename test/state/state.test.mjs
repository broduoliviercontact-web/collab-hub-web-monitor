// Tests for the state domain — split from the former monolithic test/runTests.mjs (issue #11).
// Behaviour is unchanged; tests and fakes were moved verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeValue, routeControl, KNOWN_HEADERS, STREAM_HEADERS } from '../../src/collabHub/messageRouter.js';
import { createSoundState, DEFAULTS } from '../../src/state/soundState.js';
import { renderField, isSafeHttpUrl, parseSoundLink } from '../../src/ui/renderSoundInfo.js';
import { createObserveGuard, wireSocket } from '../../src/collabHub/observeGuard.js';
import {
  loadSoundState, saveSoundState, clearSoundState,
  STORAGE_KEY, STORAGE_VERSION,
} from '../../src/state/persist.js';
import {
  createFreshnessState, computePublicStatus,
  MAX_ACTIVE_THRESHOLD_MS, CONTENT_FRESH_THRESHOLD_MS, HEARTBEAT_HEADER,
} from '../../src/state/freshness.js';
import {
  createStreamStatus, routeStreamControl,
  STALE_MS, SIGNAL_THRESHOLD,
  STREAM_STATUS, STREAM_SIGNAL,
  clamp01, parseOnAir, parseTimestamp,
  normalizeCount, formatListenerCount,
} from '../../src/state/streamStatus.js';
import {
  createStreamPresencePublisher, DEFAULT_STREAM_THROTTLE_MS,
} from '../../src/control-room/streamPresencePublisher.js';
import {
  buildStreamStatusDOM, renderStreamStatus,
  mountStreamCard, shouldMountStreamCard,
} from '../../src/ui/streamStatusView.js';
import { connectCollabHubPublisher } from '../../src/collabHub/publishClient.js';
import { fakeEls, fakeDocument, fakeEl, fakeDomEl } from '../helpers/dom.mjs';
import { makeClock } from '../helpers/clock.mjs';
import { makeFakeStreamEmitter, meterOf } from '../helpers/stream-fakes.mjs';
import { flush } from '../helpers/flush.mjs';

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    _has: (k) => store.has(k),
  };
}

const SNAP = {
  sound_show_name: 'Radio 2',
  sound_title: 'Morceau A',
  sound_author: 'Auteur A',
  sound_subtitle: 'Sous-titre A',
  sound_description: 'Desc A',
  sound_link: 'https://example.com/a',
};

const FIXED_TS = '2026-07-10T14:00:00.000Z';

const fixedNow = () => FIXED_TS;

function ingestStream(stream, { onAir, level, peak, updatedAt }, now) {
  stream.ingest('stream_onair', [onAir]);
  stream.ingest('stream_level', [level]);
  stream.ingest('stream_peak', [peak]);
  stream.ingest('stream_updated_at', [updatedAt]);
  if (now) { /* no-op : receivedAt déjà posé par ingest */ }
}

function fakePublishSocket() {
  const handlers = {};
  const emitted = [];
  return {
    connected: false,
    id: 'sock-1',
    on(evt, fn) { handlers[evt] = fn; },
    emit(evt, payload) { emitted.push({ evt, ...(payload || {}) }); },
    disconnect() {},
    fire(evt) { if (handlers[evt]) handlers[evt](); },
    setConnected(c) { this.connected = c; },
    emitted,
  };
}

async function makeChPublisher({ headers, clock } = {}) {
  const sock = fakePublishSocket();
  const pub = await connectCollabHubPublisher({
    serverUrl: 'https://server.collab-hub.io',
    namespace: 'hub',
    username: 'test',
    headers,
    ioFactory: () => sock,
    now: clock ? clock.now : () => 1000,
    setTimeoutFn: (fn) => fn(), // synchrone -> flush déterministe après register
  });
  return { pub, sock };
}

function controls(sock, header) {
  return sock.emitted.filter((e) => e.evt === 'control' && e.header === header);
}

test('soundState.set ne modifie que le header concerné', () => {
  const s = createSoundState(DEFAULTS);
  const before = s.snapshot();
  s.set('sound_title', 'Nouveau');
  const after = s.snapshot();
  assert.equal(after.sound_title, 'Nouveau');
  assert.equal(after.sound_author, before.sound_author);
  assert.equal(after.sound_subtitle, before.sound_subtitle);
  assert.equal(after.sound_description, before.sound_description);
  assert.equal(after.sound_link, before.sound_link);
});


test('soundState.set refuse un header inconnu', () => {
  const s = createSoundState(DEFAULTS);
  assert.equal(s.set('unknown', 'x'), false);
});


test('persist : état valide restauré depuis localStorage', () => {
  const st = fakeStorage();
  saveSoundState(st, SNAP, fixedNow);
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_title, 'Morceau A');
  assert.equal(r.fields.sound_show_name, 'Radio 2');
  assert.equal(r.fields.sound_author, 'Auteur A');
  assert.equal(r.fields.sound_link, 'https://example.com/a');
  assert.equal(r.updatedAt, FIXED_TS);
});

// 2. JSON corrompu ignoré

test('persist : JSON corrompu ignoré (retour défauts)', () => {
  const st = fakeStorage();
  st.setItem(STORAGE_KEY, '{not valid json');
  assert.equal(loadSoundState(st), null);
});

// 3. version inconnue ignorée

test('persist : version inconnue ignorée', () => {
  const st = fakeStorage();
  st.setItem(STORAGE_KEY, JSON.stringify({ version: 99, updatedAt: FIXED_TS, fields: SNAP }));
  assert.equal(loadSoundState(st), null);
});

// 4. header inconnu ignoré, connus conservés

test('persist : header inconnu ignoré, connus conservés', () => {
  const st = fakeStorage();
  st.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, updatedAt: FIXED_TS, fields: { ...SNAP, unknown: 'x', evil: '<script>' } }));
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_title, 'Morceau A');
  assert.equal(r.fields.unknown, undefined);
  assert.equal(r.fields.evil, undefined);
});

// 5. type non string ignoré

test('persist : type non string ignoré', () => {
  const st = fakeStorage();
  const bad = { ...SNAP, sound_title: 123, sound_author: { x: 1 }, sound_subtitle: null };
  st.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, updatedAt: FIXED_TS, fields: bad }));
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_title, undefined);
  assert.equal(r.fields.sound_author, undefined);
  assert.equal(r.fields.sound_subtitle, undefined);
  assert.equal(r.fields.sound_link, 'https://example.com/a'); // valide conservé
});

// 6. sound_link invalide masqué après restauration (validation URL au rendu)

test('persist : sound_link invalide restauré puis masqué au rendu', () => {
  const st = fakeStorage();
  st.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, updatedAt: FIXED_TS, fields: { ...SNAP, sound_link: 'javascript:alert(1)' } }));
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_link, 'javascript:alert(1)'); // gardé brut en stockage
  // Au rendu, la validation URL existante masque le lien invalide.
  const els = fakeEls();
  renderField('sound_link', r.fields.sound_link, els);
  assert.equal(els.linkWrap.hidden, true);
  assert.equal(els.link.getAttribute('href'), '#');
});

// 7. sauvegarde après réception d'un contrôle (round-trip via routeControl)

test('persist : sauvegarde après réception d un contrôle', () => {
  const st = fakeStorage();
  const state = createSoundState(DEFAULTS);
  const routed = routeControl({ header: 'sound_title', values: ['Nouveau morceau'] }, (h, v) => state.set(h, v));
  assert.equal(routed, true);
  const saved = saveSoundState(st, state.snapshot(), fixedNow);
  assert.ok(saved, 'sauvegarde a écrit un payload');
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_title, 'Nouveau morceau');
});

// 8. timestamp sauvegardé

test('persist : timestamp sauvegardé', () => {
  const st = fakeStorage();
  const ts = '2026-07-10T14:05:33.000Z';
  saveSoundState(st, SNAP, () => ts);
  const r = loadSoundState(st);
  assert.equal(r.updatedAt, ts);
  // le payload brut contient bien updatedAt + version
  const raw = JSON.parse(st.getItem(STORAGE_KEY));
  assert.equal(raw.version, STORAGE_VERSION);
  assert.equal(raw.updatedAt, ts);
});

// 9. effacement du stockage

test('persist : clearSoundState efface la clé', () => {
  const st = fakeStorage();
  saveSoundState(st, SNAP, fixedNow);
  assert.equal(st._has(STORAGE_KEY), true);
  assert.equal(clearSoundState(st), true);
  assert.equal(st._has(STORAGE_KEY), false);
  assert.equal(loadSoundState(st), null);
});

// 10. absence de localStorage ne casse pas l'application

test('persist : storage nul/manquant ne lève jamais', () => {
  assert.equal(loadSoundState(null), null);
  assert.equal(loadSoundState(undefined), null);
  assert.equal(saveSoundState(null, SNAP, fixedNow), false);
  assert.equal(clearSoundState(null), false);
  // storage sans les méthodes attendues
  assert.equal(loadSoundState({}), null);
  assert.equal(saveSoundState({}, SNAP, fixedNow), false);
});

// --- Fraîcheur / heartbeat Max (Lot 3B) ---
// Horloge injectable pour des tests déterministes (avance manuelle du temps).

test('freshness : heartbeat met à jour maxLastSeenAt, pas le contenu', () => {
  const c = makeClock(1000);
  const f = createFreshnessState({ now: c.now });
  f.onHeartbeat();
  assert.equal(f.getMaxLastSeenAt(), 1000);
  assert.equal(f.getContentLastUpdatedAt(), null); // contenu non touché
});

// 2. heartbeat ne modifie aucun champ de contenu

test('freshness : heartbeat n altère pas contentLastUpdatedAt', () => {
  const c = makeClock(5000);
  const f = createFreshnessState({ now: c.now });
  f.onContentUpdate(); // contenu daté
  assert.equal(f.getContentLastUpdatedAt(), 5000);
  f.onHeartbeat();     // heartbeat arrive
  assert.equal(f.getContentLastUpdatedAt(), 5000); // contenu inchangé
  assert.equal(f.getMaxLastSeenAt(), 5000);
});

// 3. heartbeat n est pas persisté (loadSoundState ne contient jamais sound_heartbeat)

test('freshness : sound_heartbeat absent de l état persisté', () => {
  const st = fakeStorage();
  // On simule une sauvegarde après réception d un heartbeat + contenu.
  const state = createSoundState(DEFAULTS);
  state.set('sound_title', 'Titre');
  // Le heartbeat n entre jamais dans state (header technique) -> snapshot ne le contient pas.
  const snap = state.snapshot();
  assert.equal(snap.sound_heartbeat, undefined);
  assert.equal(snap.sound_title, 'Titre');
  saveSoundState(st, snap, fixedNow);
  const r = loadSoundState(st);
  assert.equal(r.fields.sound_heartbeat, undefined);
  assert.equal(r.fields.sound_title, 'Titre');
});

// 4. Max actif sous le seuil

test('freshness : Max actif si heartbeat < MAX_ACTIVE_THRESHOLD_MS', () => {
  const c = makeClock(0);
  const f = createFreshnessState({ now: c.now });
  assert.equal(f.isMaxActive(), false); // jamais de heartbeat
  f.onHeartbeat();
  c.advance(MAX_ACTIVE_THRESHOLD_MS - 1);
  assert.equal(f.isMaxActive(), true);
});

// 5. Max silencieux au-dessus du seuil

test('freshness : Max silencieux si heartbeat > MAX_ACTIVE_THRESHOLD_MS', () => {
  const c = makeClock(0);
  const f = createFreshnessState({ now: c.now });
  f.onHeartbeat();
  c.advance(MAX_ACTIVE_THRESHOLD_MS + 1);
  assert.equal(f.isMaxActive(), false);
});

// 6. contenu récent sous le seuil

test('freshness : contenu récent si màj < CONTENT_FRESH_THRESHOLD_MS', () => {
  const c = makeClock(0);
  const f = createFreshnessState({ now: c.now });
  f.onContentUpdate();
  c.advance(CONTENT_FRESH_THRESHOLD_MS - 1);
  assert.equal(f.isContentFresh(), true);
});

// 7. contenu ancien au-dessus du seuil

test('freshness : contenu ancien si màj > CONTENT_FRESH_THRESHOLD_MS', () => {
  const c = makeClock(0);
  const f = createFreshnessState({ now: c.now });
  f.onContentUpdate();
  c.advance(CONTENT_FRESH_THRESHOLD_MS + 1);
  assert.equal(f.isContentFresh(), false);
});

// 8. contenu restauré ancien correctement détecté

test('freshness : contenu restauré ancien détecté via restoreContent', () => {
  const c = makeClock(10_000_000); // now lointain
  const f = createFreshnessState({ now: c.now });
  f.restoreContent(c.now() - (CONTENT_FRESH_THRESHOLD_MS + 5000)); // restauré vieux
  assert.equal(f.isContentFresh(), false);
  f.restoreContent(c.now() - 1000); // restauré récent
  assert.equal(f.isContentFresh(), true);
});

// 9. server disconnect prioritaire sur Max actif

test('freshness : computePublicStatus priorise le serveur sur Max actif', () => {
  const f = createFreshnessState();
  f.setServerStatus('connected');
  f.onHeartbeat();
  assert.equal(computePublicStatus('connected', true), 'max_active');
  assert.equal(computePublicStatus('connected', false), 'max_silent');
  // serveur down : on ne montre jamais max_active/silent
  assert.equal(computePublicStatus('disconnected', true), 'disconnected');
  assert.equal(computePublicStatus('error', true), 'disconnected');
  assert.equal(computePublicStatus('reconnecting', true), 'reconnecting');
});

// 10. aucun listener/timer dupliqué : wireSocket attache un listener unique

test('freshness : setServerStatus reflète connecté/déconnecté', () => {
  const f = createFreshnessState();
  assert.equal(f.isServerConnected(), false);
  f.setServerStatus('connected');
  assert.equal(f.isServerConnected(), true);
  f.setServerStatus('disconnected');
  assert.equal(f.isServerConnected(), false);
  f.setServerStatus('error');
  assert.equal(f.isServerConnected(), false);
});

// 12. âges retournent null quand jamais reçu

test('freshness : ages null tant qu aucun heartbeat/màj', () => {
  const f = createFreshnessState();
  assert.equal(f.maxAgeMs(), null);
  assert.equal(f.contentAgeMs(), null);
  f.onHeartbeat();
  assert.ok(f.maxAgeMs() >= 0);
  assert.equal(f.contentAgeMs(), null);
});

// 13. header technique sound_heartbeat défini

test('freshness : HEARTBEAT_HEADER = sound_heartbeat', () => {
  assert.equal(HEARTBEAT_HEADER, 'sound_heartbeat');
  assert.equal(MAX_ACTIVE_THRESHOLD_MS, 25000);
  assert.equal(CONTENT_FRESH_THRESHOLD_MS, 300000);
});

// --- check-license.mjs : fonctions pures (Lot 3F) ---
// Données valides de référence (ne touche pas aux vrais fichiers).

test('streamStatus : onair=1 + niveau haut -> EN DIRECT / présent', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  ingestStream(s, { onAir: 1, level: 0.5, peak: 0.8, updatedAt: 1000 });
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.LIVE);
  assert.equal(snap.signal, STREAM_SIGNAL.PRESENT);
  assert.equal(snap.signalPresent, true);
  assert.equal(snap.onAir, 1);
});

// 2. onair=1 + niveau bas -> EN DIRECT / silence

test('streamStatus : onair=1 + niveau bas -> EN DIRECT / silence', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  ingestStream(s, { onAir: 1, level: 0.001, peak: 0.002, updatedAt: 1000 });
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.LIVE);
  assert.equal(snap.signal, STREAM_SIGNAL.SILENT);
  assert.equal(snap.signalPresent, false);
});

// 3. onair=0 -> HORS ANTENNE

test('streamStatus : onair=0 (frais) -> HORS ANTENNE', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  ingestStream(s, { onAir: 0, level: 0, peak: 0, updatedAt: 1000 });
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.OFF_AIR);
  assert.equal(snap.signal, STREAM_SIGNAL.NONE);
  assert.equal(snap.fresh, true);
});

// 4. timestamp stale -> STATUT INDISPONIBLE (pas de faux EN DIRECT)

test('streamStatus : stale -> STATUT INDISPONIBLE (pas de faux EN DIRECT)', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  ingestStream(s, { onAir: 1, level: 0.5, peak: 0.8, updatedAt: 1000 });
  c.advance(STALE_MS + 500); // > 3 s sans mise à jour
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.UNAVAILABLE);
  assert.equal(snap.fresh, false);
  assert.equal(snap.signal, STREAM_SIGNAL.NONE);
});

// 5. payload invalide -> fallback sûr (INDISPONIBLE, niveau 0)

test('streamStatus : payload invalide -> fallback sûr', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  assert.equal(s.getSnapshot().computedStatus, STREAM_STATUS.UNAVAILABLE);
  // onair invalide -> on conserve null (fallback), pas de faux EN DIRECT
  s.ingest('stream_onair', ['maybe']);
  s.ingest('stream_level', ['not-a-number']);
  s.ingest('stream_peak', [null]);
  s.ingest('stream_updated_at', ['garbage']);
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.UNAVAILABLE);
  assert.equal(snap.level, 0);
  assert.equal(snap.peak, 0);
  assert.equal(snap.onAir, null);
});

// 6. meter borné 0..1 (clamp01 + publisher clamp)

test('streamStatus : clamp01 borne 0..1 (invalides -> 0, >1 -> 1)', () => {
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(2.5), 1);
  assert.equal(clamp01(-0.3), 0);
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01('abc'), 0);
});

// 7. throttle respecté (publisher)

test('routeStreamControl : route les headers de flux, ignore les autres', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  // header de flux -> routé
  assert.equal(routeStreamControl({ header: 'stream_onair', values: [1] }, s), true);
  assert.equal(s.getSnapshot().onAir, 1);
  // header de contenu (non flux) -> non routé
  assert.equal(routeStreamControl({ header: 'sound_title', values: ['x'] }, s), false);
  // data invalide -> non routé
  assert.equal(routeStreamControl(null, s), false);
  assert.equal(routeStreamControl({ header: 'unknown', values: [1] }, s), false);
});

// 9b. routeStreamControl alimente un EN DIRECT cohérent

test('routeStreamControl : headers complets -> EN DIRECT / présent', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_onair', values: [1] }, s);
  routeStreamControl({ header: 'stream_level', values: [0.4] }, s);
  routeStreamControl({ header: 'stream_peak', values: [0.7] }, s);
  routeStreamControl({ header: 'stream_updated_at', values: [1000] }, s);
  const snap = s.getSnapshot();
  assert.equal(snap.computedStatus, STREAM_STATUS.LIVE);
  assert.equal(snap.signalPresent, true);
  assert.equal(snap.peak, 0.7);
});

// 10. listener existant non régressé : bouton ÉCOUTER LE DIRECT inchangé,
//     titre de section changé (plus de doublon "DIRECT AUDIO"), DOM construit.

test('streamStatus/publisher : aucun secret/token/password dans snapshots', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  ingestStream(s, { onAir: 1, level: 0.5, peak: 0.8, updatedAt: 1000 });
  const snap = s.getSnapshot();
  const snapJson = JSON.stringify(snap);
  assert.ok(!/token|password|apiKey|apiSecret|secret|cookie/i.test(snapJson));

  const em = makeFakeStreamEmitter();
  const p = createStreamPresencePublisher({ now: c.now, throttleMs: 400, emitter: em });
  p.update({ onAir: true }, meterOf(0.5, 0.8));
  const diag = p.getDiagnostics();
  const diagJson = JSON.stringify(diag);
  assert.ok(!/token|password|apiKey|apiSecret|secret|cookie/i.test(diagJson));
  assert.equal(typeof diag.publishCount, 'number');
  assert.equal(typeof diag.throttleMs, 'number');
});

// 12. reduced-motion propre : renderStreamStatus pose des largeurs (pas de
//     transition inline) + data-stream-status, sans dépendre d'une animation.

test('streamStatus : seuils et constantes stables', () => {
  assert.equal(STALE_MS, 3000);
  assert.equal(SIGNAL_THRESHOLD, 0.01);
  assert.deepEqual(STREAM_HEADERS, ['stream_onair', 'stream_level', 'stream_peak', 'stream_updated_at', 'stream_listener_count']);
  assert.equal(DEFAULT_STREAM_THROTTLE_MS, 400);
  assert.equal(parseOnAir(1), 1);
  assert.equal(parseOnAir('0'), 0);
  assert.equal(parseOnAir('maybe'), null);
  assert.equal(parseTimestamp(1000), 1000);
  assert.equal(parseTimestamp('2026-07-11T09:00:00Z') != null, true);
  assert.equal(parseTimestamp('garbage'), null);
});


test('publishClient : aucun deliver avant connexion, valeur mise en file', async () => {
  const { pub, sock } = await makeChPublisher({});
  pub.publish('stream_onair', [1]);
  assert.equal(sock.emitted.length, 0, 'rien émis avant connexion');
  const d = pub.getDiagnostics();
  assert.equal(d.connected, false);
  assert.deepEqual(d.pendingHeaders, ['stream_onair']);
});

// H2. chaque header enregistré une seule fois à la connexion

test('publishClient : enregistre chaque header une fois à la connexion', async () => {
  const { pub, sock } = await makeChPublisher({});
  sock.setConnected(true); sock.fire('connect');
  const ctl = sock.emitted.filter((e) => e.evt === 'control');
  assert.equal(ctl.length, STREAM_HEADERS.length, 'un publish d enregistrement par header de flux');
  for (const h of STREAM_HEADERS) {
    assert.equal(controls(sock, h).length, 1, `${h} enregistré une fois`);
  }
  assert.deepEqual(pub.getDiagnostics().registeredHeaders.sort(), [...STREAM_HEADERS].sort());
});

// H3. register avant deliver (header non pré-enregistré)

test('publishClient : register avant deliver (1er publish enregistre puis livre)', async () => {
  const { pub, sock } = await makeChPublisher({ headers: ['stream_onair'] }); // 1 seul pré-enregistré
  sock.setConnected(true); sock.fire('connect'); // register stream_onair
  const before = sock.emitted.length;
  pub.publish('stream_level', [0.5]); // stream_level non enregistré -> register puis deliver
  const lvl = controls(sock, 'stream_level');
  assert.equal(lvl.length, 2, 'un register + un deliver');
  assert.deepEqual(lvl[0].values, [0], 'register avec valeur neutre (no push)');
  assert.deepEqual(lvl[1].values, [0.5], 'deliver avec la valeur publiée');
  assert.ok(pub.isRegistered('stream_level'));
  assert.equal(before + 2, sock.emitted.length);
});

// H4. première valeur livrée après enregistrement

test('publishClient : 1re valeur livrée après register (flush pending)', async () => {
  const { pub, sock } = await makeChPublisher({ headers: [] }); // aucun pré-enregistré
  sock.setConnected(true); sock.fire('connect');
  pub.publish('stream_onair', [1]);
  const onair = controls(sock, 'stream_onair');
  assert.equal(onair.length, 2);
  assert.deepEqual(onair[1].values, [1], 'la valeur livrée est bien [1]');
  assert.equal(pub.getDiagnostics().deliverCount >= 1, true);
});

// H5. mises à jour multiples ne réenregistrent pas

test('publishClient : updates multiples ne réenregistrent pas (idempotent)', async () => {
  const { pub, sock } = await makeChPublisher({});
  sock.setConnected(true); sock.fire('connect'); // 4 registers
  const registersAfterConnect = sock.emitted.length;
  pub.publish('stream_onair', [1]);
  pub.publish('stream_onair', [0.6]);
  pub.publish('stream_onair', [0.3]);
  const onair = controls(sock, 'stream_onair');
  assert.equal(onair.length, 4, '1 register + 3 delivers, pas de re-register');
  assert.deepEqual(onair.slice(1).map((e) => e.values), [[1], [0.6], [0.3]]);
  assert.equal(sock.emitted.length, registersAfterConnect + 3, 'aucun emit parasite');
});

// H6. reconnexion -> réenregistrement

test('publishClient : reconnexion réenregistre les headers', async () => {
  const { pub, sock } = await makeChPublisher({});
  sock.setConnected(true); sock.fire('connect');   // 4 registers
  sock.setConnected(false); sock.fire('disconnect');
  assert.equal(pub.getDiagnostics().connected, false);
  assert.equal(pub.getDiagnostics().registeredHeaders.length, 0, 'registered vidé au disconnect');
  sock.setConnected(true); sock.fire('connect');   // 4 nouveaux registers
  const ctl = sock.emitted.filter((e) => e.evt === 'control');
  assert.equal(ctl.length, STREAM_HEADERS.length * 2, 'registers initiaux + registers après reconnexion');
  for (const h of STREAM_HEADERS) assert.equal(controls(sock, h).length, 2, `${h} enregistré 2x`);
});

// H7. valeur la plus récente conservée pendant la déconnexion

test('publishClient : dernière valeur conservée puis livrée après reconnexion', async () => {
  const { pub, sock } = await makeChPublisher({});
  pub.publish('stream_onair', [1]);    // déconnecté -> file
  pub.publish('stream_onair', [0.7]);  // écrase la précédente
  assert.equal(sock.emitted.length, 0);
  sock.setConnected(true); sock.fire('connect'); // register + flush pending
  const onair = controls(sock, 'stream_onair');
  // register ([0]) puis deliver de la dernière valeur ([0.7], pas [1])
  const delivered = onair.map((e) => JSON.stringify(e.values));
  assert.ok(delivered.includes('[0.7]'), 'dernière valeur [0.7] livrée');
  assert.ok(!delivered.includes('[1]'), 'ancienne valeur [1] écrasée, non livrée');
});

// H8. stop -> onair=0 livré (streamPresencePublisher)

test('observation publique : les headers de flux sont observés une fois', () => {
  const emitted = [];
  const g = createObserveGuard({ emit: (h) => emitted.push(h) });
  g.setConnected(true);
  for (const h of STREAM_HEADERS) g.observeHeaderOnce(h);
  assert.equal(emitted.length, STREAM_HEADERS.length);
  assert.deepEqual([...new Set(emitted)].sort(), [...STREAM_HEADERS].sort());
  // réobserver -> idempotent (pas de double émission)
  for (const h of STREAM_HEADERS) g.observeHeaderOnce(h);
  assert.equal(emitted.length, STREAM_HEADERS.length);
});

// H10. payload reçu met à jour streamStatus (routeStreamControl)

test('routeStreamControl : payload reçu met à jour streamStatus', () => {
  const c = makeClock(2000);
  const s = createStreamStatus({ now: c.now });
  assert.equal(routeStreamControl({ header: 'sound_title', values: ['x'] }, s), false, 'header non-flux ignoré');
  assert.equal(routeStreamControl({ header: 'stream_onair', values: [1] }, s), true);
  c.advance(10);
  assert.equal(routeStreamControl({ header: 'stream_level', values: [0.5] }, s), true);
  const snap = s.getSnapshot();
  assert.equal(snap.onAir, 1);
  assert.equal(snap.level, 0.5);
  assert.equal(snap.computedStatus, STREAM_STATUS.LIVE);
  const diag = s.getDiagnostics();
  assert.equal(diag.receivedCount.stream_onair, 1);
  assert.equal(diag.receivedCount.stream_level, 1);
  assert.equal(diag.lastStreamHeader, 'stream_level');
});

// H11. pas de régression des 6 headers sound_* (routeControl réservé aux contenus)

test('routage : routeControl accepte sound_*, routeStreamControl accepte stream_*', () => {
  let sound = null;
  assert.equal(routeControl({ header: 'sound_title', values: ['Morceau'] }, (h, v) => { sound = v; }), true);
  assert.equal(sound, 'Morceau');
  assert.equal(routeControl({ header: 'stream_onair', values: [1] }, () => {}), false, 'stream_* non routé par routeControl');
  const s = createStreamStatus({ now: () => 1000 });
  assert.equal(routeStreamControl({ header: 'sound_title', values: ['x'] }, s), false, 'sound_* non routé par routeStreamControl');
});

// H12. aucun secret dans les diagnostics (publisher + streamStatus)

test('diagnostics : aucun secret/token/password dans publisher + streamStatus', async () => {
  const secretPat = /token|secret|password|api[-_]?key|apiKey/i;
  const c = makeClock(1000);
  const st = createStreamStatus({ now: c.now });
  st.ingest('stream_onair', [1]);
  st.ingest('stream_level', [0.4]);
  const snapJson = JSON.stringify({ ...st.getSnapshot(), ...st.getDiagnostics() });
  assert.ok(!secretPat.test(snapJson), 'streamStatus: aucun secret dans snapshot+diag');
  // publisher diag : publisher non connecté (diag par défaut).
  const { pub } = await makeChPublisher({});
  const dJson = JSON.stringify(pub.getDiagnostics());
  assert.ok(!secretPat.test(dJson), 'publishClient: aucun secret dans diagnostics');
});


test('stream-card : masquée hors debug (aucun DOM .stream-card créé)', () => {
  const doc = fakeDocument();
  const card = doc.querySelector('main.card');
  const st = createStreamStatus({ now: () => 1000 });
  const mounted = mountStreamCard(doc, card, { debug: false, livekitEnabled: true, streamStatus: st });
  assert.equal(mounted, null);
  assert.ok(!doc._created.some((e) => e.className && e.className.includes('stream-card')),
    'aucune .stream-card créée hors debug');
});

// A2. en debug, .stream-card présente et fonctionnelle

test('stream-card : présente et rendue en mode debug', () => {
  const doc = fakeDocument();
  const card = doc.querySelector('main.card');
  const st = createStreamStatus({ now: () => 1000 });
  ingestStream(st, { onAir: 1, level: 0.5, peak: 0.8, updatedAt: 1000 });
  const mounted = mountStreamCard(doc, card, { debug: true, livekitEnabled: true, streamStatus: st });
  assert.ok(mounted && mounted.section, 'carte montée en debug');
  const section = doc._created.find((e) => e.className && e.className.includes('stream-card'));
  assert.ok(section, '.stream-card présente');
  assert.equal(section._attrs['data-stream-status'], STREAM_STATUS.LIVE, 'snapshot initial rendu');
});

// A3. listener visible dans les deux cas (debug n'affecte pas le listener)

test('diagnostic flux : cohérent hors debug (routage actif sans carte)', () => {
  const c = makeClock(1000);
  const st = createStreamStatus({ now: c.now });
  // Carte non montée (debug=false) mais logique métier active :
  routeStreamControl({ header: 'stream_onair', values: [1] }, st);
  routeStreamControl({ header: 'stream_level', values: [0.5] }, st);
  const merged = { ...st.getSnapshot(), ...st.getDiagnostics() };
  assert.equal(merged.computedStatus, STREAM_STATUS.LIVE);
  assert.equal(merged.receivedCount.stream_onair, 1);
  assert.equal(merged.receivedCount.stream_level, 1);
  assert.equal(merged.lastStreamHeader, 'stream_level');
});

// A5. règle de montage + pas de régression des headers stream_*

test('normalizeCount : décimal -> floor, négatif/invalide -> null', () => {
  assert.equal(normalizeCount(3.9), 3);
  assert.equal(normalizeCount('2'), 2);
  assert.equal(normalizeCount(-1), null);
  assert.equal(normalizeCount(null), null);
  assert.equal(normalizeCount('abc'), null);
  assert.equal(normalizeCount(undefined), null);
});

// 10. formatListenerCount : singulier/pluriel

test('formatListenerCount : 0/1 singulier, >=2 pluriel', () => {
  assert.equal(formatListenerCount(0), '0 auditeur');
  assert.equal(formatListenerCount(1), '1 auditeur');
  assert.equal(formatListenerCount(2), '2 auditeurs');
  assert.equal(formatListenerCount(12), '12 auditeurs');
});

// 11. streamStatus : ingestion stream_listener_count valide -> label

test('streamStatus : ingestion compteur valide -> listenerCountLabel', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [3] }, s);
  const snap = s.getSnapshot();
  assert.equal(snap.listenerCount, 3);
  assert.equal(snap.listenerCountKnown, true);
  assert.equal(snap.listenerCountLabel, '3 auditeurs');
});

// 12. streamStatus : 0 auditeur (off-air fresh)

test('streamStatus : compteur 0 -> "0 auditeur"', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [0] }, s);
  assert.equal(s.getSnapshot().listenerCountLabel, '0 auditeur');
});

// 13. streamStatus : 1 auditeur

test('streamStatus : compteur 1 -> "1 auditeur"', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [1] }, s);
  assert.equal(s.getSnapshot().listenerCountLabel, '1 auditeur');
});

// 14. streamStatus : décimal normalisé en entier

test('streamStatus : compteur décimal normalisé (3.9 -> 3)', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [3.9] }, s);
  assert.equal(s.getSnapshot().listenerCount, 3);
});

// 15. streamStatus : valeur invalide -> "Auditeurs : —"

test('streamStatus : compteur invalide -> "Auditeurs : —"', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: ['abc'] }, s);
  const snap = s.getSnapshot();
  assert.equal(snap.listenerCount, null);
  assert.equal(snap.listenerCountKnown, false);
  assert.equal(snap.listenerCountLabel, 'Auditeurs : —');
});

// 16. streamStatus : valeur négative -> "Auditeurs : —"

test('streamStatus : compteur négatif -> "Auditeurs : —"', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [-5] }, s);
  assert.equal(s.getSnapshot().listenerCountLabel, 'Auditeurs : —');
});

// 17. streamStatus : stale -> CONSERVE le dernier compte (issue #1).
// Le header stream_listener_count est publié sur les changements de participants
// (event-driven, pas à chaque tick VU). Un gate STALE_MS ferait revenir le
// compteur à "Auditeurs : —" entre deux publications — notamment pendant un
// réglage de volume de plusieurs secondes (le tick 1 s repeint '—'). Issue #1 :
// le compteur doit conserver son dernier état connu ; "Auditeurs : —" seulement
// si aucun compte valide n'a jamais été reçu (ou si la dernière valeur reçue
// était invalide).

test('streamStatus : compteur stale -> conserve le dernier compte (ne revient pas à —)', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [2] }, s);
  c.advance(STALE_MS + 1); // > 3 s sans nouveau header (ex : pendant réglage volume)
  const snap = s.getSnapshot();
  assert.equal(snap.listenerCountKnown, true, 'known persiste après stale');
  assert.equal(snap.listenerCount, 2, 'count persiste après stale');
  assert.equal(snap.listenerCountLabel, '2 auditeurs', 'label persiste (ne revient pas à —)');
});

// 17b. issue #1 : variants du compteur qui doivent toutes persister après stale.

test('issue #1 : compteur 0 stale -> conserve "0 auditeur"', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [0] }, s);
  c.advance(STALE_MS + 1);
  assert.equal(s.getSnapshot().listenerCountLabel, '0 auditeur');
});

test('issue #1 : compteur 1 stale -> conserve "1 auditeur"', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [1] }, s);
  c.advance(STALE_MS + 1);
  assert.equal(s.getSnapshot().listenerCountLabel, '1 auditeur');
});

test('issue #1 : compteur pluriel stale -> conserve "12 auditeurs"', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [12] }, s);
  c.advance(STALE_MS + 1);
  assert.equal(s.getSnapshot().listenerCountLabel, '12 auditeurs');
});

test('issue #1 : compteur jamais reçu -> reste "Auditeurs : —" (même après stale)', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  c.advance(STALE_MS + 1);
  const snap = s.getSnapshot();
  assert.equal(snap.listenerCountKnown, false);
  assert.equal(snap.listenerCountLabel, 'Auditeurs : —');
});

test('issue #1 : le compteur se met à jour quand un nouveau nombre arrive (même après stale)', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [2] }, s);
  c.advance(STALE_MS + 1);
  assert.equal(s.getSnapshot().listenerCountLabel, '2 auditeurs');
  c.advance(1);
  routeStreamControl({ header: 'stream_listener_count', values: [5] }, s);
  assert.equal(s.getSnapshot().listenerCountLabel, '5 auditeurs');
});

test('issue #1 : valeur invalide reçue -> "Auditeurs : —" (réinitialise le compte connu)', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [2] }, s);
  assert.equal(s.getSnapshot().listenerCountLabel, '2 auditeurs');
  // La Control Room envoie explicitement une valeur inexploitable -> inconnu.
  routeStreamControl({ header: 'stream_listener_count', values: ['abc'] }, s);
  const snap = s.getSnapshot();
  assert.equal(snap.listenerCountKnown, false);
  assert.equal(snap.listenerCountLabel, 'Auditeurs : —');
});

test('issue #1 : diagnostics compteur stale -> conserve (cohérent avec affichage public)', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [2] }, s);
  c.advance(STALE_MS + 1);
  const d = s.getDiagnostics();
  assert.equal(d.listenerCount, 2, 'diagnostic count persiste');
  assert.equal(d.listenerCountKnown, true, 'diagnostic known persiste');
  assert.equal(d.listenerCountLabel, '2 auditeurs', 'diagnostic label persiste');
});

// 18. streamStatus : jamais reçu -> "Auditeurs : —"

test('streamStatus : compteur jamais reçu -> "Auditeurs : —"', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  const snap = s.getSnapshot();
  assert.equal(snap.listenerCountKnown, false);
  assert.equal(snap.listenerCountLabel, 'Auditeurs : —');
});

// 19. streamStatus : diagnostics compteur (aucune identité)

test('streamStatus : diagnostics compteur (raw/count/known/label/receivedAt)', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [2] }, s);
  const d = s.getDiagnostics();
  assert.equal(d.rawListenerCount, 2);
  assert.equal(d.listenerCount, 2);
  assert.equal(d.listenerCountKnown, true);
  assert.equal(d.listenerCountLabel, '2 auditeurs');
  assert.equal(d.listenerCountReceivedAt, 1000);
  assert.equal(d.receivedCount.stream_listener_count, 1);
});

// 20. streamStatus : reset efface le compteur

test('streamStatus : reset efface le compteur d auditeurs', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  routeStreamControl({ header: 'stream_listener_count', values: [2] }, s);
  s.reset();
  const d = s.getDiagnostics();
  assert.equal(d.listenerCount, null);
  assert.equal(d.rawListenerCount, null);
  assert.equal(d.receivedCount.stream_listener_count, 0);
});

// 21. publisher : liveListenerCount dans le snapshot après connexion

test('routeStreamControl : stream_listener_count est un header de flux routé', () => {
  const c = makeClock(1000);
  const s = createStreamStatus({ now: c.now });
  assert.equal(routeStreamControl({ header: 'stream_listener_count', values: [4] }, s), true);
  assert.equal(s.getSnapshot().listenerCount, 4);
});

// 37. non-régression : stream-card reste debug-only (shouldMountStreamCard)

test('publishClient : stream_listener_count enregistré à la connexion', async () => {
  const { pub, sock } = await makeChPublisher({});
  sock.setConnected(true); sock.fire('connect');
  const cnt = controls(sock, 'stream_listener_count');
  assert.equal(cnt.length, 1, 'stream_listener_count enregistré une fois');
  assert.deepEqual(cnt[0].values, [0], 'register avec valeur neutre');
  assert.ok(pub.isRegistered('stream_listener_count'));
});
