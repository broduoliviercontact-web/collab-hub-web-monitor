// UI de la Control Room performer (Lot 4E) — partie PURE et testable. Construit
// le DOM (7 sections), rend un snapshot composite, dessine le VU-mètre, et câble
// les contrôles. Aucune valeur secrète (mot de passe, token, clé) n'est jamais
// écrite dans le DOM : le champ mot de passe reste dans l'<input> (transmis au
// contrôleur au clic, jamais reflété). `document` injecté -> testable en Node.

import {
  broadcastStatus,
  broadcastDotClass,
  describeError,
} from './controlRoomState.js';

// États composites où une diffusion est en cours (ARRÊTER visible / actif).
const BROADCASTING = new Set([
  'requesting_token', 'connecting', 'publishing', 'live', 'reconnecting', 'stopping',
]);

const PERMISSION_LABELS = {
  not_requested: 'Micro non autorisé',
  requesting: 'Autorisation…',
  granted: 'Micro autorisé',
  denied: 'Micro refusé',
};

// Construit le DOM. Retourne { root, els }. `mount` : élément parent où insérer.
export function buildControlRoomDOM(
  documentRef = (typeof document !== 'undefined' ? document : null),
  mount = null,
) {
  const doc = documentRef;
  if (!doc || typeof doc.createElement !== 'function') return { root: null, els: null };

  const root = doc.createElement('main');
  root.className = 'card cr-room';

  function block(titleText) {
    const b = doc.createElement('section');
    b.className = 'block';
    const h = doc.createElement('h2');
    h.className = 'lk-title';
    h.textContent = titleText;
    b.append(h);
    root.append(b);
    return b;
  }
  function btn(id, label) {
    const b = doc.createElement('button');
    b.id = id; b.type = 'button'; b.textContent = label;
    return b;
  }
  function span(id) {
    const s = doc.createElement('span');
    s.id = id;
    return s;
  }

  // 1. SESSION (Lot 4F.1) : la Control Room n'est montée qu'après authentification
  //    serveur (gate). Aucun champ mot de passe ici — l'auth se fait sur l'écran
  //    de login. Bouton de déconnexion explicite -> détruit la session.
  const bSess = block('Session');
  const sessionLabel = span('cr-session'); sessionLabel.className = 'cr-hint';
  sessionLabel.textContent = 'Session performer active';
  const logout = btn('cr-logout', 'QUITTER LA CONTROL ROOM');
  bSess.append(sessionLabel, logout);

  // 2. SOURCE AUDIO
  const bSrc = block('Source audio');
  const authorize = btn('cr-authorize', 'AUTORISER LE MICRO');
  const permState = span('cr-permission'); permState.className = 'cr-hint';
  const device = doc.createElement('select'); device.id = 'cr-device';
  const refreshDevices = btn('cr-refresh-devices', 'RAFRAÎCHIR');
  bSrc.append(authorize, permState, device, refreshDevices);

  // 3. CAPTURE
  const bCap = block('Capture');
  const startCapture = btn('cr-start-capture', 'DÉMARRER LA CAPTURE');
  const stopCapture = btn('cr-stop-capture', 'ARRÊTER LA CAPTURE');
  const captureHint = span('cr-capture-hint'); captureHint.className = 'cr-hint';
  bCap.append(startCapture, stopCapture, captureHint);

  // 4. NIVEAU (VU-mètre)
  const bLvl = block('Niveau');
  const meter = doc.createElement('div'); meter.id = 'cr-meter'; meter.className = 'cr-meter';
  const meterBar = doc.createElement('div'); meterBar.id = 'cr-meter-bar'; meterBar.className = 'cr-meter-bar';
  const meterPeak = doc.createElement('span'); meterPeak.id = 'cr-meter-peak'; meterPeak.className = 'cr-meter-peak';
  const meterDb = span('cr-meter-db'); meterDb.className = 'cr-meter-db';
  meter.append(meterBar, meterPeak);
  bLvl.append(meter, meterDb);

  // 5. MASTER
  const bMaster = block('Master');
  const gain = doc.createElement('input');
  gain.id = 'cr-gain'; gain.type = 'range'; gain.min = '0'; gain.max = '100'; gain.step = '1'; gain.value = '100';
  const gainLabel = span('cr-gain-label'); gainLabel.className = 'cr-hint';
  bMaster.append(gain, gainLabel);

  // 6. DIFFUSION
  const bDiff = block('Diffusion');
  const diffStatus = doc.createElement('p'); diffStatus.className = 'lk-status';
  const broadcastDot = doc.createElement('span'); broadcastDot.id = 'cr-broadcast-dot'; broadcastDot.className = 'status-dot is-off';
  const broadcastLabel = span('cr-broadcast-label');
  diffStatus.append(broadcastDot, ' ', broadcastLabel);
  const onair = span('cr-onair'); onair.className = 'cr-onair'; onair.hidden = true; onair.textContent = 'ON AIR';
  const startBroadcast = btn('cr-start-broadcast', 'DÉMARRER LA DIFFUSION');
  const stopBroadcast = btn('cr-stop-broadcast', 'ARRÊTER LA DIFFUSION');
  const diffInfo = doc.createElement('div'); diffInfo.className = 'cr-info';
  const room = span('cr-room'); const identity = span('cr-identity'); const track = span('cr-track');
  diffInfo.append(room, identity, track);
  bDiff.append(diffStatus, onair, startBroadcast, stopBroadcast, diffInfo);

  // 7. STATUT
  const bStat = block('Statut');
  const status = span('cr-status'); status.className = 'cr-hint';
  const err = span('cr-error'); err.className = 'cr-error';
  const lastAction = span('cr-last-action'); lastAction.className = 'cr-hint';
  bStat.append(status, err, lastAction);

  if (mount && typeof mount.appendChild === 'function') mount.appendChild(root);

  const els = {
    root, sessionLabel, logout, startBroadcast,
    authorize, permState, device, refreshDevices,
    startCapture, stopCapture, captureHint,
    meter, meterBar, meterPeak, meterDb,
    gain, gainLabel,
    broadcastDot, broadcastLabel, onair, stopBroadcast, room, identity, track,
    status, err, lastAction,
    _canBroadcast: false,
    _doc: doc,
  };
  return { root, els };
}

