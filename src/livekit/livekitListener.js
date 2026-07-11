// Moteur listener LiveKit (Lot 4D). Rejoint la room "main" en rôle listener,
// s'abonne à UNE piste audio distante (program-audio prioritaire), gère le
// volume/mute, l'autoplay, la reconnexion native et l'arrêt. Aucune publication.
//
// Entièrement injectable (tokenClient, RoomClass, roomEvents, trackKinds,
// audioSink, now) -> testable en Node sans livekit-client, sans navigateur,
// sans vrai LiveKit, sans micro. Ne dépend PAS du DOM : l'audioSink (adaptateur
// DOM, src/listener/listenerAudioElement.js) est injecté par l'orchestrateur.
//
// Aucune référence LiveKit codée en dur : RoomClass + roomEvents (valeurs string
// de RoomEvent) + trackKinds (Track.Kind) sont injectés par l'appelant via
// src/livekit/livekitBrowser.js. Aucun import de livekit-client ici.

// Valeurs string de RoomEvent (livekit-client) — par défaut pour usage navigateur.
// Injectables en tests via roomEvents.
const DEFAULT_ROOM_EVENTS = {
  TrackSubscribed: 'trackSubscribed',
  TrackUnsubscribed: 'trackUnsubscribed',
  ParticipantConnected: 'participantConnected',
  ParticipantDisconnected: 'participantDisconnected',
  Reconnecting: 'reconnecting',
  Reconnected: 'reconnected',
  Disconnected: 'disconnected',
};
const DEFAULT_TRACK_KINDS = { audio: 'audio', video: 'video' };

// États actifs : connect() refuse si l'un d'eux est courant (pas de double
// connexion). error/stopped/idle permettent un retry (connect).
const ACTIVE = new Set([
  'requesting_token', 'connecting', 'connected', 'waiting_for_track',
  'track_available', 'waiting_for_user', 'playing', 'reconnecting',
]);

export const LISTENER_ERRORS = {
  busy: 'listener_busy',
  token: 'token_failed',
  connect: 'connect_failed',
  disconnected: 'disconnected',
  failed: 'listener_failed',
};

export const DEFAULT_VOLUME = 0.8;

// Atténuation -20 dB du listener (Lot 4F.1) : gain linéaire = 10^(-20/20) = 0.1.
// effectiveVolume = userVolume * 0.1 quand actif. Le slider reste le volume
// utilisateur ; l'atténuation est un multiplicateur appliqué à l'audioSink.
export const ATTENUATION_DB = -20;
export const ATTENUATION_GAIN = 0.1;

function err(code, message, cause) {
  return { code, message, cause: cause?.code || cause?.name || undefined };
}

