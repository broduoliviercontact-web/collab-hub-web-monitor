// Graphe Web Audio du performer (Lot 4B) :
//   MediaStream source → MediaStreamAudioSourceNode → GainNode → AnalyserNode (tap)
//                                                            → MediaStreamAudioDestinationNode
// Le flux du destinationNode sera utilisé plus tard pour créer la piste LiveKit.
// Aucune connexion à ctx.destination -> aucun monitoring local audible (anti-Larsen).
// `AudioContextClass` est injectable pour les tests.

import { GAIN_MIN, GAIN_MAX, GAIN_DEFAULT } from './constants.js';

function defaultAudioContextClass() {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  if (typeof webkitAudioContext !== 'undefined') return webkitAudioContext;
  return null;
}

// Borne le gain master dans [0, 1]. Pas d'amplification au-dessus de 1.
export function clampGain(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return GAIN_DEFAULT;
  if (value < GAIN_MIN) return GAIN_MIN;
  if (value > GAIN_MAX) return GAIN_MAX;
  return value;
}

export function createAudioGraph({ stream, AudioContextClass = defaultAudioContextClass() } = {}) {
  if (!AudioContextClass) throw new Error('AudioContext indisponible.');
  if (!stream) throw new Error('MediaStream requis pour construire le graphe.');

  const context = new AudioContextClass();
  const sourceNode = context.createMediaStreamSource(stream);
  const gainNode = context.createGain();
  gainNode.gain.value = GAIN_DEFAULT;
  const analyserNode = context.createAnalyser();
  analyserNode.fftSize = 1024;
  const destinationNode = context.createMediaStreamDestination();

  // source -> gain ; gain -> destination (flux publié) ; gain -> analyser (tap mesure).
  sourceNode.connect(gainNode);
  gainNode.connect(destinationNode);
  gainNode.connect(analyserNode);
  // Notamment : on ne connecte jamais rien à context.destination.

  let closed = false;

  function setGain(value) {
    const g = clampGain(value);
    try { gainNode.gain.value = g; } catch {}
    return g;
  }

  async function resume() {
    if (typeof context.resume === 'function') {
      try { await context.resume(); } catch {}
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    try { sourceNode.disconnect(); } catch {}
    try { gainNode.disconnect(); } catch {}
    try { analyserNode.disconnect(); } catch {}
    try { destinationNode.disconnect(); } catch {}
    if (typeof context.close === 'function') {
      try { context.close(); } catch {}
    }
  }

  return {
    context,
    sourceNode,
    gainNode,
    analyserNode,
    destinationNode,
    outputStream: destinationNode.stream,
    setGain,
    resume,
    close,
    get closed() { return closed; },
  };
}