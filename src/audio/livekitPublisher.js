// Publisher LiveKit du performer (Lot 4C). Connecte le MediaStream post-fader du
// moteur audio local (audioEngine.getOutputStream()) à LiveKit Cloud. Entièrement
// injectable (tokenClient, RoomClass, LocalAudioTrackClass, now) -> testable en
// Node sans livekit-client, sans navigateur, sans vrai LiveKit.
//
// Ownership des ressources :
//   - audioEngine possède le MediaStream source et l'AudioContext.
//   - le publisher ne possède QUE la LocalAudioTrack wrapper + la connexion Room.
//   - stop()/destroy() unpublishent (sans stopper la piste source) et
//     déconnectent la Room ; ils n'arrêtent PAS le MediaStream de audioEngine ni
//     ne ferment l'AudioContext.
//
// Aucune référence LiveKit codée en dur : RoomClass/LocalAudioTrackClass/trackSource
// sont injectés par l'appelant (Lot 4E). Aucune import de livekit-client ici.

import { GAIN_DEFAULT } from './constants.js';

const ACTIVE = new Set(['requesting_token', 'connecting', 'connected', 'publishing', 'live', 'reconnecting']);

// Événements Room LiveKit (valeurs string de RoomEvent) utilisés par le publisher.
const EVT_RECONNECTING = 'reconnecting';
const EVT_RECONNECTED = 'reconnected';
const EVT_DISCONNECTED = 'disconnected';

export const PUBLISHER_ERRORS = {
  busy: 'publisher_busy',
  no_output_stream: 'no_output_stream',
  no_audio_track: 'no_audio_track',
  track_ended: 'track_ended',
  token: 'token_failed',
  connect: 'connect_failed',
  publish: 'publish_failed',
  disconnected: 'disconnected',
  failed: 'publisher_failed',
};

function err(code, message, cause) {
  return { code, message, cause: cause?.code || cause?.name || undefined };
}