// Rend le VU-mètre depuis une lecture meter {rms,peak,db,clipping} ou null.
export function renderMeter(meter, els) {
  if (!els) return;
  const m = meter && typeof meter === 'object' ? meter : null;
  if (!m) {
    if (els.meterBar) els.meterBar.style = els.meterBar.style || {};
    if (els.meterBar && els.meterBar.setAttribute) els.meterBar.setAttribute('style', 'width:0%');
    if (els.meterPeak && els.meterPeak.setAttribute) els.meterPeak.setAttribute('style', 'left:0%');
    if (els.meterDb) els.meterDb.textContent = '—';
    if (els.meter && els.meter.classList) els.meter.classList.remove('is-clipping');
    return;
  }
  const rmsPct = Math.max(0, Math.min(100, (m.rms || 0) * 100));
  const peakPct = Math.max(0, Math.min(100, (m.peak || 0) * 100));
  if (els.meterBar && els.meterBar.setAttribute) els.meterBar.setAttribute('style', `width:${rmsPct}%`);
  if (els.meterPeak && els.meterPeak.setAttribute) els.meterPeak.setAttribute('style', `left:${peakPct}%`);
  if (els.meterDb) {
    els.meterDb.textContent = (m.db === -Infinity || m.db == null) ? '-∞ dBFS' : `${m.db.toFixed(1)} dBFS`;
  }
  if (els.meter && els.meter.classList) {
    if (m.clipping) els.meter.classList.add('is-clipping'); else els.meter.classList.remove('is-clipping');
  }
}

