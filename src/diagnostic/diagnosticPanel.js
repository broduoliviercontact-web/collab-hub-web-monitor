// Panneau d'exploitation (Lot Ops Debug) — activé via ?debug=1 sur la page
// publique, et uniquement si la variable build publique
// VITE_PUBLIC_DEBUG_ENABLED vaut exactement 'true' (gate côté publicPage via
// debugGate.js). La Control Room a son propre debug, session-gated (gate).
//
// conservent les capacités du spike : événements reçus, observation des headers,
// diagnostic de connexion LiveKit/flux. Ajoute (Lot Ops Debug) : bandeau santé,
// version & configuration runtime non sensible, tableau des headers attendus,
// stats Collab-Hub, export diagnostic sécurisé (copie/téléchargement), logs
// bornés (ring buffer) avec compteurs + bouton d'effacement.
//
// Sécurité : JAMAIS d'innerHTML (rendu via textContent/setAttribute/createElement
// + appendChild/replaceChildren uniquement). Aucun token/cookie/password/secret
// affiché. Les identity/SID d'auditeur sont masquées (redactIdentity) dans le
// DOM ; l'export passe par le sanitizer récursif (diagnosticSanitizer.js).
//
// Lot 1.1 : n'attache PAS de listeners connect/disconnect/control en doublon vs
// socketClient — reçoit statut + contrôles via setStatus()/logControl() appelés
// par publicPage. Attache uniquement onAny + les événements Collab-Hub connus +
// les événements socket riches (connect/disconnect/connect_error/reconnect) pour
// les stats d'exploitation (listeners uniques).
import { IMAGE_HEADERS, KNOWN_HEADERS, STREAM_HEADERS, TEXT_VISIBILITY_HEADERS } from '../collabHub/messageRouter.js';
import { HEARTBEAT_HEADER } from '../state/freshness.js';
import { createBoundedEventLog } from './boundedEventLog.js';
import { deriveSystemHealth, HEALTH } from './systemHealth.js';
import {
  createHeaderTracker, deriveHeadersTable, HEADERS_TABLE, HEADER_STATUS,
} from './headerTracker.js';
import { redactIdentity } from './diagnosticSanitizer.js';
import { buildDiagnosticExport } from './diagnosticExport.js';
import { getListenerNetworkStats } from './networkStats.js';

const el = (root, id) => root.querySelector(`#${id}`);
const ALL_TABLE_HEADERS = [...KNOWN_HEADERS, ...IMAGE_HEADERS, ...TEXT_VISIBILITY_HEADERS, HEARTBEAT_HEADER, ...STREAM_HEADERS];

