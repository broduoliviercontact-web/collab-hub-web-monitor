// Tests for the diagnostic domain — split from the former monolithic test/runTests.mjs (issue #11).
// Behaviour is unchanged; tests and fakes were moved verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderField, isSafeHttpUrl, parseSoundLink } from '../../src/ui/renderSoundInfo.js';
import { initDiagnostic } from '../../src/diagnostic/diagnosticPanel.js';
import {
  createStreamStatus, routeStreamControl,
  STREAM_HEADERS, STALE_MS, SIGNAL_THRESHOLD,
  STREAM_STATUS, STREAM_SIGNAL,
  clamp01, parseOnAir, parseTimestamp,
  normalizeCount, formatListenerCount,
} from '../../src/state/streamStatus.js';
import {
  createBoundedEventLog, DEFAULT_MAX_ENTRIES,
} from '../../src/diagnostic/boundedEventLog.js';
import {
  deriveSystemHealth, HEALTH,
} from '../../src/diagnostic/systemHealth.js';
import {
  createHeaderTracker, deriveHeadersTable, HEADERS_TABLE, HEADER_STATUS, truncateRaw,
} from '../../src/diagnostic/headerTracker.js';
import {
  buildRuntimeConfig, redactLiveKitUrl,
} from '../../src/diagnostic/runtimeConfig.js';
import {
  sanitizeDiagnostic, redactIdentity, redactSensitiveInString,
} from '../../src/diagnostic/diagnosticSanitizer.js';
import { getListenerNetworkStats } from '../../src/diagnostic/networkStats.js';
import { buildDiagnosticExport } from '../../src/diagnostic/diagnosticExport.js';
import {
  shouldMountPublicDebug, controlRoomDebugAllowed,
} from '../../src/diagnostic/debugGate.js';
import { fakeDocument, fakeEls, fakeDomEl, fakeEl } from '../helpers/dom.mjs';
import { fakeSocket } from '../helpers/socket.mjs';


test('listenerUI : diagnostic panel + extension LiveKit (refreshLivekit)', () => {
  // diagnosticPanel utilise le `document` global pour createElement (liste des
  // headers) -> on stubbe globalThis.document le temps du test.
  const root = fakeDocument();
  const origDoc = globalThis.document;
  globalThis.document = fakeDocument();
  try {
    const fakeSocket = { id: 'sock-1', on() {}, onAny() {}, offAny() {}, emit() {} };
    const api = {
      socket: fakeSocket,
      observeHeaderOnce() {}, observeKnownHeadersOnce() {}, isObserved: () => true, forget() {},
    };
    const diag = initDiagnostic(api, root, {
      livekitDiag: () => ({ enabled: true, snapshot: { state: 'playing', roomName: 'main', identity: 'listener-1', participantCount: 2, audioTrackSid: 'tr-9', performerIdentity: 'performer-1', volume: 0.6, muted: false, autoplayBlocked: false, reconnectCount: 1, lastError: null } }),
    });
    diag.refreshLivekit();
    assert.equal(root.querySelector('diag-lk-enabled').textContent, 'oui');
    assert.equal(root.querySelector('diag-lk-state').textContent, 'playing');
    assert.equal(root.querySelector('diag-lk-room').textContent, 'main');
    assert.equal(root.querySelector('diag-lk-participants').textContent, '2');
    // Lot Ops Debug : SID de piste auditeur MASQUÉ (redactIdentity) — jamais complet.
    assert.equal(root.querySelector('diag-lk-track').textContent, 'tr•••');
    // Identity auditeur MASQUÉE également.
    assert.equal(root.querySelector('diag-lk-identity').textContent, 'list•••');
    // Identity performer conservée (non personnelle, utile à l'exploitation).
    assert.equal(root.querySelector('diag-lk-performer').textContent, 'performer-1');
    assert.equal(root.querySelector('diag-lk-volume').textContent, '60%');
    assert.equal(root.querySelector('diag-lk-reconnects').textContent, '1');
    // Le diagnostic existant (Connexion) fonctionne toujours.
    diag.setStatus('connected');
    assert.equal(root.querySelector('diag-conn-state').textContent, 'connecté');
  } finally {
    globalThis.document = origDoc;
  }
});