function clamp01(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function createLiveKitListener({
  tokenClient,
  RoomClass,
  roomEvents = DEFAULT_ROOM_EVENTS,
  trackKinds = DEFAULT_TRACK_KINDS,
  audioSink = null,
  roomOptions = {},
  trackName = 'program-audio',
  initialVolume = DEFAULT_VOLUME,
  now = Date.now,
} = {}) {
  let state = 'idle';
  let lastError = null;

  let room = null;
  let currentTrack = null;     // RemoteAudioTrack DISTANTE (on ne possède que l'abonnement)
  let identity = null;
  let roomName = null;
  let audioTrackSid = null;
  let performerIdentity = null;

  let isConnected = false;
  let userStopped = false;
  let wasPlaying = false;       // mémorise playing pour la reconnexion
  let autoplayBlocked = false;
  let participantCount = 0;
  let reconnectCount = 0;

  let volume = clamp01(initialVolume);
  let muted = false;
  let attenuationActive = false; // Lot 4F.1 : -20 dB

  let connectedAt = null;
  let playingSince = null;

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

  // Volume effectif appliqué à l'audioSink : mute prioritaire, puis atténuation
  // -20 dB (×0.1) si active, sinon volume utilisateur. Le mute silence totalement
  // (prioritaire sur l'atténuation) ; l'unmute restaure le volume effectif atténué.
  function effectiveVolume() {
    if (muted) return 0;
    return attenuationActive ? volume * ATTENUATION_GAIN : volume;
  }

  function applyVolumeMuted() {
    if (!audioSink) return;
    try { audioSink.setVolume(effectiveVolume()); } catch {}
    try { audioSink.setMuted(muted); } catch {}
  }

  // Choisit la piste programme pertinente. Priorise trackName === "program-audio",
  // sinon la première piste audio distante. Ignore la vidéo. Renvoie la piste à
  // conserver, ou null. Ne joue JAMAIS plusieurs pistes programme simultanément.
  function selectProgramTrack(track) {
    if (!track || track.kind !== trackKinds.audio) return null;
    if (!currentTrack) return track;
    // Une piste est déjà active : on ne la remplace QUE par une piste nommée
    // program-audio si la courante ne l'est pas.
    const currentIsProgram = currentTrack.name === trackName;
    const newIsProgram = track.name === trackName;
    if (newIsProgram && !currentIsProgram) return track; // remplacement
    return null; // sinon on ignore la nouvelle (pas de multi-pistes)
  }

  // Tente la lecture via l'audioSink. NotAllowedError -> autoplay bloqué (non
  // fatal) -> waiting_for_user. Autre rejet -> track_available (retry possible).
  async function attemptPlay() {
    if (!audioSink || !currentTrack) return;
    try {
      await audioSink.play();
      autoplayBlocked = false;
      wasPlaying = true;
      playingSince = now();
      setState('playing');
    } catch (e) {
      if (e && e.name === 'NotAllowedError') {
        autoplayBlocked = true;
        wasPlaying = false;
        setState('waiting_for_user');
      } else {
        // Échec non-autoplay : la piste reste disponible, l'utilisateur peut
        // réessayer via startAudio(). Non fatal.
        autoplayBlocked = false;
        setState('track_available');
      }
    }
  }

  function detachCurrentTrack() {
    if (currentTrack && audioSink) {
      try { audioSink.detachTrack(); } catch {}
    }
    currentTrack = null;
    audioTrackSid = null;
    performerIdentity = null;
    wasPlaying = false;
  }

  function onTrackSubscribed(track, _publication, participant) {
    if (destroyed || !isConnected) return;
    if (!track || track.kind !== trackKinds.audio) return; // ignore la vidéo
    const chosen = selectProgramTrack(track);
    if (!chosen) return;
    if (chosen !== currentTrack && currentTrack) {
      // remplacement : détache l'ancienne d'abord.
      try { audioSink && audioSink.detachTrack(); } catch {}
      currentTrack = null;
    }
    currentTrack = chosen;
    audioTrackSid = chosen.sid || null;
    performerIdentity = (participant && participant.identity) || null;
    if (audioSink) {
      try { audioSink.attachTrack(chosen); } catch {}
      applyVolumeMuted();
    }
    notify();
    // Tente la lecture immédiatement (le geste utilisateur de connexion peut
    // encore être valide ; sinon le navigateur bloquera -> waiting_for_user).
    attemptPlay();
  }

  function onTrackUnsubscribed(track) {
    if (!track) return;
    if (track !== currentTrack) return; // une piste qu'on avait ignorée
    detachCurrentTrack();
    if (isConnected && !userStopped && state !== 'stopping') {
      setState('waiting_for_track'); // en attente du prochain direct
    }
  }

  function onParticipantConnected() { participantCount++; notify(); }
  function onParticipantDisconnected() { if (participantCount > 0) participantCount--; notify(); }

  function detachRoomListeners() {
    if (!room || typeof room.off !== 'function') return;
    const E = roomEvents;
    try {
      room.off(E.TrackSubscribed);
      room.off(E.TrackUnsubscribed);
      room.off(E.ParticipantConnected);
      room.off(E.ParticipantDisconnected);
      room.off(E.Reconnecting);
      room.off(E.Reconnected);
      room.off(E.Disconnected);
    } catch {}
    try { if (typeof room.removeAllListeners === 'function') room.removeAllListeners(); } catch {}
  }

  function wireRoomEvents() {
    if (!room || typeof room.on !== 'function') return;
    const E = roomEvents;
    room.on(E.TrackSubscribed, onTrackSubscribed);
    room.on(E.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(E.ParticipantConnected, onParticipantConnected);
    room.on(E.ParticipantDisconnected, onParticipantDisconnected);
    room.on(E.Reconnecting, () => {
      reconnectCount++;
      setState('reconnecting');
    });
    room.on(E.Reconnected, () => {
      if (currentTrack) {
        setState(wasPlaying ? 'playing' : 'waiting_for_user');
      } else {
        setState('waiting_for_track');
      }
    });
    room.on(E.Disconnected, () => {
      if (userStopped) return; // arrêt volontaire : stop() gère la transition.
      isConnected = false;
      detachCurrentTrack();
      setError(LISTENER_ERRORS.disconnected, 'Connexion LiveKit perdue.');
    });
  }

  async function cleanup() {
    if (audioSink) { try { audioSink.pause(); } catch {} }
    detachCurrentTrack();
    if (room && typeof room.disconnect === 'function') {
      try { await room.disconnect(); } catch {}
    }
    detachRoomListeners();
    room = null;
    isConnected = false;
    participantCount = 0;
  }

  async function connect() {
    if (destroyed) throw err(LISTENER_ERRORS.failed, 'Listener détruit.');
    if (ACTIVE.has(state)) throw err(LISTENER_ERRORS.busy, 'Listener déjà actif.');

    userStopped = false;
    lastError = null;
    autoplayBlocked = false;
    wasPlaying = false;

    // 1. token listener (pas de mot de passe).
    setState('requesting_token');
    let tokenRes;
    try {
      tokenRes = await tokenClient.requestLiveKitToken({ role: 'listener' });
    } catch (e) {
      setError(LISTENER_ERRORS.token, 'Échec obtention token.', e);
      throw err(LISTENER_ERRORS.token, 'Échec obtention token.', e);
    }
    identity = tokenRes.identity;
    roomName = tokenRes.room;

    // 2. créer Room + connecter (listeners AVANT connect).
    setState('connecting');
    try {
      room = new RoomClass(roomOptions);
      wireRoomEvents();
      await room.connect(tokenRes.url, tokenRes.token);
      isConnected = true;
      connectedAt = now();
      setState('connected');
    } catch (e) {
      await cleanup();
      setError(LISTENER_ERRORS.connect, 'Échec connexion Room.', e);
      throw err(LISTENER_ERRORS.connect, 'Échec connexion Room.', e);
    }

    // 3. attendre une piste distante (le performer peut être absent).
    setState('waiting_for_track');
    return getSnapshot();
  }

  // Lecture après geste utilisateur (débloque l'autoplay). Non fatal si échec.
  async function startAudio() {
    if (!currentTrack || !audioSink) return getSnapshot();
    try {
      await audioSink.play();
      autoplayBlocked = false;
      wasPlaying = true;
      playingSince = now();
      setState('playing');
    } catch (e) {
      if (e && e.name === 'NotAllowedError') {
        autoplayBlocked = true;
        setState('waiting_for_user');
      } else {
        setState('track_available');
      }
    }
    return getSnapshot();
  }

  function setVolume(value) {
    volume = clamp01(value);
    applyVolumeMuted();
    notify();
    return volume;
  }

  function setMuted(value) {
    muted = !!value;
    applyVolumeMuted();
    notify();
    return muted;
  }

  // Lot 4F.1 : atténuation -20 dB (double-clic enceinte / bouton -20 dB).
  function setAttenuation(value) {
    attenuationActive = !!value;
    applyVolumeMuted();
    notify();
    return attenuationActive;
  }
  function toggleAttenuation() { return setAttenuation(!attenuationActive); }

  async function stop() {
    if (state === 'stopped' || state === 'idle') return;
    if (state === 'stopping') return;
    setState('stopping');
    userStopped = true;
    await cleanup();
    identity = null;
    roomName = null;
    connectedAt = null;
    playingSince = null;
    setState('stopped');
  }

  function disconnect() { return stop(); }

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
      connected: isConnected,
      participantCount,
      hasAudioTrack: !!currentTrack,
      audioTrackSid,
      performerIdentity,
      autoplayBlocked,
      volume,
      muted,
      attenuationDb: attenuationActive ? ATTENUATION_DB : 0,
      attenuationActive,
      effectiveVolume: effectiveVolume(),
      reconnectCount,
      connectedAt,
      playingSince,
      lastError: lastError ? { code: lastError.code, message: lastError.message } : null,
    };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    connect,
    startAudio,
    setVolume,
    setMuted,
    setAttenuation,
    toggleAttenuation,
    stop,
    disconnect,
    destroy,
    getSnapshot,
    subscribe,
    getState: () => state,
  };
}

export { DEFAULT_ROOM_EVENTS, DEFAULT_TRACK_KINDS };