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
  // Lot 4G : le bloc "DIRECT AUDIO" (statut de flux public, state/streamStatus)
  // est désormais la carte dédiée placée au-dessus. Cette section devient
  // l'unité d'écoute -> titre aligné sur le bouton, pour éviter un doublon
  // "DIRECT AUDIO". Moteur listener, bouton ÉCOUTER LE DIRECT et logique
  // inchangés.
  title.textContent = 'Écouter le direct';

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

  // Hotfix iOS/Safari : bouton explicite "ACTIVER LE SON" affiché quand la
  // lecture automatique a été refusée (waiting_for_user + autoplayBlocked). Il
  // déclenche room.startAudio() + audioSink.play() dans un nouveau geste
  // utilisateur (requis sur iOS pour activer la sortie audio).
  const activate = doc.createElement('button');
  activate.id = 'lk-activate';
  activate.type = 'button';
  activate.className = 'lk-activate';
  activate.textContent = 'ACTIVER LE SON';
  activate.hidden = true;

  // Bouton enceinte (Lot 4F.1) : clic = mute/unmute, double-clic = -20 dB.
  // Vrai <button> accessible (aria-label + title), pas un emoji décoratif.
  const speaker = doc.createElement('button');
  speaker.id = 'lk-speaker';
  speaker.type = 'button';
  speaker.className = 'lk-speaker';
  speaker.textContent = '🔊';
  speaker.hidden = true;

  // Badge "−20 dB" discret à côté de l'enceinte, visible uniquement si actif.
  const attenBadge = doc.createElement('span');
  attenBadge.id = 'lk-atten-badge';
  attenBadge.className = 'lk-atten-badge';
  attenBadge.textContent = '−20 dB';
  attenBadge.hidden = true;

  // Bouton secondaire accessible -20 dB (clavier / tactile), double-clic alternatif.
  const attenBtn = doc.createElement('button');
  attenBtn.id = 'lk-atten-btn';
  attenBtn.type = 'button';
  attenBtn.className = 'lk-atten-btn';
  attenBtn.textContent = '−20 dB';
  attenBtn.setAttribute('aria-pressed', 'false');
  attenBtn.hidden = true;

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

  controls.append(primary, activate, speaker, attenBadge, attenBtn, volumeWrap);
  block.append(title, statusLine, controls);
  section.append(block);

  if (mountAfter && mountAfter.parentNode) {
    mountAfter.parentNode.insertBefore(section, mountAfter.nextSibling);
  }

  const els = { section, status, dot, primary, activate, speaker, attenBadge, attenBtn, volume, volumeLabel, volumeWrap };
  return { section, els };
}

// Icône enceinte selon l'état : 🔇 mute, 🔉 atténué, 🔊 volume actif.
function speakerIcon(snap) {
  if (snap.muted) return '🔇';
  if (snap.attenuationActive) return '🔉';
  return '🔊';
}

// Met à jour l'UI depuis un snapshot listener. Écritures DOM pures (refs).
export function renderListenerState(snap, els) {
  if (!snap || !els) return;
  const state = snap.state;
  if (els.status) els.status.textContent = STATUS_LABELS[state] || 'Hors ligne';
  if (els.dot) els.dot.className = `status-dot ${DOT_CLASS[state] || 'is-off'}`;

  const showPrimary = PRIMARY_VISIBLE.has(state);
  // Hotfix iOS : bouton ACTIVER LE SON quand l'autoplay a été refusé (un second
  // geste utilisateur est nécessaire pour activer la sortie audio sur Safari).
  const showActivate = state === 'waiting_for_user' && !!snap.autoplayBlocked;
  if (els.activate) els.activate.hidden = !showActivate;
  if (els.primary) {
    els.primary.hidden = !showPrimary || showActivate;
    els.primary.textContent = state === 'error' ? 'RÉESSAYER' : 'ÉCOUTER LE DIRECT';
  }

  const hasTrack = !!snap.hasAudioTrack;
  const muted = !!snap.muted;
  const atten = !!snap.attenuationActive;
  if (els.speaker) {
    els.speaker.hidden = !hasTrack;
    els.speaker.textContent = speakerIcon(snap);
    // aria-label + title décrivent l'action du clic simple (mute/unmute).
    const label = muted ? 'Réactiver le son' : 'Couper le son';
    if (els.speaker.setAttribute) {
      els.speaker.setAttribute('aria-label', label);
      els.speaker.setAttribute('title', label);
    }
  }
  if (els.attenBadge) els.attenBadge.hidden = !(hasTrack && atten);
  if (els.attenBtn) {
    els.attenBtn.hidden = !hasTrack;
    const al = atten ? 'Désactiver l\'atténuation de 20 décibels' : 'Activer l\'atténuation de 20 décibels';
    if (els.attenBtn.setAttribute) {
      els.attenBtn.setAttribute('aria-pressed', atten ? 'true' : 'false');
      els.attenBtn.setAttribute('aria-label', al);
      els.attenBtn.setAttribute('title', al);
    }
  }
  if (els.volumeWrap) els.volumeWrap.hidden = !hasTrack;
  if (els.volume && typeof snap.volume === 'number') {
    // Le slider représente toujours le volume utilisateur (jamais la valeur
    // atténuée) — il ne bouge pas pendant l'atténuation.
    els.volume.value = String(snap.volume);
  }
  if (els.volumeLabel) {
    const pct = Math.round((snap.volume || 0) * 100);
    // Affiche "60 % · −20 dB" (et non 6 %) quand l'atténuation est active.
    els.volumeLabel.textContent = atten ? `${pct}% · −20 dB` : `${pct}%`;
  }
}