test('ops : debug public désactivé par défaut (sans variable true)', () => {
  assert.equal(shouldMountPublicDebug({ debugParam: '1', publicDebugEnabled: false }), false);
  assert.equal(shouldMountPublicDebug({ debugParam: '1', publicDebugEnabled: undefined }), false);
  assert.equal(shouldMountPublicDebug({ debugParam: '1' }), false);
});


test('ops : debug public activé uniquement avec variable exactement true', () => {
  assert.equal(shouldMountPublicDebug({ debugParam: '1', publicDebugEnabled: true }), true);
  // 'true' string -> false (la porte reçoit le bool déjà résolu ; la résolution
  // VITE_PUBLIC_DEBUG_ENABLED === "true" se fait côté publicPage).
  assert.equal(shouldMountPublicDebug({ debugParam: '1', publicDebugEnabled: 'true' }), false);
  assert.equal(shouldMountPublicDebug({ debugParam: '0', publicDebugEnabled: true }), false);
});


test('ops : debug public non monté hors ?debug=1', () => {
  assert.equal(shouldMountPublicDebug({ debugParam: null, publicDebugEnabled: true }), false);
  assert.equal(shouldMountPublicDebug({ debugParam: '', publicDebugEnabled: true }), false);
});

// --- 23 : page publique normale inchangée (rendu hors debug identique) ---
// Le travail Ops Debug ne doit pas altérer le rendu public normal : les 5 champs
// se rendent comme avant, indépendamment de la gate debug. On vérifie aussi que
// la gate reste false dans la configuration de production (var false + ?debug=1).

test('ops : page publique normale inchangée (rendu 5 champs hors debug)', () => {
  assert.equal(shouldMountPublicDebug({ debugParam: '1', publicDebugEnabled: false }), false);
  const els = fakeEls();
  renderField('sound_title', 'Titre A', els);
  renderField('sound_author', 'Auteur A', els);
  renderField('sound_subtitle', 'Sous-titre A', els);
  renderField('sound_description', 'Description A', els);
  renderField('sound_link', 'https://example.com', els);
  assert.equal(els.title.textContent, 'Titre A');
  assert.equal(els.author.textContent, 'Auteur A');
  assert.equal(els.subtitle.textContent, 'Sous-titre A');
  assert.equal(els.description.textContent, 'Description A');
  assert.equal(els.linkWrap.hidden, false);
  assert.equal(els.link.getAttribute('href'), 'https://example.com');
});


test('ops : control-room debug exige session authentifiée', () => {
  assert.equal(controlRoomDebugAllowed({ authenticated: false, debugParam: '1' }), false);
  assert.equal(controlRoomDebugAllowed({ authenticated: true, debugParam: '1' }), true);
  assert.equal(controlRoomDebugAllowed({ authenticated: true, debugParam: null }), false);
});

// --- 4/5/6 : ring buffer ---

test('ops : ring buffer limité à 200 entrées par défaut', () => {
  const log = createBoundedEventLog({});
  for (let i = 0; i < 250; i++) log.add(`evt ${i}`);
  const snap = log.getSnapshot();
  assert.equal(snap.count, 200);
  assert.equal(snap.maxEntries, DEFAULT_MAX_ENTRIES);
  // Newest first : la tête est le dernier ajouté.
  assert.equal(snap.entries[0], 'evt 249');
});


test('ops : totalCount continue d augmenter au-delà du cap', () => {
  const log = createBoundedEventLog({ maxEntries: 5 });
  for (let i = 0; i < 12; i++) log.add(`e${i}`);
  assert.equal(log.getTotalCount(), 12);
  assert.equal(log.getSnapshot().count, 5);
});