export function createLiveKitPublisher({
  tokenClient,
  RoomClass,
  LocalAudioTrackClass,
  trackSource = 'microphone', // équivaut à Track.Source.Microphone (injectable)
  publishOptions = { dtx: false, forceStereo: true },
  trackName = 'program-audio',
  roomOptions = {},
  now = Date.now,
} = {}) {
  let state = 'idle';
  let lastError = null;

  let room = null;
  let localTrack = null;
  let mediaTrack = null;     // piste du graphe audio (possédée par audioEngine)
  let publication = null;

  let identity = null;
  let roomName = null;
  let participantSid = null;
  let trackSid = null;

  let isConnected = false;
  let isPublished = false;
  let userStopped = false;
  let reconnectCount = 0;
  let connectedAt = null;
  let liveSince = null;

  const listeners = new Set();
  let destroyed = false;

  function setState(next) {
    if (state === next) return;
    state = next;
    notify();
  }

  function setError(code, message, cause) {
    lastError = err(code, message, cause);
    setState('error');
  }

  function notify() {
    const snap = getSnapshot();
    for (const l of listeners) { try { l(snap); } catch {} }
  }

  // Récupère exactement une piste audio live depuis le outputStream du moteur.
  function resolveMediaTrack(outputStream) {
    if (!outputStream || typeof outputStream.getAudioTracks !== 'function') return null;
    const tracks = outputStream.getAudioTracks();
    const live = tracks.find((t) => t && t.readyState === 'live');
    return live || null;
  }

  // Retire les listeners Room sans stopper la piste source.
  function detachRoomListeners() {
    if (!room) return;
    try { if (typeof room.removeAllListeners === 'function') room.removeAllListeners(); } catch {}
    try { if (typeof room.off === 'function') { room.off(EVT_RECONNECTING); room.off(EVT_RECONNECTED); room.off(EVT_DISCONNECTED); } } catch {}
  }

  // Nettoyage interne (unpublish + disconnect + listeners) sans toucher au
  // MediaStream source ni à l'AudioContext. Ne change pas l'état visible.
  async function cleanup() {
    if (publication != null || localTrack != null) {
      try {
        if (room && room.localParticipant && typeof room.localParticipant.unpublishTrack === 'function') {
          // stop=false : on ne stoppe PAS la piste source (possédée par audioEngine).
          room.localParticipant.unpublishTrack(localTrack || publication, false);
        }
      } catch {}
    }
    publication = null;
    localTrack = null;
    isPublished = false;
    trackSid = null;

    if (room && typeof room.disconnect === 'function') {
      try { await room.disconnect(); } catch {}
    }
    detachRoomListeners();
    room = null;
    isConnected = false;
    participantSid = null;
  }

  function wireRoomEvents() {
    if (!room || typeof room.on !== 'function') return;
    room.on(EVT_RECONNECTING, () => {
      reconnectCount++;
      setState('reconnecting');
    });
    room.on(EVT_RECONNECTED, () => {
      // On ne republie PAS automatiquement : on vérifie l'état de la piste.
      const stillLive = mediaTrack && mediaTrack.readyState === 'live' && isPublished;
      setState(stillLive ? 'live' : 'connected');
    });
    room.on(EVT_DISCONNECTED, () => {
      if (userStopped) return; // arrêt volontaire : stop() gère la transition.
      isConnected = false;
      isPublished = false;
      trackSid = null;
      publication = null;
      // Déconnexion involontaire -> erreur (la piste source reste intacte).
      setError(PUBLISHER_ERRORS.disconnected, 'Connexion LiveKit perdue.');
    });
  }

  async function connect({ outputStream } = {}) {
    if (destroyed) throw err(PUBLISHER_ERRORS.failed, 'Publisher détruit.');
    if (ACTIVE.has(state)) throw err(PUBLISHER_ERRORS.busy, 'Publisher déjà actif.');

    // 1. vérifier outputStream + piste audio live.
    const track = resolveMediaTrack(outputStream);
    if (!outputStream) { setError(PUBLISHER_ERRORS.no_output_stream, 'outputStream absent.'); throw err(PUBLISHER_ERRORS.no_output_stream, 'outputStream absent.'); }
    if (!track) { setError(PUBLISHER_ERRORS.no_audio_track, 'Aucune piste audio live.'); throw err(PUBLISHER_ERRORS.no_audio_track, 'Aucune piste audio live.'); }
    mediaTrack = track;
    userStopped = false;
    lastError = null;

    // 2. demander le token. Lot 4F.1 : auth performer via cookie de session
    //    (same-origin) — aucun mot de passe transmis ici.
    setState('requesting_token');
    let tokenRes;
    try {
      tokenRes = await tokenClient.requestLiveKitToken({ role: 'performer' });
    } catch (e) {
      setError(PUBLISHER_ERRORS.token, 'Échec obtention token.', e);
      throw err(PUBLISHER_ERRORS.token, 'Échec obtention token.', e);
    }
    identity = tokenRes.identity;
    roomName = tokenRes.room;

    // 3. créer Room + connecter.
    setState('connecting');
    try {
      room = new RoomClass(roomOptions);
      wireRoomEvents();
      await room.connect(tokenRes.url, tokenRes.token);
      isConnected = true;
      participantSid = (room.localParticipant && room.localParticipant.sid) || null;
      connectedAt = now();
      setState('connected');
    } catch (e) {
      await cleanup();
      setError(PUBLISHER_ERRORS.connect, 'Échec connexion Room.', e);
      throw err(PUBLISHER_ERRORS.connect, 'Échec connexion Room.', e);
    }

    // 4. créer LocalAudioTrack + publier.
    await publish();

    // 5. live.
    liveSince = now();
    setState('live');
    return getSnapshot();
  }

  async function publish() {
    if (destroyed) throw err(PUBLISHER_ERRORS.failed, 'Publisher détruit.');
    if (!room || !isConnected) throw err(PUBLISHER_ERRORS.connect, 'Room non connectée.');
    if (isPublished || localTrack) throw err(PUBLISHER_ERRORS.busy, 'Piste déjà publiée.');
    if (!mediaTrack || mediaTrack.readyState !== 'live') {
      setError(PUBLISHER_ERRORS.track_ended, 'Piste audio source non live.');
      throw err(PUBLISHER_ERRORS.track_ended, 'Piste audio source non live.');
    }

    setState('publishing');
    try {
      // LocalAudioTrack wrap la piste du graphe Web Audio (pas de nouveau getUserMedia).
      localTrack = new LocalAudioTrackClass(mediaTrack, { name: trackName, source: trackSource });
      publication = await room.localParticipant.publishTrack(localTrack, publishOptions);
      trackSid = (publication && (publication.trackSid || (publication.track && publication.track.sid))) || (localTrack && localTrack.sid) || null;
      isPublished = true;
    } catch (e) {
      await cleanup();
      setError(PUBLISHER_ERRORS.publish, 'Échec publication piste.', e);
      throw err(PUBLISHER_ERRORS.publish, 'Échec publication piste.', e);
    }
    return getSnapshot();
  }

  // Arrêt public, idempotent. Ne stoppe PAS la piste source (audioEngine la possède).
  async function stop() {
    if (state === 'stopped' || state === 'idle') return;
    if (state === 'stopping') return;
    setState('stopping');
    userStopped = true;
    await cleanup();
    identity = null;
    roomName = null;
    connectedAt = null;
    liveSince = null;
    mediaTrack = null;
    setState('stopped');
  }

  function disconnect() {
    return stop();
  }

  async function destroy() {
    if (destroyed) return;
    destroyed = true;
    await stop();
    listeners.clear();
    detachRoomListeners();
  }

  function getSnapshot() {
    return {
      state,
      roomName,
      identity,
      participantSid,
      trackSid,
      connected: isConnected,
      published: isPublished,
      reconnectCount,
      lastError: lastError ? { code: lastError.code, message: lastError.message } : null,
      connectedAt,
      liveSince,
    };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    connect,
    publish,
    stop,
    disconnect,
    destroy,
    getSnapshot,
    subscribe,
    getState: () => state,
  };
}

export { GAIN_DEFAULT };