// Met à jour l'UI depuis un snapshot composite. Aucune valeur secrète.
export function renderControlRoom(snap, els, { debug = false } = {}) {
  if (!snap || !els) return;
  const composite = snap.composite;
  const broadcasting = BROADCASTING.has(composite);

  // Diffusion
  if (els.broadcastLabel) els.broadcastLabel.textContent = snap.broadcastLabel || broadcastStatus(composite);
  if (els.broadcastDot && els.broadcastDot.setAttribute) {
    els.broadcastDot.setAttribute('class', broadcastDotClass(composite));
  }
  if (els.onair) els.onair.hidden = !snap.onAir;
  if (els.stopBroadcast) els.stopBroadcast.hidden = !broadcasting;
  if (els.room) els.room.textContent = snap.roomName ? `Room : ${snap.roomName}` : '';
  if (els.identity) els.identity.textContent = snap.identity ? `Identity : ${snap.identity}` : '';
  if (els.track) els.track.textContent = snap.trackSid ? `Track : ${snap.trackSid}` : '';

  // Connexion / diffusion (Lot 4F.1 : pas de mot de passe — auth via session)
  els._canBroadcast = !!snap.canBroadcast;
  if (els.startBroadcast) {
    els.startBroadcast.disabled = !snap.canBroadcast;
    els.startBroadcast.textContent = snap.onAir ? 'EN DIFFUSION' : 'DÉMARRER LA DIFFUSION';
  }

  // Permission / source
  const perm = snap.permission || 'not_requested';
  if (els.permState) els.permState.textContent = PERMISSION_LABELS[perm] || '';
  if (els.authorize) {
    els.authorize.hidden = perm === 'granted';
    els.authorize.disabled = perm === 'requesting';
    els.authorize.textContent = perm === 'denied' ? 'RÉAUTORISER LE MICRO' : 'AUTORISER LE MICRO';
  }
  // Device select : options depuis snap.devices.
  if (els.device) {
    const dev = els.device;
    dev.disabled = perm !== 'granted' || snap.audioState === 'capturing' || snap.audioState === 'starting';
    // Reconstruit les options uniquement si la liste change (évite reset focus).
    const opts = (snap.devices || []).map((d) => `${d.deviceId}|${d.label || d.deviceId}`).join('::');
    if (dev._lastOpts !== opts) {
      dev._lastOpts = opts;
      dev._options = (snap.devices || []).map((d) => ({
        value: d.deviceId || '',
        label: d.label || d.deviceId || '(sans nom)',
      }));
      // Vrai navigateur : remplace les enfants <option>. Tests : descripteur stocké.
      if (els._doc && typeof dev.replaceChildren === 'function') {
        dev.replaceChildren();
        for (const o of dev._options) {
          const opt = els._doc.createElement('option');
          opt.value = o.value; opt.textContent = o.label;
          dev.append(opt);
        }
      }
    }
    if (snap.selectedDeviceId != null) dev.value = snap.selectedDeviceId;
    else if (dev._options && dev._options.length) dev.value = dev._options[0].value;
  }
  if (els.refreshDevices) els.refreshDevices.disabled = snap.audioState === 'capturing' || snap.audioState === 'starting';

  // Capture
  const capturing = snap.audioState === 'capturing' || snap.audioState === 'starting';
  if (els.startCapture) {
    els.startCapture.hidden = capturing;
    els.startCapture.disabled = perm !== 'granted' || broadcasting;
  }
  if (els.stopCapture) els.stopCapture.hidden = !capturing;
  if (els.captureHint) {
    els.captureHint.textContent = capturing ? (snap.selectedDeviceLabel || 'Capture en cours') : '';
  }

  // Master
  if (els.gain && typeof snap.gain === 'number') {
    els.gain.value = String(Math.round(snap.gain * 100));
  }
  if (els.gainLabel) els.gainLabel.textContent = `${Math.round((snap.gain || 0) * 100)}%`;

  // Niveau
  renderMeter(snap.meter, els);

  // Statut
  if (els.status) els.status.textContent = debug ? `État : ${composite}` : (snap.broadcastLabel || broadcastStatus(composite));
  if (els.err) els.err.textContent = snap.error ? (snap.error.message || describeError(snap.error.code)) : '';
  if (els.lastAction) {
    const r = snap.lastActionResult;
    if (!r) els.lastAction.textContent = '';
    else if (r.ok) els.lastAction.textContent = 'Diffusion démarrée.';
    else els.lastAction.textContent = describeError(r.code);
  }
}

// Active/désactive DÉMARRER LA DIFFUSION selon canBroadcast (aucun mot de passe
// à saisir en Control Room — l'auth est gérée par la session serveur).
export function updateBroadcastEnabled(els) {
  if (!els || !els.startBroadcast) return;
  els.startBroadcast.disabled = !els._canBroadcast;
}