test('ops : clear vide uniquement les entrées (totalCount conservé)', () => {
  const log = createBoundedEventLog({ maxEntries: 10 });
  log.add('a'); log.add('b'); log.add('c');
  assert.equal(log.getTotalCount(), 3);
  log.clear();
  assert.equal(log.getEntries().length, 0);
  assert.equal(log.getSnapshot().count, 0);
  assert.equal(log.getTotalCount(), 3, 'totalCount cumulé non remis à zéro');
});


test('ops : ring buffer ignore null/undefined', () => {
  const log = createBoundedEventLog({ maxEntries: 10 });
  log.add(null); log.add(undefined);
  assert.equal(log.getTotalCount(), 0);
  assert.equal(log.getEntries().length, 0);
});

// --- 7/8/9 : bandeau santé ---

test('ops : health OPÉRATIONNEL', () => {
  const h = deriveSystemHealth({
    collabHub: 'connected',
    maxFreshness: { active: true, everSeen: true },
    liveKit: { enabled: true, state: 'playing' },
    streamStatus: { received: true, fresh: true },
  });
  assert.equal(h.collabHub, HEALTH.COLLAB_HUB.OK);
  assert.equal(h.max, HEALTH.MAX.ACTIF);
  assert.equal(h.liveKit, HEALTH.LIVEKIT.PLAYING);
  assert.equal(h.stream, HEALTH.STREAM.FRAIS);
  assert.equal(h.global, HEALTH.GLOBAL.OPERATIONNEL);
});


test('ops : health DÉGRADÉ (reconnexion Collab-Hub)', () => {
  const h = deriveSystemHealth({
    collabHub: 'reconnecting',
    maxFreshness: { active: true, everSeen: true },
    liveKit: { enabled: true, state: 'playing' },
    streamStatus: { received: true, fresh: true },
  });
  assert.equal(h.collabHub, HEALTH.COLLAB_HUB.RECONNECTING);
  assert.equal(h.global, HEALTH.GLOBAL.DEGRADE);
});


test('ops : health DÉGRADÉ (stream stale)', () => {
  const h = deriveSystemHealth({
    collabHub: 'connected',
    maxFreshness: { active: true, everSeen: true },
    liveKit: { enabled: false, state: 'idle' },
    streamStatus: { received: true, fresh: false },
  });
  assert.equal(h.stream, HEALTH.STREAM.STALE);
  assert.equal(h.global, HEALTH.GLOBAL.DEGRADE);
});


test('ops : health ERREUR (Collab-Hub erreur)', () => {
  const h = deriveSystemHealth({
    collabHub: 'error',
    maxFreshness: { active: true, everSeen: true },
    liveKit: { enabled: true, state: 'playing' },
    streamStatus: { received: true, fresh: true },
  });
  assert.equal(h.collabHub, HEALTH.COLLAB_HUB.ERREUR);
  assert.equal(h.global, HEALTH.GLOBAL.ERREUR);
});


test('ops : health ERREUR (LiveKit erreur)', () => {
  const h = deriveSystemHealth({
    collabHub: 'connected',
    maxFreshness: { active: true, everSeen: true },
    liveKit: { enabled: true, state: 'error' },
    streamStatus: { received: true, fresh: true },
  });
  assert.equal(h.liveKit, HEALTH.LIVEKIT.ERREUR);
  assert.equal(h.global, HEALTH.GLOBAL.ERREUR);
});

// --- 10/11/12 : états sous-systèmes ---

test('ops : Max jamais vu', () => {
  const h = deriveSystemHealth({
    collabHub: 'connected',
    maxFreshness: { active: false, everSeen: false },
    liveKit: { enabled: false, state: 'idle' },
    streamStatus: { received: false, fresh: false },
  });
  assert.equal(h.max, HEALTH.MAX.JAMAIS_VU);
});


test('ops : stream stale', () => {
  const h = deriveSystemHealth({
    collabHub: 'connected',
    maxFreshness: { active: true, everSeen: true },
    liveKit: { enabled: false, state: 'idle' },
    streamStatus: { received: true, fresh: false },
  });
  assert.equal(h.stream, HEALTH.STREAM.STALE);
});


