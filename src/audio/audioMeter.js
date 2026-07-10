// VU-mètre Web Audio (Lot 4B). Calcul pur RMS / peak / dBFS / clipping à partir
// d'un tampon de données temporelles (Uint8Array 0..255, 128 = silence). Aucun
// setInterval / requestAnimationFrame interne : le contrôleur décide de la
// fréquence de lecture via read(). Aucune dépendance DOM.

import { METER_DB_FLOOR, METER_CLIP_THRESHOLD } from './constants.js';

// Calcule un niveau à partir d'un tampon de bytes temporels (getByteTimeDomainData).
// Pur et testable sans navigateur. `options.clipThreshold` borne le clipping.
export function computeMeterLevel(buf, options = {}) {
  const clipThreshold = options.clipThreshold === undefined ? METER_CLIP_THRESHOLD : options.clipThreshold;
  if (!buf || buf.length === 0) {
    return { rms: 0, peak: 0, db: -Infinity, clipping: false };
  }
  let sum = 0;
  let peak = 0;
  const n = buf.length;
  for (let i = 0; i < n; i++) {
    const v = (buf[i] - 128) / 128; // -1..1 (approx)
    sum += v * v;
    const abs = v < 0 ? -v : v;
    if (abs > peak) peak = abs;
  }
  const rms = Math.sqrt(sum / n);
  const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  return {
    rms,
    peak,
    db,
    clipping: peak > clipThreshold,
  };
}

// Crée un vumètre lié à un AnalyserNode (ou un faux pour les tests).
// read() tire les données courantes et renvoie le niveau ; reset() remet à zéro.
export function createAudioMeter(analyserNode, options = {}) {
  const fftSize = (analyserNode && analyserNode.fftSize) || 1024;
  const buf = new Uint8Array(fftSize);
  buf.fill(128); // silence par défaut

  return {
    read() {
      try {
        analyserNode.getByteTimeDomainData(buf);
      } catch {
        buf.fill(128);
      }
      return computeMeterLevel(buf, options);
    },
    reset() {
      buf.fill(128);
      return computeMeterLevel(buf, options);
    },
  };
}

export { METER_DB_FLOOR };