// Discriminateur clic / double-clic (Lot 4F.1 §12). Un double-clic ne doit PAS
// déclencher mute -> unmute -> atténuation : seul l'atténuation résulte d'un
// double-clic. On diffère l'action simple d'un court délai ; un dblclick annule
// l'action simple en attente et déclenche l'atténuation. `timerImpl` injectable
// (setTimeout/clearTimeout par défaut) -> testable de façon déterministe.
export function createClickDiscriminator(
  { onSingle, onDouble, delayMs = 220 } = {},
  timerImpl = (typeof setTimeout === 'function' ? { setTimeout, clearTimeout } : null),
) {
  let timer = null;
  const api = {
    click() {
      if (timer != null) return; // un dblclick est en cours de résolution
      timer = timerImpl.setTimeout(() => { timer = null; onSingle && onSingle(); }, delayMs);
    },
    dblclick() {
      if (timer != null) { timerImpl.clearTimeout(timer); timer = null; }
      onDouble && onDouble();
    },
    // Test helper : déclenche l'action simple en attente (simule l'expiration du
    // délai sans attendre réellement).
    _flush() { if (timer != null) { timerImpl.clearTimeout(timer); timer = null; onSingle && onSingle(); } },
    _pending() { return timer != null; },
  };
  return api;
}

// Câble les contrôles. onPrimary (écouter/réessayer/démarrer audio selon état
// courant, géré par l'orchestrateur), onActivate (second geste iOS/Safari ->
// room.startAudio + play), onMuteToggle (clic enceinte),
// onAttenuationToggle (double-clic enceinte OU bouton -20 dB), onVolume(0..1).
export function wireListenerControls({ els, onPrimary, onActivate, onMuteToggle, onAttenuationToggle, onVolume } = {}) {
  if (!els) return;
  if (els.primary && typeof els.primary.addEventListener === 'function' && onPrimary) {
    els.primary.addEventListener('click', onPrimary);
  }
  if (els.activate && typeof els.activate.addEventListener === 'function' && onActivate) {
    els.activate.addEventListener('click', onActivate);
  }
  // Bouton enceinte : clic simple = mute, double-clic = -20 dB (discrimination).
  if (els.speaker && typeof els.speaker.addEventListener === 'function' && (onMuteToggle || onAttenuationToggle)) {
    const disc = createClickDiscriminator({ onSingle: onMuteToggle, onDouble: onAttenuationToggle });
    els.speaker.addEventListener('click', () => disc.click());
    els.speaker.addEventListener('dblclick', () => disc.dblclick());
  }
  // Bouton -20 dB accessible (clavier/tactile) : bascule directe de l'atténuation.
  if (els.attenBtn && typeof els.attenBtn.addEventListener === 'function' && onAttenuationToggle) {
    els.attenBtn.addEventListener('click', onAttenuationToggle);
  }
  if (els.volume && typeof els.volume.addEventListener === 'function' && onVolume) {
    els.volume.addEventListener('input', () => {
      const v = parseFloat(els.volume.value);
      onVolume(Number.isFinite(v) ? v : 0);
    });
  }
}