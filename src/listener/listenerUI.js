// UI publique d'écoute LiveKit (Lot 4D) — partie PURE et testable. Ne dépend
// pas de livekit-client ni de l'engine : construit le DOM de la section, rend un
// snapshot listener, et câble les contrôles. `document` est injecté dans
// buildListenerDOM (défaut : document global) -> testable en Node avec un faux
// document. L'orchestrateur (listenerSection.js) assemble engine + adaptateur
// audio + cette UI.

export const STATUS_LABELS = {
  idle: 'Hors ligne',
  stopped: 'Hors ligne',
  requesting_token: 'Connexion…',
  connecting: 'Connexion…',
  connected: 'En attente du direct',
  waiting_for_track: 'En attente du direct',
  track_available: 'Direct disponible',
  waiting_for_user: 'Direct disponible',
  playing: 'Lecture en cours',
  reconnecting: 'Reconnexion…',
  error: 'Erreur audio',
};

const DOT_CLASS = {
  playing: 'is-ok',
  requesting_token: 'is-wait', connecting: 'is-wait', connected: 'is-wait',
  waiting_for_track: 'is-wait', track_available: 'is-wait',
  waiting_for_user: 'is-wait', reconnecting: 'is-wait',
  idle: 'is-off', stopped: 'is-off', error: 'is-off',
};

// États où le bouton principal (écouter / réessayer) est visible. Masqué pendant
// la connexion active, l'attente de piste et la lecture.
const PRIMARY_VISIBLE = new Set(['idle', 'stopped', 'waiting_for_user', 'track_available', 'error']);

// Active la section listener. true -> active ; false/absent -> masquée ; valeur
// inconnue -> false + avertissement console discret (§11).
export function isLiveKitEnabled(raw) {
  const enabled = raw === 'true';
  if (raw != null && raw !== '' && raw !== 'false' && raw !== 'true') {
    console.warn('[LiveKit] VITE_LIVEKIT_ENABLED valeur inconnue — listener désactivé.');
  }
  return enabled;
}

// Construit la section DOM additive. Retourne { section, els }. `mountAfter` :
// si fourni, la section est insérée juste après cet élément.
export function buildListenerDOM(documentRef = (typeof document !== 'undefined' ? document : null), mountAfter = null) {
  const doc = documentRef;
  if (!doc || typeof doc.createElement !== 'function') return { section: null, els: null };

  const section = doc.createElement('section');
  section.className = 'card lk-listener';
  section.setAttribute('data-lk-section', '');

  const block = doc.createElement('div');
  block.className = 'block';

  const title = doc.createElement('h2');
  title.className = 'lk-title';
  title.textContent = 'DIRECT AUDIO';

  const statusLine = doc.createElement('p');
  statusLine.className = 'lk-status';
  const dot = doc.createElement('span');
  dot.className = 'status-dot is-off';
  dot.id = 'lk-dot';
  const status = doc.createElement('span');
  status.id = 'lk-status';
  status.textContent = STATUS_LABELS.idle;
  statusLine.append(dot, ' ', status);

  const controls = doc.createElement('div');
  controls.className = 'lk-controls';

  const primary = doc.createElement('button');
  primary.id = 'lk-primary';
  primary.type = 'button';
  primary.textContent = 'ÉCOUTER LE DIRECT';

  const mute = doc.createElement('button');
  mute.id = 'lk-mute';
  mute.type = 'button';
  mute.textContent = 'COUPER';
  mute.hidden = true;

  const volumeWrap = doc.createElement('label');
  volumeWrap.className = 'lk-volume';
  volumeWrap.hidden = true;
  const volume = doc.createElement('input');
  volume.id = 'lk-volume';
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.01';
  volume.value = '0.8';
  const volumeLabel = doc.createElement('span');
  volumeLabel.id = 'lk-volume-label';
  volumeLabel.textContent = '80%';
  volumeWrap.append(volume, ' ', volumeLabel);

  controls.append(primary, mute, volumeWrap);
  block.append(title, statusLine, controls);
  section.append(block);

  if (mountAfter && mountAfter.parentNode) {
    mountAfter.parentNode.insertBefore(section, mountAfter.nextSibling);
  }

  const els = { section, status, dot, primary, mute, volume, volumeLabel, volumeWrap };
  return { section, els };
}

// Met à jour l'UI depuis un snapshot listener. Écritures DOM pures (refs).
export function renderListenerState(snap, els) {
  if (!snap || !els) return;
  const state = snap.state;
  if (els.status) els.status.textContent = STATUS_LABELS[state] || 'Hors ligne';
  if (els.dot) els.dot.className = `status-dot ${DOT_CLASS[state] || 'is-off'}`;

  const showPrimary = PRIMARY_VISIBLE.has(state);
  if (els.primary) {
    els.primary.hidden = !showPrimary;
    els.primary.textContent = state === 'error' ? 'RÉESSAYER' : 'ÉCOUTER LE DIRECT';
  }

  const hasTrack = !!snap.hasAudioTrack;
  if (els.mute) {
    els.mute.hidden = !hasTrack;
    els.mute.textContent = snap.muted ? 'RÉACTIVER' : 'COUPER';
  }
  if (els.volumeWrap) els.volumeWrap.hidden = !hasTrack;
  if (els.volume && typeof snap.volume === 'number') {
    els.volume.value = String(snap.volume);
  }
  if (els.volumeLabel) {
    const pct = Math.round((snap.volume || 0) * 100);
    els.volumeLabel.textContent = `${pct}%`;
  }
}

// Câble les contrôles. onPrimary (écouter/réessayer/démarrer audio selon état
// courant, géré par l'orchestrateur), onMuteToggle, onVolume(value 0..1).
export function wireListenerControls({ els, onPrimary, onMuteToggle, onVolume } = {}) {
  if (!els) return;
  if (els.primary && typeof els.primary.addEventListener === 'function' && onPrimary) {
    els.primary.addEventListener('click', onPrimary);
  }
  if (els.mute && typeof els.mute.addEventListener === 'function' && onMuteToggle) {
    els.mute.addEventListener('click', onMuteToggle);
  }
  if (els.volume && typeof els.volume.addEventListener === 'function' && onVolume) {
    els.volume.addEventListener('input', () => {
      const v = parseFloat(els.volume.value);
      onVolume(Number.isFinite(v) ? v : 0);
    });
  }
}