test('ops : stream indisponible (jamais reçu)', () => {
  const h = deriveSystemHealth({
    collabHub: 'connected',
    maxFreshness: { active: true, everSeen: true },
    liveKit: { enabled: false, state: 'idle' },
    streamStatus: { received: false, fresh: false },
  });
  assert.equal(h.stream, HEALTH.STREAM.INDISPONIBLE);
});


test('ops : LiveKit waiting_for_track -> ATTENTE PISTE', () => {
  const h = deriveSystemHealth({
    collabHub: 'connected',
    maxFreshness: { active: true, everSeen: true },
    liveKit: { enabled: true, state: 'waiting_for_track' },
    streamStatus: { received: true, fresh: true },
  });
  assert.equal(h.liveKit, HEALTH.LIVEKIT.ATTENTE_PISTE);
});


test('ops : LiveKit waiting_for_user -> ATTENTE UTILISATEUR', () => {
  const h = deriveSystemHealth({
    collabHub: 'connected',
    maxFreshness: { active: true, everSeen: true },
    liveKit: { enabled: true, state: 'waiting_for_user' },
    streamStatus: { received: true, fresh: true },
  });
  assert.equal(h.liveKit, HEALTH.LIVEKIT.ATTENTE_UTILISATEUR);
});


test('ops : LiveKit inactif quand désactivé', () => {
  const h = deriveSystemHealth({
    collabHub: 'connected',
    maxFreshness: { active: true, everSeen: true },
    liveKit: { enabled: false, state: 'idle' },
    streamStatus: { received: true, fresh: true },
  });
  assert.equal(h.liveKit, HEALTH.LIVEKIT.INACTIF);
  assert.equal(h.global, HEALTH.GLOBAL.OPERATIONNEL, 'INACTIF nominal = pas dégradé');
});

// --- 13/14/15/16 : tableau des headers ---

test('ops : table contient tous les headers attendus (11)', () => {
  const rows = deriveHeadersTable({ stats: {}, observed: new Set(HEADERS_TABLE), now: () => 1000 });
  assert.equal(rows.length, 11);
  assert.deepEqual(rows.map((r) => r.header), HEADERS_TABLE);
  // Tous observés et jamais reçus -> JAMAIS REÇU.
  assert.ok(rows.every((r) => r.observed && r.status === HEADER_STATUS.JAMAIS_RECU));
});


test('ops : header jamais reçu détecté (observé, count 0)', () => {
  let t = 1000;
  const tracker = createHeaderTracker({ now: () => t });
  const rows = deriveHeadersTable({
    stats: tracker.getStats(), observed: new Set(['sound_title']), now: () => t,
  });
  const title = rows.find((r) => r.header === 'sound_title');
  assert.equal(title.observed, true);
  assert.equal(title.received, false);
  assert.equal(title.status, HEADER_STATUS.JAMAIS_RECU);
});


test('ops : header non observé détecté', () => {
  const tracker = createHeaderTracker({ now: () => 1000 });
  tracker.record('sound_title', 'x');
  const rows = deriveHeadersTable({
    stats: tracker.getStats(), observed: new Set(), now: () => 1000,
  });
  const title = rows.find((r) => r.header === 'sound_title');
  assert.equal(title.observed, false);
  assert.equal(title.status, HEADER_STATUS.NON_OBSERVE);
});


test('ops : header stale détecté (reçu, âge > seuil)', () => {
  let t = 1000;
  const tracker = createHeaderTracker({ now: () => t });
  tracker.record('stream_onair', '1'); // seuil stream = 3 s
  t = 1000 + 4000; // âge = 4 s > STALE_MS
  const rows = deriveHeadersTable({
    stats: tracker.getStats(), observed: new Set(['stream_onair']), now: () => t,
  });
  const onair = rows.find((r) => r.header === 'stream_onair');
  assert.equal(onair.received, true);
  assert.equal(onair.status, HEADER_STATUS.STALE);
});