// Câble les contrôles. handlers = { onAuthorize, onRefreshDevices, onSelectDevice,
// onStartCapture, onStopCapture, onGain, onStartBroadcast, onStopBroadcast,
// onLogout }.
export function wireControlRoom({ els, handlers = {} } = {}) {
  if (!els) return;
  const on = (el, ev, cb) => {
    if (el && typeof el.addEventListener === 'function' && typeof cb === 'function') {
      el.addEventListener(ev, cb);
    }
  };
  on(els.authorize, 'click', handlers.onAuthorize);
  on(els.refreshDevices, 'click', handlers.onRefreshDevices);
  on(els.startCapture, 'click', handlers.onStartCapture);
  on(els.stopCapture, 'click', handlers.onStopCapture);
  on(els.stopBroadcast, 'click', handlers.onStopBroadcast);
  on(els.logout, 'click', handlers.onLogout);
  on(els.startBroadcast, 'click', () => {
    if (typeof handlers.onStartBroadcast === 'function') handlers.onStartBroadcast();
  });
  on(els.device, 'change', () => {
    if (typeof handlers.onSelectDevice === 'function') {
      handlers.onSelectDevice(els.device && els.device.value ? String(els.device.value) : null);
    }
  });
  on(els.gain, 'input', () => {
    if (typeof handlers.onGain === 'function') {
      const v = parseInt(els.gain && els.gain.value, 10);
      handlers.onGain(Number.isFinite(v) ? v : 100);
    }
  });
}

// ================= Écran de login (Lot 4F.1) =================
// Gate applicatif : avant authentification, SEUL cet écran est monté. Aucun
// contrôle métier, aucun moteur audio, aucun import LiveKit lourd. Le mot de
// passe reste dans l'<input>, transmis au gate puis vidé (jamais stocké, jamais
// reflété dans le DOM hors saisie).

export function buildLoginDOM(
  documentRef = (typeof document !== 'undefined' ? document : null),
  mount = null,
) {
  const doc = documentRef;
  if (!doc || typeof doc.createElement !== 'function') return { root: null, els: null };

  const root = doc.createElement('main');
  root.className = 'card cr-login';

  const title = doc.createElement('h1');
  title.className = 'cr-login-title';
  title.textContent = 'CONTROL ROOM';

  const subtitle = doc.createElement('p');
  subtitle.className = 'cr-login-sub';
  subtitle.textContent = 'Accès performer';

  const form = doc.createElement('form');
  form.className = 'cr-login-form';
  form.setAttribute('autocomplete', 'off');

  const password = doc.createElement('input');
  password.id = 'cr-login-password';
  password.type = 'password';
  password.autocomplete = 'off';
  password.placeholder = 'Mot de passe performer';
  password.setAttribute('aria-label', 'Mot de passe performer');

  const enter = doc.createElement('button');
  enter.id = 'cr-login-enter';
  enter.type = 'submit';
  enter.textContent = 'ENTRER';

  const error = doc.createElement('p');
  error.id = 'cr-login-error';
  error.className = 'cr-error';
  error.setAttribute('role', 'alert');

  form.append(password, enter);
  root.append(title, subtitle, form, error);

  if (mount && typeof mount.appendChild === 'function') mount.appendChild(root);

  const els = { root, title, subtitle, form, password, enter, error, _doc: doc };
  return { root, els };
}

// Rend l'état du gate. snap = { state, error } ; error = message FR ou null.
// state ∈ { unauthenticated, authenticating, authenticated, error }.
export function renderLogin(snap, els) {
  if (!snap || !els) return;
  if (els.error) els.error.textContent = snap.error || '';
  if (els.enter) {
    els.enter.disabled = snap.state === 'authenticating';
    els.enter.textContent = snap.state === 'authenticating' ? 'CONNEXION…' : 'ENTRER';
  }
  if (els.password) els.password.disabled = snap.state === 'authenticating';
}

// Câble le formulaire. onLogin(password) appelé à la soumission ; le mot de passe
// est lu puis l'<input> est vidée immédiatement (jamais conservé au-delà de l'appel).
export function wireLogin({ els, onLogin } = {}) {
  if (!els || typeof onLogin !== 'function') return;
  const submit = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const pw = els.password && typeof els.password.value === 'string' ? els.password.value : '';
    els.password && (els.password.value = '');
    onLogin(pw);
  };
  if (els.form && typeof els.form.addEventListener === 'function') {
    els.form.addEventListener('submit', submit);
  } else if (els.enter && typeof els.enter.addEventListener === 'function') {
    els.enter.addEventListener('click', submit);
  }
}