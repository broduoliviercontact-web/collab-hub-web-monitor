// UI publique du statut de flux direct (Lot 4G) — PURE et testable. Construit le
// bloc "DIRECT AUDIO" (statut / signal / mini VU-mètre) affiché AVANT connexion
// LiveKit, et le rend depuis un snapshot streamStatus (state/streamStatus.js).
// `document` injecté dans buildStreamStatusDOM -> testable en Node avec un faux
// document. Aucune logique métier ici ; aucune dépendance LiveKit.
//
// reduced-motion safe : aucune transition inline (le CSS global désactive les
// transitions sous prefers-reduced-motion ; ici on ne pose que des largeurs via
// setAttribute('style', 'width:..%'), pas d'animation JS).

import { STREAM_STATUS, STREAM_SIGNAL } from '../state/streamStatus.js';

const STATUS_LABELS = {
  [STREAM_STATUS.LIVE]: 'EN DIRECT',
  [STREAM_STATUS.OFF_AIR]: 'HORS ANTENNE',
  [STREAM_STATUS.UNAVAILABLE]: 'STATUT INDISPONIBLE',
};

const SIGNAL_LABELS = {
  [STREAM_SIGNAL.PRESENT]: 'présent',
  [STREAM_SIGNAL.SILENT]: 'silence',
  [STREAM_SIGNAL.NONE]: '—',
};

const DOT_CLASS = {
  [STREAM_STATUS.LIVE]: 'is-ok',
  [STREAM_STATUS.OFF_AIR]: 'is-off',
  [STREAM_STATUS.UNAVAILABLE]: 'is-wait',
};

// Construit le bloc DOM. `mountAfter` : si fourni, inséré juste après cet
// élément. Retourne { section, els }.
export function buildStreamStatusDOM(
  documentRef = (typeof document !== 'undefined' ? document : null),
  mountAfter = null,
) {
  const doc = documentRef;
  if (!doc || typeof doc.createElement !== 'function') return { section: null, els: null };

  const section = doc.createElement('section');
  section.className = 'card stream-card';
  section.setAttribute('data-stream-section', '');

  const block = doc.createElement('div');
  block.className = 'block';

  const title = doc.createElement('h2');
  title.className = 'stream-title';
  title.textContent = 'DIRECT AUDIO';

  const statusLine = doc.createElement('p');
  statusLine.className = 'stream-status';
  const dot = doc.createElement('span');
  dot.className = 'status-dot is-wait';
  dot.id = 'stream-dot';
  const statusLabel = doc.createElement('span');
  statusLabel.id = 'stream-status-label';
  statusLabel.textContent = STATUS_LABELS[STREAM_STATUS.UNAVAILABLE];
  statusLine.append(dot, ' ', statusLabel);

  const signalLine = doc.createElement('p');
  signalLine.className = 'stream-signal';
  const signalKey = doc.createElement('span');
  signalKey.className = 'stream-key';
  signalKey.textContent = 'Signal : ';
  const signalVal = doc.createElement('span');
  signalVal.id = 'stream-signal';
  signalVal.textContent = SIGNAL_LABELS[STREAM_SIGNAL.NONE];
  signalLine.append(signalKey, signalVal);

  const levelLine = doc.createElement('p');
  levelLine.className = 'stream-level';
  const levelKey = doc.createElement('span');
  levelKey.className = 'stream-key';
  levelKey.textContent = 'Niveau : ';
  const meter = doc.createElement('span');
  meter.className = 'stream-meter';
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', 'Niveau du flux direct');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '1');
  const meterBar = doc.createElement('span');
  meterBar.className = 'stream-meter-bar';
  meterBar.id = 'stream-meter-bar';
  const meterPeak = doc.createElement('span');
  meterPeak.className = 'stream-meter-peak';
  meterPeak.id = 'stream-meter-peak';
  meter.append(meterBar, meterPeak);
  levelLine.append(levelKey, meter);

  block.append(title, statusLine, signalLine, levelLine);
  section.append(block);

  if (mountAfter && mountAfter.parentNode) {
    mountAfter.parentNode.insertBefore(section, mountAfter.nextSibling);
  }

  const els = { section, dot, statusLabel, signalVal, meter, meterBar, meterPeak };
  return { section, els };
}

// Borne un pourcentage 0..100 depuis une valeur 0..1.
function pct01(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

// Rend le bloc depuis un snapshot streamStatus. Écritures DOM pures (refs).
// Aucune transition inline -> reduced-motion safe (largeurs seules).
export function renderStreamStatus(snap, els) {
  if (!snap || !els) return;
  const status = snap.computedStatus;
  const label = STATUS_LABELS[status] || STATUS_LABELS[STREAM_STATUS.UNAVAILABLE];
  if (els.statusLabel) els.statusLabel.textContent = label;
  if (els.dot) els.dot.className = `status-dot ${DOT_CLASS[status] || 'is-wait'}`;
  if (els.signalVal) els.signalVal.textContent = SIGNAL_LABELS[snap.signal] || SIGNAL_LABELS[STREAM_SIGNAL.NONE];
  if (els.section && els.section.setAttribute) {
    els.section.setAttribute('data-stream-status', status);
  }
  const rmsPct = pct01(snap.level);
  const peakPct = pct01(snap.peak);
  if (els.meterBar && els.meterBar.setAttribute) {
    els.meterBar.setAttribute('style', `width:${rmsPct}%`);
  }
  if (els.meterPeak && els.meterPeak.setAttribute) {
    els.meterPeak.setAttribute('style', `left:${peakPct}%`);
  }
  if (els.meter && els.meter.setAttribute) {
    els.meter.setAttribute('aria-valuenow', String((snap.level ?? 0).toFixed(3)));
    els.meter.setAttribute('aria-valuetext', `${label} · signal ${SIGNAL_LABELS[snap.signal] || '—'}`);
  }
}