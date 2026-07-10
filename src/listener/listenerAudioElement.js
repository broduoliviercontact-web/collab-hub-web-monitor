// Adaptateur DOM d'écoute LiveKit (Lot 4D). Isole le moteur (livekitListener,
// sans DOM) de l'élément <audio>. Crée ou reçoit un HTMLAudioElement, attache
// une RemoteAudioTrack distante, gère volume/mute, play() (après geste
// utilisateur) et le nettoyage.
//
// `documentRef` injectable (défaut : document global) -> testable en Node avec
// un faux document. `audioElement` optionnel : si fourni, l'adaptateur ne le
// possède pas (ne le retire pas du DOM à la destruction).

export const DEFAULT_VOLUME = 0.8;

export function createListenerAudioElement({
  documentRef = (typeof document !== 'undefined' ? document : null),
  audioElement = null,
  initialVolume = DEFAULT_VOLUME,
} = {}) {
  const doc = documentRef;
  const ownsElement = !audioElement;
  let el = audioElement || (doc && typeof doc.createElement === 'function' ? doc.createElement('audio') : null);

  let track = null;
  let attached = false;
  let playing = false;
  let volume = initialVolume;
  let muted = false;
  let destroyed = false;

  if (el) {
    try { el.volume = volume; el.muted = muted; } catch {}
  }

  function attachTrack(t) {
    if (!el || !t) return;
    track = t;
    try { t.attach(el); } catch {} // RemoteAudioTrack.attach(element)
    attached = true;
    try { el.volume = volume; el.muted = muted; } catch {}
  }

  function detachTrack() {
    if (track && el) { try { track.detach(el); } catch {} }
    if (el) { try { el.srcObject = null; } catch {} }
    track = null;
    attached = false;
    playing = false;
  }

  async function play() {
    if (!el || typeof el.play !== 'function') return;
    // el.play() renvoie une Promise : NotAllowedError si autoplay bloqué.
    await el.play();
    playing = true;
  }

  function pause() {
    if (el && typeof el.pause === 'function') { try { el.pause(); } catch {} }
    playing = false;
  }

  function setVolume(v) { volume = v; if (el) { try { el.volume = v; } catch {} } }
  function setMuted(b) { muted = !!b; if (el) { try { el.muted = muted; } catch {} } }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    pause();
    detachTrack();
    if (ownsElement && el && el.parentNode && typeof el.parentNode.removeChild === 'function') {
      try { el.parentNode.removeChild(el); } catch {}
    }
  }

  function getSnapshot() {
    return { attached, playing, volume, muted, ownsElement, hasElement: !!el };
  }

  return { attachTrack, detachTrack, play, pause, setVolume, setMuted, destroy, getSnapshot };
}