test('ops : header OK (reçu, frais)', () => {
  let t = 1000;
  const tracker = createHeaderTracker({ now: () => t });
  tracker.record('stream_onair', '1');
  t = 1000 + 500; // âge = 0.5 s < STALE_MS
  const rows = deriveHeadersTable({
    stats: tracker.getStats(), observed: new Set(['stream_onair']), now: () => t,
  });
  const onair = rows.find((r) => r.header === 'stream_onair');
  assert.equal(onair.status, HEADER_STATUS.OK);
  assert.equal(onair.count, 1);
});


test('ops : valeur longue tronquée visuellement', () => {
  const long = 'x'.repeat(200);
  const preview = truncateRaw(long);
  assert.ok(preview.length <= 41, `preview length ${preview.length} <= 41`);
  assert.ok(preview.endsWith('…'));
  assert.equal(truncateRaw(null), '—');
  assert.equal(truncateRaw('court'), 'court');
});

// --- 4bis : runtime config ---

test('ops : buildRuntimeConfig non sensible + défauts —', () => {
  const cfg = buildRuntimeConfig({ env: {}, build: {} });
  assert.equal(cfg.version, '—');
  assert.equal(cfg.gitCommitSha, '—');
  assert.equal(cfg.vercelEnv, '—');
  assert.equal(cfg.livekitEnabled, false);
  assert.equal(cfg.publicDebugEnabled, false);
  assert.equal(cfg.collabHubUrl, '—');
  assert.equal(cfg.livekitUrl, '—');
  // Aucune clé secrète présente.
  assert.equal('token' in cfg, false);
  assert.equal('password' in cfg, false);
  assert.equal('apiSecret' in cfg, false);
});


test('ops : buildRuntimeConfig lit les vars publiques', () => {
  const cfg = buildRuntimeConfig({
    env: {
      VITE_LIVEKIT_ENABLED: 'true',
      VITE_PUBLIC_DEBUG_ENABLED: 'true',
      VITE_COLLAB_HUB_URL: 'https://server.collab-hub.io',
      VITE_COLLAB_HUB_NAMESPACE: 'hub',
      VITE_COLLAB_HUB_AUTH_MODE: 'anonymous',
    },
    build: { version: '1.1.2', gitCommitSha: 'abc1234', vercelEnv: 'production' },
  });
  assert.equal(cfg.livekitEnabled, true);
  assert.equal(cfg.publicDebugEnabled, true);
  assert.equal(cfg.version, '1.1.2');
  assert.equal(cfg.gitCommitSha, 'abc1234');
  assert.equal(cfg.vercelEnv, 'production');
  assert.equal(cfg.collabHubUrl, 'https://server.collab-hub.io');
  assert.equal(cfg.collabHubNamespace, 'hub');
});

// --- 20 : URL LiveKit redacted ---

test('ops : URL LiveKit redacted (host seul, sans query/token)', () => {
  assert.equal(redactLiveKitUrl('wss://proj.livekit.cloud/rtc?token=secret&x=1'), 'proj.livekit.cloud');
  assert.equal(redactLiveKitUrl('https://example.com/path#frag'), 'example.com');
  assert.equal(redactLiveKitUrl(''), '—');
  assert.equal(redactLiveKitUrl('not-a-url'), '—');
  assert.equal(redactLiveKitUrl(null), '—');
});

// --- 18/19 : sanitizer ---

test('ops : sanitizer retire token/password/secret/cookie/api_key', () => {
  const out = sanitizeDiagnostic({
    token: 'abc',
    access_token: 'abc',
    password: 'pw',
    secret: 's',
    api_key: 'k',
    apiSecret: 's',
    cookie: 'c',
    authorization: 'Bearer x',
    session_secret: 'ss',
    ok: 'keep',
  });
  assert.equal(out.token, '[REDACTED]');
  assert.equal(out.access_token, '[REDACTED]');
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.secret, '[REDACTED]');
  assert.equal(out.api_key, '[REDACTED]');
  assert.equal(out.apiSecret, '[REDACTED]');
  assert.equal(out.cookie, '[REDACTED]');
  assert.equal(out.authorization, '[REDACTED]');
  assert.equal(out.session_secret, '[REDACTED]');
  assert.equal(out.ok, 'keep');
});