export function initDiagnostic(api, root, opts = {}) {
  if (!api || !api.socket || !root) return null;
  const { socket, observeHeaderOnce, observeKnownHeadersOnce, isObserved, forget } = api;
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  const now = opts.now || Date.now;
  root.hidden = false;

  const eventLog = el(root, 'event-log');
  const errorsEl = el(root, 'diag-errors');
  const connState = el(root, 'diag-conn-state');
  const socketIdEl = el(root, 'diag-socket-id');
  const ctrlCount = el(root, 'diag-ctrl-count');
  const onanyToggle = el(root, 'diag-onany-toggle');
  const headerInput = el(root, 'diag-header-input');
  const headerList = el(root, 'diag-header-list');
  const observeAllBtn = el(root, 'diag-observe-all-headers');
  const localRestoreEl = el(root, 'diag-local-restore');
  const localSavedEl = el(root, 'diag-local-saved');
  const clearLocalBtn = el(root, 'diag-clear-local');
  const clearStatusEl = el(root, 'diag-clear-status');

  // --- Logs bornés (ring buffer) + suivi par header ---
  const log = createBoundedEventLog({ maxEntries: 200 });
  const headerTracker = createHeaderTracker({ now });
  const logTotalEl = el(root, 'diag-log-total');
  const logKeptEl = el(root, 'diag-log-kept');
  const clearLogsBtn = el(root, 'diag-clear-logs');

  // --- Bandeau santé ---
  const healthSection = el(root, 'diag-health');
  const hCollab = el(root, 'diag-health-collab');
  const hMax = el(root, 'diag-health-max');
  const hLiveKit = el(root, 'diag-health-livekit');
  const hStream = el(root, 'diag-health-stream');
  const hGlobal = el(root, 'diag-health-global');

  // --- Version & configuration runtime ---
  const rcVersion = el(root, 'diag-version');
  const rcGitSha = el(root, 'diag-git-sha');
  const rcBuildTs = el(root, 'diag-build-ts');
  const rcVercelEnv = el(root, 'diag-vercel-env');
  const rcLkEnabled = el(root, 'diag-livekit-enabled');
  const rcPubDebug = el(root, 'diag-public-debug-enabled');
  const rcChUrl = el(root, 'diag-collab-url');
  const rcChNs = el(root, 'diag-collab-ns');
  const rcAuthMode = el(root, 'diag-auth-mode');
  const rcLkUrl = el(root, 'diag-livekit-url');

  // --- Tableau des headers attendus ---
  const headersTbody = el(root, 'diag-headers-tbody');

  // --- Stats Collab-Hub ---
  const chTransport = el(root, 'diag-ch-transport');
  const chConnected = el(root, 'diag-ch-connected');
  const chSocketId = el(root, 'diag-ch-socket-id');
  const chReconnects = el(root, 'diag-ch-reconnects');
  const chDiscReason = el(root, 'diag-ch-disc-reason');
  const chConnError = el(root, 'diag-ch-conn-error');
  const chLastConnected = el(root, 'diag-ch-last-connected');
  const chLastDisc = el(root, 'diag-ch-last-disc');

  // --- Export diagnostic ---
  const copyBtn = el(root, 'diag-copy');
  const downloadBtn = el(root, 'diag-download');

  // --- LiveKit listener (Lot 4D) : spans optionnels (présents si ?debug=1) ---
  const lkEnabled = el(root, 'diag-lk-enabled');
  const lkState = el(root, 'diag-lk-state');
  const lkRoom = el(root, 'diag-lk-room');
  const lkIdentity = el(root, 'diag-lk-identity');
  const lkParticipants = el(root, 'diag-lk-participants');
  const lkTrack = el(root, 'diag-lk-track');
  const lkPerformer = el(root, 'diag-lk-performer');
  const lkVolume = el(root, 'diag-lk-volume');
  const lkMuted = el(root, 'diag-lk-muted');
  const lkAutoplay = el(root, 'diag-lk-autoplay');
  const lkAudioUnlocked = el(root, 'diag-lk-audio-unlocked');
  const lkRoomCanPlay = el(root, 'diag-lk-room-can-play');
  const lkExistingParticipants = el(root, 'diag-lk-existing-participants');
  const lkExistingPubs = el(root, 'diag-lk-existing-pubs');
  const lkSubscribedPubs = el(root, 'diag-lk-subscribed-pubs');
  const lkReconciliations = el(root, 'diag-lk-reconciliations');
  const lkLastTrackEvent = el(root, 'diag-lk-last-track-event');
  const lkTrackPublishedAt = el(root, 'diag-lk-track-published-at');
  const lkTrackSubscribedAt = el(root, 'diag-lk-track-subscribed-at');
  const lkReconnects = el(root, 'diag-lk-reconnects');
  const lkError = el(root, 'diag-lk-error');
  const livekitDiag = typeof opts.livekitDiag === 'function' ? opts.livekitDiag : null;
  // Flux direct public (Lot 4G) + compteur auditeurs (Lot 5).
  const stOnAir = el(root, 'diag-stream-onair');
  const stLevel = el(root, 'diag-stream-level');
  const stPeak = el(root, 'diag-stream-peak');
  const stUpdatedAt = el(root, 'diag-stream-updated-at');
  const stAge = el(root, 'diag-stream-age');
  const stFresh = el(root, 'diag-stream-fresh');
  const stSignal = el(root, 'diag-stream-signal');
  const stStatus = el(root, 'diag-stream-status');
  const stObserved = el(root, 'diag-stream-observed');
  const stLastHeader = el(root, 'diag-stream-last-header');
  const stCounts = el(root, 'diag-stream-counts');
  const stLastReceivedAt = el(root, 'diag-stream-last-received-at');
  const stRaw = el(root, 'diag-stream-raw');
  const stListenerRaw = el(root, 'diag-stream-listener-raw');
  const stListenerCount = el(root, 'diag-stream-listener-count');
  const stListenerKnown = el(root, 'diag-stream-listener-known');
  const stListenerLabel = el(root, 'diag-stream-listener-label');
  const stListenerReceivedAt = el(root, 'diag-stream-listener-received-at');
  const streamDiag = typeof opts.streamDiag === 'function' ? opts.streamDiag : null;

  let onAnyEnabled = onanyToggle.checked;
  let controlCount = 0;
  let connStatus = null;        // 'connected' | 'reconnecting' | 'disconnected' | 'error' | null
  let lastFreshness = null;     // objet freshness (refreshFreshness)

  // Stats Collab-Hub riches (collectées via listeners socket dédiés).
  const chStats = {
    transport: '—',
    connected: false,
    socketId: null,
    reconnectCount: 0,
    lastDisconnectReason: null,
    lastConnectErrorMsg: null,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
  };

  const fmtAge = (ms) => {
    if (ms === null || !Number.isFinite(ms)) return '—';
    if (ms < 1000) return '< 1 s';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    return `${m} min ${s % 60} s`;
  };
  const fmtTs = (ms) => {
    if (ms === null || !Number.isFinite(ms)) return 'jamais';
    try { return new Date(ms).toISOString(); } catch { return '—'; }
  };

  const logEvent = (name, payload) => {
    const ts = new Date().toISOString().slice(11, 23);
    log.add(`[${ts}] ${name} ${JSON.stringify(payload)}`);
    refreshLogs();
  };
  const logError = (msg) => { errorsEl.textContent += `${new Date().toISOString()} ${msg}\n`; };

  function refreshLogs() {
    if (eventLog) eventLog.textContent = log.getEntries().join('\n');
    if (logTotalEl) logTotalEl.textContent = String(log.getTotalCount());
    if (logKeptEl) logKeptEl.textContent = String(log.getSnapshot().count);
  }

  // --- Statut + contrôle reçus de public.js (pas de listener socket dédié) ---
  function recomputeObserveAll() {
    const all = KNOWN_HEADERS.every(isObserved);
    observeAllBtn.disabled = all;
    observeAllBtn.textContent = all
      ? `${KNOWN_HEADERS.length} champs observés`
      : `Observer les ${KNOWN_HEADERS.length} champs`;
  }
  function setStatus(status) {
    connStatus = status;
    if (status === 'connected') { connState.textContent = 'connecté'; socketIdEl.textContent = socket.id || '—'; chStats.connected = true; chStats.socketId = socket.id || null; recomputeObserveAll(); }
    else if (status === 'disconnected') { connState.textContent = 'déconnecté'; socketIdEl.textContent = '—'; chStats.connected = false; recomputeObserveAll(); }
    else if (status === 'reconnecting') { connState.textContent = 'Reconnexion…'; }
    else if (status === 'error') { connState.textContent = 'erreur de connexion'; logError('connect_error signalé par socketClient'); }
    refreshHealth();
  }
  function logControl(incoming) {
    controlCount++;
    ctrlCount.textContent = `Contrôles reçus : ${controlCount}`;
    if (incoming && typeof incoming.header === 'string') {
      // Valeur brute résumée pour le tableau (valeurs multiples -> join).
      const raw = Array.isArray(incoming.values) ? incoming.values.join(' ') : incoming.values;
      headerTracker.record(incoming.header, raw);
    }
    logEvent('control', incoming);
    refreshHeadersTable();
  }

  // --- Persistance locale (Lot 3A) ---
  function setLocalSaved(at) { if (localSavedEl) localSavedEl.textContent = at || '—'; }
  function setLocalRestore(at) { if (localRestoreEl) localRestoreEl.textContent = at || '—'; }
  if (opts.initialRestore) setLocalRestore(opts.initialRestore);
  if (opts.initialSaved) setLocalSaved(opts.initialSaved);
  if (clearLocalBtn) {
    clearLocalBtn.addEventListener('click', () => {
      let ok = true;
      if (opts.clear) ok = opts.clear();
      setLocalSaved(null);
      setLocalRestore(null);
      if (clearStatusEl) clearStatusEl.textContent = ok ? 'État local effacé.' : 'Effacement impossible (storage indisponible).';
    });
  }

  // --- Fraîcheur (Lot 3B) : rafraîchi par le timer central (publicPage, 1 s) ---
  const maxSeenEl = el(root, 'diag-max-seen');
  const maxAgeEl = el(root, 'diag-max-age');
  const contentUpdatedEl = el(root, 'diag-content-updated');
  const contentAgeEl = el(root, 'diag-content-age');
  const maxStateEl = el(root, 'diag-max-state');
  const contentStateEl = el(root, 'diag-content-state');
  function refreshFreshness(freshness) {
    lastFreshness = freshness || null;
    if (!freshness) return;
    const seen = freshness.getMaxLastSeenAt();
    const upd = freshness.getContentLastUpdatedAt();
    if (maxSeenEl) maxSeenEl.textContent = fmtTs(seen);
    if (maxAgeEl) maxAgeEl.textContent = fmtAge(freshness.maxAgeMs());
    if (contentUpdatedEl) contentUpdatedEl.textContent = fmtTs(upd);
    if (contentAgeEl) contentAgeEl.textContent = fmtAge(freshness.contentAgeMs());
    if (maxStateEl) maxStateEl.textContent = freshness.isMaxActive() ? 'actif' : 'silencieux';
    if (contentStateEl) contentStateEl.textContent = freshness.isContentFresh() ? 'récent' : 'ancien';
    refreshHealth();
  }

  // --- LiveKit listener (Lot 4D) ---
  // N'affiche JAMAIS de token/secret. Identity & SID d'auditeur MASQUÉS
  // (redactIdentity) : on garde un indice utile sans exposer l'identifiant complet.
  function refreshLivekit() {
    if (!livekitDiag) return;
    let info = { enabled: false, snapshot: null };
    try { info = livekitDiag() || info; } catch {}
    const s = info.snapshot || {};
    if (lkEnabled) lkEnabled.textContent = info.enabled ? 'oui' : 'non';
    if (lkState) lkState.textContent = s.state || '—';
    if (lkRoom) lkRoom.textContent = s.roomName || '—';
    if (lkIdentity) lkIdentity.textContent = s.identity ? redactIdentity(s.identity) : '—';
    if (lkParticipants) lkParticipants.textContent = s.participantCount != null ? String(s.participantCount) : '—';
    if (lkTrack) lkTrack.textContent = s.audioTrackSid ? redactIdentity(s.audioTrackSid) : '—';
    if (lkPerformer) lkPerformer.textContent = s.performerIdentity || '—';
    if (lkVolume) lkVolume.textContent = typeof s.volume === 'number' ? `${Math.round(s.volume * 100)}%` : '—';
    if (lkMuted) lkMuted.textContent = s.muted ? 'oui' : 'non';
    if (lkAutoplay) lkAutoplay.textContent = s.autoplayBlocked ? 'oui' : 'non';
    if (lkAudioUnlocked) lkAudioUnlocked.textContent = s.audioUnlocked ? 'oui' : 'non';
    if (lkRoomCanPlay) lkRoomCanPlay.textContent = s.roomCanPlaybackAudio ? 'oui' : 'non';
    if (lkExistingParticipants) lkExistingParticipants.textContent = s.existingParticipants != null ? String(s.existingParticipants) : '—';
    if (lkExistingPubs) lkExistingPubs.textContent = s.existingAudioPublications != null ? String(s.existingAudioPublications) : '—';
    if (lkSubscribedPubs) lkSubscribedPubs.textContent = s.subscribedAudioPublications != null ? String(s.subscribedAudioPublications) : '—';
    if (lkReconciliations) lkReconciliations.textContent = s.reconciliationCount != null ? String(s.reconciliationCount) : '—';
    if (lkLastTrackEvent) lkLastTrackEvent.textContent = s.lastTrackEvent || '—';
    if (lkTrackPublishedAt) lkTrackPublishedAt.textContent = fmtTs(s.lastTrackPublishedAt);
    if (lkTrackSubscribedAt) lkTrackSubscribedAt.textContent = fmtTs(s.lastTrackSubscribedAt);
    if (lkReconnects) lkReconnects.textContent = s.reconnectCount != null ? String(s.reconnectCount) : '—';
    if (lkError) lkError.textContent = (s.lastError && s.lastError.code) || '—';
    refreshHealth();
  }

  // --- Flux direct public (Lot 4G) + compteur auditeurs (Lot 5) ---
  function refreshStream() {
    if (!streamDiag) return;
    let s = null;
    try { s = streamDiag(); } catch {}
    s = s || {};
    if (stOnAir) stOnAir.textContent = s.onAir === 1 ? '1' : s.onAir === 0 ? '0' : '—';
    if (stLevel) stLevel.textContent = typeof s.level === 'number' ? s.level.toFixed(3) : '—';
    if (stPeak) stPeak.textContent = typeof s.peak === 'number' ? s.peak.toFixed(3) : '—';
    if (stUpdatedAt) stUpdatedAt.textContent = fmtTs(s.updatedAt);
    if (stAge) stAge.textContent = Number.isFinite(s.ageMs) ? `${Math.round(s.ageMs)} ms` : '—';
    if (stFresh) stFresh.textContent = s.fresh ? 'oui' : 'non';
    if (stSignal) stSignal.textContent = s.signalPresent ? 'oui' : 'non';
    if (stStatus) stStatus.textContent = s.computedStatus || '—';
    if (stObserved) stObserved.textContent = Array.isArray(s.observedStreamHeaders) && s.observedStreamHeaders.length
      ? s.observedStreamHeaders.join(', ') : '—';
    if (stLastHeader) stLastHeader.textContent = s.lastStreamHeader || '—';
    if (stCounts) {
      const c = s.receivedCount || {};
      const parts = STREAM_HEADERS
        .map((h) => `${h.replace('stream_', '')}:${c[h] != null ? c[h] : 0}`);
      stCounts.textContent = parts.join('  ');
    }
    if (stLastReceivedAt) stLastReceivedAt.textContent = fmtTs(s.lastReceivedAt);
    if (stRaw) {
      const r = s.rawLastValues || {};
      const entries = Object.keys(r).map((h) => `${h.replace('stream_', '')}=${JSON.stringify(r[h])}`);
      stRaw.textContent = entries.length ? entries.join('  ') : '—';
    }
    if (stListenerRaw) stListenerRaw.textContent = s.rawListenerCount != null ? JSON.stringify(s.rawListenerCount) : '—';
    if (stListenerCount) stListenerCount.textContent = s.listenerCount != null ? String(s.listenerCount) : '—';
    if (stListenerKnown) stListenerKnown.textContent = s.listenerCountKnown ? 'oui' : 'non';
    if (stListenerLabel) stListenerLabel.textContent = s.listenerCountLabel || '—';
    if (stListenerReceivedAt) stListenerReceivedAt.textContent = fmtTs(s.listenerCountReceivedAt);
    refreshHealth();
  }

  // --- Bandeau santé (Lot Ops Debug §3) ---
  function refreshHealth() {
    let liveKitInfo = { enabled: false, state: 'idle' };
    try { if (livekitDiag) liveKitInfo = livekitDiag() || liveKitInfo; } catch {}
    let streamSnap = null;
    try { if (streamDiag) streamSnap = streamDiag(); } catch {}
    const maxFreshness = lastFreshness
      ? { active: !!lastFreshness.isMaxActive(), everSeen: lastFreshness.getMaxLastSeenAt() != null }
      : { active: false, everSeen: false };
    const h = deriveSystemHealth({
      collabHub: connStatus,
      maxFreshness,
      liveKit: { enabled: !!liveKitInfo.enabled, state: (liveKitInfo.snapshot && liveKitInfo.snapshot.state) || 'idle' },
      streamStatus: { received: !!(streamSnap && streamSnap.ageMs != null), fresh: !!(streamSnap && streamSnap.fresh) },
    });
    if (hCollab) hCollab.textContent = h.collabHub;
    if (hMax) hMax.textContent = h.max;
    if (hLiveKit) hLiveKit.textContent = h.liveKit;
    if (hStream) hStream.textContent = h.stream;
    if (hGlobal) hGlobal.textContent = h.global;
    if (healthSection) healthSection.setAttribute('data-health', h.global);
  }

  // --- Version & configuration runtime (Lot Ops Debug §4) ---
  function refreshRuntimeConfig() {
    const rc = opts.runtimeConfig || {};
    const dash = (v) => (v === null || v === undefined || v === '') ? '—' : String(v);
    if (rcVersion) rcVersion.textContent = dash(rc.version);
    if (rcGitSha) rcGitSha.textContent = dash(rc.gitCommitSha);
    if (rcBuildTs) rcBuildTs.textContent = dash(rc.buildTimestamp);
    if (rcVercelEnv) rcVercelEnv.textContent = dash(rc.vercelEnv);
    if (rcLkEnabled) rcLkEnabled.textContent = rc.livekitEnabled ? 'oui' : 'non';
    if (rcPubDebug) rcPubDebug.textContent = rc.publicDebugEnabled ? 'oui' : 'non';
    if (rcChUrl) rcChUrl.textContent = dash(rc.collabHubUrl);
    if (rcChNs) rcChNs.textContent = dash(rc.collabHubNamespace);
    if (rcAuthMode) rcAuthMode.textContent = dash(rc.authMode);
    if (rcLkUrl) rcLkUrl.textContent = dash(rc.livekitUrl);
  }

  // --- Tableau des headers attendus (Lot Ops Debug §5) ---
  // Construit les lignes une fois (DOM via createElement, jamais innerHTML).
  const headerRows = {}; // header -> { statusCell, cells... }
  function buildHeadersTable() {
    if (!headersTbody || !doc || typeof doc.createElement !== 'function') return;
    headersTbody.replaceChildren();
    for (const header of ALL_TABLE_HEADERS) {
      const tr = doc.createElement('tr');
      tr.setAttribute('data-header', header);
      const th = doc.createElement('th'); th.textContent = header; th.setAttribute('scope', 'row');
      const cells = [th];
      const make = () => { const td = doc.createElement('td'); cells.push(td); return td; };
      const observedCell = make();
      const receivedCell = make();
      const countCell = make();
      const lastCell = make();
      const ageCell = make();
      const rawCell = make();
      const statusCell = make();
      tr.append(...cells);
      headersTbody.appendChild(tr);
      headerRows[header] = { observedCell, receivedCell, countCell, lastCell, ageCell, rawCell, statusCell, tr };
    }
  }
  function refreshHeadersTable() {
    const observed = new Set(ALL_TABLE_HEADERS.filter((h) => { try { return isObserved(h); } catch { return false; } }));
    let streamStats = null;
    try { if (streamDiag) streamStats = streamDiag(); } catch {}
    const rows = deriveHeadersTable({
      headers: ALL_TABLE_HEADERS,
      stats: headerTracker.getStats(),
      observed,
      now,
      streamStats,
    });
    for (const r of rows) {
      const ref = headerRows[r.header];
      if (!ref) continue;
      ref.observedCell.textContent = r.observed ? 'oui' : 'non';
      ref.receivedCell.textContent = r.received ? 'oui' : 'non';
      ref.countCell.textContent = String(r.count);
      ref.lastCell.textContent = fmtTs(r.lastReceivedAt);
      ref.ageCell.textContent = fmtAge(r.ageMs);
      ref.rawCell.textContent = r.rawPreview;
      ref.rawCell.setAttribute('title', r.rawPreview); // aperçu ; valeur complète uniquement dans l'export
      ref.statusCell.textContent = r.status;
      ref.tr.setAttribute('data-status', r.status);
    }
  }

  // --- Stats Collab-Hub (Lot Ops Debug §6) ---
  function refreshCollabHubStats() {
    // Transport : lu depuis l'engine socket.io si disponible.
    try {
      const t = socket && socket.io && socket.io.engine && socket.io.engine.transport && socket.io.engine.transport.name;
      if (t) chStats.transport = t;
    } catch {}
    if (chTransport) chTransport.textContent = chStats.transport;
    if (chConnected) chConnected.textContent = chStats.connected ? 'oui' : 'non';
    if (chSocketId) chSocketId.textContent = chStats.socketId || '—';
    if (chReconnects) chReconnects.textContent = String(chStats.reconnectCount);
    if (chDiscReason) chDiscReason.textContent = chStats.lastDisconnectReason || '—';
    if (chConnError) chConnError.textContent = chStats.lastConnectErrorMsg || '—';
    if (chLastConnected) chLastConnected.textContent = fmtTs(chStats.lastConnectedAt);
    if (chLastDisc) chLastDisc.textContent = fmtTs(chStats.lastDisconnectedAt);
  }

  // --- Export diagnostic (Lot Ops Debug §7) ---
  function getExportPayload() {
    let liveKitInfo = { enabled: false, snapshot: null };
    try { if (livekitDiag) liveKitInfo = livekitDiag() || liveKitInfo; } catch {}
    let streamSnap = null;
    try { if (streamDiag) streamSnap = streamDiag(); } catch {}
    const maxFreshness = lastFreshness
      ? { active: !!lastFreshness.isMaxActive(), everSeen: lastFreshness.getMaxLastSeenAt() != null }
      : null;
    const h = deriveSystemHealth({
      collabHub: connStatus,
      maxFreshness: maxFreshness || { active: false, everSeen: false },
      liveKit: { enabled: !!liveKitInfo.enabled, state: (liveKitInfo.snapshot && liveKitInfo.snapshot.state) || 'idle' },
      streamStatus: { received: !!(streamSnap && streamSnap.ageMs != null), fresh: !!(streamSnap && streamSnap.fresh) },
    });
    const freshnessSnap = lastFreshness ? {
      maxActive: lastFreshness.isMaxActive(),
      maxLastSeenAt: lastFreshness.getMaxLastSeenAt(),
      contentLastUpdatedAt: lastFreshness.getContentLastUpdatedAt(),
      contentFresh: lastFreshness.isContentFresh(),
    } : null;
    const observed = new Set(ALL_TABLE_HEADERS.filter((h2) => { try { return isObserved(h2); } catch { return false; } }));
    const headersRows = deriveHeadersTable({
      headers: ALL_TABLE_HEADERS,
      stats: headerTracker.getStats(),
      observed,
      now,
      streamStats: streamSnap,
    });
    return buildDiagnosticExport({
      health: h,
      runtimeConfig: opts.runtimeConfig || null,
      freshness: freshnessSnap,
      headers: headersRows,
      listenerSnapshot: liveKitInfo.snapshot || null,
      collabHubStats: { ...chStats },
      listenerCount: streamSnap ? {
        count: streamSnap.listenerCount,
        known: streamSnap.listenerCountKnown,
        label: streamSnap.listenerCountLabel,
      } : null,
      logs: log.getSnapshot(),
      networkStats: getListenerNetworkStats(),
      at: now(),
    });
  }

  function exportJson() {
    const payload = getExportPayload();
    return JSON.stringify(payload, null, 2);
  }
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const json = exportJson();
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(json);
        }
      } catch { /* clipboard indisponible : rien (aucune donnée sensible perdue) */ }
    });
  }
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      if (!doc || typeof doc.createElement !== 'function') return;
      try {
        const json = exportJson();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', `collab-hub-diagnostic-${Date.now()}.json`);
        if (typeof a.click === 'function') a.click();
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1000);
      } catch { /* téléchargement indisponible */ }
    });
  }
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      log.clear();
      refreshLogs();
    });
  }

  // --- Événements Collab-Hub connus (listeners uniques) ---
  ['serverMessage', 'myUsername', 'allUsers', 'otherUsers', 'availableControls',
   'observedControls', 'myControls', 'availableEvents', 'observedEvents', 'myEvents',
   'availableRooms', 'myRooms', 'event', 'chat'].forEach((n) => socket.on(n, (p) => logEvent(n, p)));

  // Stats d'exploitation Collab-Hub (Lot Ops Debug §6) — listeners dédiés,
  // distincts du setStatus() piloté par publicPage (pas de doublon fonctionnel :
  // ces listeners collectent raison/erreur/compteurs riches).
  socket.on('connect', () => {
    chStats.connected = true;
    chStats.socketId = socket.id || null;
    chStats.lastConnectedAt = now();
    try {
      const t = socket.io && socket.io.engine && socket.io.engine.transport && socket.io.engine.transport.name;
      if (t) chStats.transport = t;
    } catch {}
    refreshCollabHubStats();
  });
  socket.on('disconnect', (reason) => {
    chStats.connected = false;
    chStats.lastDisconnectReason = typeof reason === 'string' ? reason : (reason && reason.type) || '—';
    chStats.lastDisconnectedAt = now();
    refreshCollabHubStats();
  });
  socket.on('connect_error', (err) => {
    chStats.lastConnectErrorMsg = (err && (err.message || err.description)) || String(err);
    refreshCollabHubStats();
  });
  socket.on('reconnect', () => {
    chStats.reconnectCount++;
    refreshCollabHubStats();
  });

  if (onAnyEnabled) socket.onAny((name, ...args) => logEvent(`onAny:${name}`, args));
  onanyToggle.addEventListener('change', (e) => {
    onAnyEnabled = e.target.checked;
    if (onAnyEnabled) socket.onAny((name, ...args) => logEvent(`onAny:${name}`, args));
    else socket.offAny();
  });

  // --- Observation idempotente (réutilise le guard de socketClient) ---
  observeAllBtn.addEventListener('click', () => { observeKnownHeadersOnce(); recomputeObserveAll(); refreshHeadersTable(); });
  el(root, 'diag-observe-btn').addEventListener('click', () => {
    const h = headerInput.value.trim(); if (h) { observeHeaderOnce(h); refreshHeadersTable(); }
  });
  el(root, 'diag-unobserve-btn').addEventListener('click', () => {
    const h = headerInput.value.trim(); if (h) { socket.emit('unobserveControl', { header: h }); forget(h); refreshHeadersTable(); }
  });

  // Liste des champs éditoriaux + bouton d'observation individuel (idempotent).
  KNOWN_HEADERS.forEach((header) => {
    if (!doc || typeof doc.createElement !== 'function') return;
    const wrap = doc.createElement('div');
    const code = doc.createElement('code'); code.textContent = header;
    const btn = doc.createElement('button'); btn.textContent = 'observer';
    btn.addEventListener('click', () => { observeHeaderOnce(header); refreshHeadersTable(); });
    wrap.append(code, btn); headerList.appendChild(wrap);
  });

  recomputeObserveAll();
  buildHeadersTable();
  refreshRuntimeConfig();
  refreshCollabHubStats();
  refreshLogs();
  refreshLivekit();
  refreshStream();
  refreshHealth();
  refreshHeadersTable();
  return {
    setStatus, logControl, setLocalSaved, setLocalRestore,
    refreshFreshness, refreshLivekit, refreshStream,
    refreshHealth, refreshHeadersTable, refreshRuntimeConfig, refreshCollabHubStats, refreshLogs,
    getExportPayload,
  };
}
