// Panneau de diagnostic activé via ?debug=1. conserve les capacités du spike :
// événements reçus, JSON brut, observation des 5 headers, diagnostic de connexion.
//
// Lot 1.1 : n'attache PAS de listeners connect/disconnect/control (doublons vs
// socketClient) — reçoit statut + contrôles via setStatus()/logControl() appelés
// par main.js. Attache uniquement onAny + les événements Collab-Hub connus
// (listeners uniques). L'observation réutilise le guard idempotent de socketClient.
import { KNOWN_HEADERS } from '../collabHub/messageRouter.js';

const el = (root, id) => root.querySelector(`#${id}`);

export function initDiagnostic(api, root) {
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
  return { setStatus, logControl };
}