test('ops : sanitizer masque identity/SID (jamais complète)', () => {
  const out = sanitizeDiagnostic({
    identity: 'listener-abc123def456',
    participantSid: 'participant-xyz',
    trackSid: 'tr-abc123',
    audioTrackSid: 'audio-1',
    performerIdentity: 'performer-1',
  });
  assert.notEqual(out.identity, 'listener-abc123def456');
  assert.ok(out.identity.includes('•••'));
  assert.notEqual(out.participantSid, 'participant-xyz');
  assert.ok(out.trackSid.includes('•••'));
});


test('ops : sanitizer récursif (objets + tableaux)', () => {
  const out = sanitizeDiagnostic({
    a: { token: 't', nested: { password: 'p', keep: 1 } },
    list: [{ token: 't2' }, { ok: 2 }],
  });
  assert.equal(out.a.token, '[REDACTED]');
  assert.equal(out.a.nested.password, '[REDACTED]');
  assert.equal(out.a.nested.keep, 1);
  assert.equal(out.list[0].token, '[REDACTED]');
  assert.equal(out.list[1].ok, 2);
});


test('ops : sanitizer masque token= dans les chaînes', () => {
  assert.equal(redactSensitiveInString('wss://h?token=secret&x=1'), 'wss://h?token=[REDACTED]&x=1');
  assert.equal(redactSensitiveInString('Bearer abcd1234'), 'Bearer [REDACTED]');
  assert.equal(redactSensitiveInString('rien a masquer'), 'rien a masquer');
});


test('ops : sanitizer gère les références circulaires', () => {
  const a = { ok: 1 }; a.self = a;
  const out = sanitizeDiagnostic(a);
  assert.equal(out.ok, 1);
  assert.equal(out.self, '[REDACTED:circular]');
});

// --- 17/19 : export ---

test('ops : export JSON valide (sérialisable, structuré)', () => {
  const payload = buildDiagnosticExport({
    health: { global: 'OPÉRATIONNEL', collabHub: 'OK', max: 'ACTIF', liveKit: 'INACTIF', stream: 'FRAIS' },
    runtimeConfig: { version: '1.1.2' },
    freshness: { maxActive: true },
    headers: [{ header: 'sound_title', status: 'OK' }],
    listenerSnapshot: { state: 'idle' },
    collabHubStats: { connected: true, socketId: 'sock-1' },
    listenerCount: { count: 2 },
    logs: { entries: ['e1'], count: 1, totalCount: 1 },
    networkStats: getListenerNetworkStats(),
    at: 1700000000000,
  });
  const json = JSON.stringify(payload);
  const parsed = JSON.parse(json);
  assert.equal(parsed.health.global, 'OPÉRATIONNEL');
  assert.equal(parsed.runtime.version, '1.1.2');
  assert.equal(parsed.liveKit.network.status, 'unsupported');
  assert.equal(parsed.logs.count, 1);
});


test('ops : export (copie diagnostic) sans secret', () => {
  const payload = buildDiagnosticExport({
    runtimeConfig: { version: '1.1.2', token: 'SECRET-TOKEN', password: 'SECRET-PW', apiSecret: 'SECRET-AS' },
    listenerSnapshot: { identity: 'listener-abc123def', token: 'SECRET-LK-TOKEN', state: 'idle' },
    collabHubStats: { connected: true, auth: { token: 'SECRET-CH-TOKEN' }, cookie: 'SECRET-CK' },
    at: 1700000000000,
  });
  const json = JSON.stringify(payload);
  // Aucune valeur secrète n'apparaît dans l'export.
  assert.ok(!json.includes('SECRET-TOKEN'));
  assert.ok(!json.includes('SECRET-PW'));
  assert.ok(!json.includes('SECRET-AS'));
  assert.ok(!json.includes('SECRET-LK-TOKEN'));
  assert.ok(!json.includes('SECRET-CH-TOKEN'));
  assert.ok(!json.includes('SECRET-CK'));
  // Les clés sensibles sont marquées REDACTED.
  assert.ok(json.includes('[REDACTED]'));
  // Identity complète jamais exposée (masquée).
  assert.ok(!json.includes('listener-abc123def'));
  assert.ok(json.includes('•••'));
});

