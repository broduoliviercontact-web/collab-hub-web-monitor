// Panneau de diagnostic activé via ?debug=1. conserve les capacités du spike :
// événements reçus, JSON brut, observation des 5 headers, diagnostic de connexion.
//
// Lot 1.1 : n'attache PAS de listeners connect/disconnect/control (doublons vs
// socketClient) — reçoit statut + contrôles via setStatus()/logControl() appelés
// par main.js. Attache uniquement onAny + les événements Collab-Hub connus
// (listeners uniques). L'observation réutilise le guard idempotent de socketClient.
import { KNOWN_HEADERS } from '../collabHub/messageRouter.js';

const el = (root, id) => root.querySelector(`#${id}`);

export function initDiagnostic(api, root, persistence = {}) {
  if (!api || !api.socket || !root) return null;
  const { socket, observeHeaderOnce, observeKnownHeadersOnce, isObserved, forget } = api;
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

  let onAnyEnabled = onanyToggle.checked;
  let controlCount = 0;

  const logEvent = (name, payload) => {
    const ts = new Date().toISOString().slice(11, 23);
    eventLog.textContent = `[${ts}] ${name} ${JSON.stringify(payload)}\n` + eventLog.textContent;
  };
  const logError = (msg) => { errorsEl.textContent += `${new Date().toISOString()} ${msg}\n`; };

  // --- Statut + contrôle reçus de main.js (pas de listener socket dédié) ---
  function recomputeObserveAll() {
    const all = KNOWN_HEADERS.every(isObserved);
    observeAllBtn.disabled = all;
    observeAllBtn.textContent = all ? '5 champs observés' : 'Observer les 5 champs';
  }
  function setStatus(status) {
    if (status === 'connected') { connState.textContent = 'connecté'; socketIdEl.textContent = socket.id || '—'; recomputeObserveAll(); }
    else if (status === 'disconnected') { connState.textContent = 'déconnecté'; socketIdEl.textContent = '—'; recomputeObserveAll(); }
    else if (status === 'reconnecting') { connState.textContent = 'Reconnexion…'; }
    else if (status === 'error') { connState.textContent = 'erreur de connexion'; logError('connect_error signalé par socketClient'); }
  }
  function logControl(incoming) {
    controlCount++;
    ctrlCount.textContent = `Contrôles reçus : ${controlCount}`;
    logEvent('control', incoming);
  }

  // --- Persistance locale (Lot 3A) : restauration, dernier save, effacement ---
  function setLocalSaved(at) { if (localSavedEl) localSavedEl.textContent = at || '—'; }
  function setLocalRestore(at) { if (localRestoreEl) localRestoreEl.textContent = at || '—'; }
  if (persistence.initialRestore) setLocalRestore(persistence.initialRestore);
  if (persistence.initialSaved) setLocalSaved(persistence.initialSaved);
  if (clearLocalBtn) {
    clearLocalBtn.addEventListener('click', () => {
      let ok = true;
      if (persistence.clear) ok = persistence.clear();
      setLocalSaved(null);
      setLocalRestore(null);
      if (clearStatusEl) clearStatusEl.textContent = ok ? 'État local effacé.' : 'Effacement impossible (storage indisponible).';
    });
  }

  // --- Fraîcheur (Lot 3B) : rafraîchi par le timer central (main.js, 1 s) ---
  const maxSeenEl = el(root, 'diag-max-seen');
  const maxAgeEl = el(root, 'diag-max-age');
  const contentUpdatedEl = el(root, 'diag-content-updated');
  const contentAgeEl = el(root, 'diag-content-age');
  const maxStateEl = el(root, 'diag-max-state');
  const contentStateEl = el(root, 'diag-content-state');
  function fmtAge(ms) {
    if (ms === null || !Number.isFinite(ms)) return '—';
    if (ms < 1000) return '< 1 s';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    return `${m} min ${s % 60} s`;
  }
  function fmtTs(ms) {
    if (ms === null || !Number.isFinite(ms)) return 'jamais';
    return new Date(ms).toISOString();
  }
  function refreshFreshness(freshness) {
    if (!freshness) return;
    const seen = freshness.getMaxLastSeenAt();
    const upd = freshness.getContentLastUpdatedAt();
    if (maxSeenEl) maxSeenEl.textContent = fmtTs(seen);
    if (maxAgeEl) maxAgeEl.textContent = fmtAge(freshness.maxAgeMs());
    if (contentUpdatedEl) contentUpdatedEl.textContent = fmtTs(upd);
    if (contentAgeEl) contentAgeEl.textContent = fmtAge(freshness.contentAgeMs());
    if (maxStateEl) maxStateEl.textContent = freshness.isMaxActive() ? 'actif' : 'silencieux';
    if (contentStateEl) contentStateEl.textContent = freshness.isContentFresh() ? 'récent' : 'ancien';
  }

  // --- Événements Collab-Hub connus (listeners uniques ; CH-ClientScript.js:546-709) ---
  ['serverMessage', 'myUsername', 'allUsers', 'otherUsers', 'availableControls',
   'observedControls', 'myControls', 'availableEvents', 'observedEvents', 'myEvents',
   'availableRooms', 'myRooms', 'event', 'chat'].forEach((n) => socket.on(n, (p) => logEvent(n, p)));

  if (onAnyEnabled) socket.onAny((name, ...args) => logEvent(`onAny:${name}`, args));
  onanyToggle.addEventListener('change', (e) => {
    onAnyEnabled = e.target.checked;
    if (onAnyEnabled) socket.onAny((name, ...args) => logEvent(`onAny:${name}`, args));
    else socket.offAny();
  });

  // --- Observation idempotente (réutilise le guard de socketClient) ---
  observeAllBtn.addEventListener('click', () => { observeKnownHeadersOnce(); recomputeObserveAll(); });
  el(root, 'diag-observe-btn').addEventListener('click', () => {
    const h = headerInput.value.trim(); if (h) observeHeaderOnce(h);
  });
  el(root, 'diag-unobserve-btn').addEventListener('click', () => {
    const h = headerInput.value.trim(); if (h) { socket.emit('unobserveControl', { header: h }); forget(h); }
  });

  // Liste des 5 headers + bouton d'observation individuel (idempotent).
  KNOWN_HEADERS.forEach((header) => {
    const wrap = document.createElement('div');
    const code = document.createElement('code'); code.textContent = header;
    const btn = document.createElement('button'); btn.textContent = 'observer';
    btn.addEventListener('click', () => observeHeaderOnce(header));
    wrap.append(code, btn); headerList.appendChild(wrap);
  });

  recomputeObserveAll();
  return { setStatus, logControl, setLocalSaved, setLocalRestore, refreshFreshness };
}