// --- 8bis : WebRTC stats préparatoires ---

test('ops : getListenerNetworkStats -> unsupported (pas de fausse métrique)', () => {
  const s = getListenerNetworkStats();
  assert.equal(s.status, 'unsupported');
  assert.ok(!('bitrate' in s) && !('rtt' in s) && !('packetsLost' in s));
});

// --- 21 : aucun innerHTML (piège qui lève si tenté) ---

test('ops : initDiagnostic n utilise jamais innerHTML (piège)', () => {
  // Pose un piège innerHTML sur un élément : toute écriture lève. Appliqué à
  // CHAQUE élément sorti par createElement et querySelector -> si le panneau
  // tente un innerHTML, le test échoue immédiatement.
  const trap = (node) => {
    if (!node || typeof node !== 'object') return node;
    let _html = '';
    try {
      Object.defineProperty(node, 'innerHTML', {
        get() { return _html; },
        set() { throw new Error('innerHTML interdit'); },
        configurable: true,
      });
    } catch { /* déjà piégé */ }
    return node;
  };
  const trapped = fakeDocument();
  const origCreate = trapped.createElement.bind(trapped);
  const origQuery = trapped.querySelector.bind(trapped);
  trapped.createElement = (tag) => trap(origCreate(tag));
  trapped.querySelector = (sel) => trap(origQuery(sel));
  const origDoc2 = globalThis.document;
  globalThis.document = trapped;
  try {
    const fakeSocket = {
      id: 'sock-1',
      on() {}, onAny() {}, offAny() {}, emit() {},
      io: { engine: { transport: { name: 'websocket' } } },
      connected: true,
    };
    const api = {
      socket: fakeSocket,
      observeHeaderOnce() {}, observeKnownHeadersOnce() {}, isObserved: () => true, forget() {},
    };
    const diag = initDiagnostic(api, trapped, {
      livekitDiag: () => ({ enabled: true, snapshot: { state: 'playing', identity: 'listener-1', audioTrackSid: 'tr-9', performerIdentity: 'performer-1' } }),
      streamDiag: () => ({ onAir: 1, fresh: true, computedStatus: 'live' }),
      runtimeConfig: { version: '1.1.2', publicDebugEnabled: true },
    });
    // Toutes les sections de rendu ne doivent pas lever (aucun innerHTML).
    diag.setStatus('connected');
    diag.logControl({ header: 'sound_title', values: ['x'] });
    diag.refreshLivekit();
    diag.refreshStream();
    diag.refreshFreshness({ getMaxLastSeenAt: () => 1, maxAgeMs: () => 5, getContentLastUpdatedAt: () => 1, contentAgeMs: () => 5, isMaxActive: () => true, isContentFresh: () => true });
    if (diag.refreshHealth) diag.refreshHealth();
    if (diag.refreshHeadersTable) diag.refreshHeadersTable();
    if (diag.refreshRuntimeConfig) diag.refreshRuntimeConfig();
    if (diag.refreshCollabHubStats) diag.refreshCollabHubStats();
    if (diag.refreshLogs) diag.refreshLogs();
    // Vérifie que le piège est bien actif (un innerHTML doit lever) -> prouve que
    // l'absence d'erreur ci-dessus vient du panneau, pas d'un piège inerte.
    let trapFired = false;
    try { trapped.querySelector('diag-version').innerHTML = '<x>'; } catch { trapFired = true; }
    assert.ok(trapFired, 'le piège innerHTML est actif');
    assert.ok(true, 'aucun innerHTML déclenché par le panneau');
  } finally {
    globalThis.document = origDoc2;
  }
});

// --- 24 : listener audio non régressé ---
