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
  // Hotfix multi-listener / iOS : ces événements permettent de réagir à une
  // publication distante (track pas encore souscrite) et de re-réconcilier
  // après un changement de statut de souscription ou une reconnexion.
  TrackPublished: 'trackPublished',
  TrackSubscriptionStatusChanged: 'trackSubscriptionStatusChanged',
  AudioPlaybackStatusChanged: 'audioPlaybackStatusChanged',
};
const DEFAULT_TRACK_KINDS = { audio: 'audio', video: 'video' };

// Retry borné après connect() : rattrape les publications qui arrivent
// légèrement après la connexion (race multi-listener). Pas de polling infini.
const DEFAULT_RETRY_DELAYS = [100, 300, 750];

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

// Scanne les participants distants et leurs publications audio. PUR (lit room,
// aucun effet de bord, aucune dépendance à l'état du moteur) -> testable
// isolément. Retourne { participants, audioPubs } où audioPubs = [{ pub,
// participant }]. Gère Map (livekit-client) et objet plat (tests).
export function scanRemoteAudio(room, trackKinds = DEFAULT_TRACK_KINDS) {
  if (!room || !room.remoteParticipants) return { participants: [], audioPubs: [] };
  const participants = [];
  const audioPubs = [];
  const iterP = typeof room.remoteParticipants.values === 'function'
    ? room.remoteParticipants.values()
    : Object.values(room.remoteParticipants);
  for (const participant of iterP) {
    if (!participant) continue;
    participants.push(participant);
    if (!participant.trackPublications) continue;
    const pubs = participant.trackPublications;
    const iterPub = typeof pubs.values === 'function' ? pubs.values() : Object.values(pubs);
    for (const pub of iterPub) {
      if (pub && pub.kind === trackKinds.audio) audioPubs.push({ pub, participant });
    }
  }
  return { participants, audioPubs };
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
  // Hotfix : retry borné après connect() (100/300/750 ms). [] -> désactivé.
  retryDelays = DEFAULT_RETRY_DELAYS,
  // Timers injectables pour tester le retry sans attendre réellement.
  timerImpl = (typeof setTimeout === 'function' ? { setTimeout, clearTimeout } : null),
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

  // Hotfix multi-listener / iOS : diagnostic + réconciliation.
  let audioUnlocked = false;            // room.startAudio() a réussi (geste utilisateur)
  let reconciliationCount = 0;           // nb d'appels à reconcileRemoteParticipants()
  let existingParticipants = 0;         // participants présents au dernier scan
  let existingAudioPublications = 0;    // pubs audio au dernier scan
  let subscribedAudioPublications = 0;  // nb cumulé de setSubscribed(true) explicites
  let lastTrackEvent = null;            // 'subscribed' | 'published' | 'reconciled' | 'unsubscribed'
  let lastTrackPublishedAt = null;      // epoch ms
  let lastTrackSubscribedAt = null;     // epoch ms
  const requestedSubscriptions = new Set(); // pubs déjà demandées en souscription (anti-spam)
  const retryTimers = [];               // timers du retry borné (à clearer sur stop/destroy)

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
    // Hotfix : on n'exige PLUS isConnected — un TrackSubscribed peut être émis
    // PENDANT room.connect() (avant que isConnected ne passe à true). On accepte
    // la piste dès que la Room courante existe et qu'aucun arrêt n'est demandé.
    // Idempotent : selectProgramTrack ignore la piste déjà courante.
    if (destroyed || !room || userStopped) return;
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
    lastTrackEvent = 'subscribed';
    lastTrackSubscribedAt = now();
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
    lastTrackEvent = 'unsubscribed';
    if (isConnected && !userStopped && state !== 'stopping') {
      setState('waiting_for_track'); // en attente du prochain direct
    }
  }

  // Hotfix : réconciliation complète après connect() / ParticipantConnected /
  // TrackPublished / Reconnected. Recalcule participantCount depuis les
  // participants réellement présents (pas seulement ParticipantConnected),
  // rattache toute piste déjà souscrite (pub.track non null), et demande
  // explicitement la souscription d'une publication audio dont la piste n'est
  // pas encore disponible (track === null). Idempotent. Priorise program-audio.
  function reconcileRemoteParticipants() {
    if (!room || destroyed) return;
    reconciliationCount++;
    const { participants, audioPubs } = scanRemoteAudio(room, trackKinds);
    existingParticipants = participants.length;
    existingAudioPublications = audioPubs.length;
    participantCount = participants.length;
    // Priorité program-audio : on traite d'abord les pubs nommées, puis les
    // autres (selectProgramTrack remplacera une piste non-program par une
    // program si elle arrive ensuite).
    const program = audioPubs.filter(({ pub }) => pub.name === trackName);
    const others = audioPubs.filter(({ pub }) => pub.name !== trackName);
    for (const { pub, participant } of [...program, ...others]) {
      if (pub.track) {
        // Piste déjà souscrite -> on l'attache (idempotent via selectProgramTrack).
        lastTrackEvent = 'reconciled';
        onTrackSubscribed(pub.track, pub, participant);
      } else if (typeof pub.setSubscribed === 'function' && !requestedSubscriptions.has(pub)) {
        // Publication audio sans piste (souscription pas encore établie) -> on
        // demande explicitement la souscription. TrackSubscribed arrivera
        // ensuite (et est désormais accepté même si on n'est pas encore
        // isConnected, ou après réconciliation).
        try { pub.setSubscribed(true); } catch {}
        requestedSubscriptions.add(pub);
        subscribedAudioPublications++;
        notify();
      }
    }
  }

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
      room.off(E.TrackPublished);
      room.off(E.TrackSubscriptionStatusChanged);
      room.off(E.AudioPlaybackStatusChanged);
    } catch {}
    try { if (typeof room.removeAllListeners === 'function') room.removeAllListeners(); } catch {}
  }

  function wireRoomEvents() {
    if (!room || typeof room.on !== 'function') return;
    const E = roomEvents;
    room.on(E.TrackSubscribed, onTrackSubscribed);
    room.on(E.TrackUnsubscribed, onTrackUnsubscribed);
    // Hotfix : ParticipantConnected/Disconnected -> réconciliation (recompte
    // les participants depuis remoteParticipants et re-scane les pistes).
    room.on(E.ParticipantConnected, () => { reconcileRemoteParticipants(); });
    room.on(E.ParticipantDisconnected, () => { reconcileRemoteParticipants(); });
    room.on(E.Reconnecting, () => {
      reconnectCount++;
      setState('reconnecting');
    });
    room.on(E.Reconnected, () => {
      // Re-réconcilie après reconnexion (les pistes distantes peuvent avoir
      // été republiées) avant de restaurer l'état de lecture.
      reconcileRemoteParticipants();
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
    // Hotfix : un participant publie une piste (pas encore souscrite) ->
    // on réconcilie pour demander la souscription explicite.
    if (E.TrackPublished) {
      room.on(E.TrackPublished, () => {
        lastTrackEvent = 'published';
        lastTrackPublishedAt = now();
        reconcileRemoteParticipants();
      });
    }
    // Changement de statut de souscription (piste qui devient disponible) ->
    // re-réconcilie pour attacher la piste désormais souscrite.
    if (E.TrackSubscriptionStatusChanged) {
      room.on(E.TrackSubscriptionStatusChanged, () => { reconcileRemoteParticipants(); });
    }
    // Statut de lecture audio (utile au diagnostic iOS/Safari). Non structurant.
    if (E.AudioPlaybackStatusChanged) {
      room.on(E.AudioPlaybackStatusChanged, () => { notify(); });
    }
  }

  function clearRetryTimers() {
    if (!timerImpl || typeof timerImpl.clearTimeout !== 'function') return;
    while (retryTimers.length) {
      try { timerImpl.clearTimeout(retryTimers.pop()); } catch {}
    }
  }

  async function cleanup() {
    clearRetryTimers();
    if (audioSink) { try { audioSink.pause(); } catch {} }
    detachCurrentTrack();
    if (room && typeof room.disconnect === 'function') {
      try { await room.disconnect(); } catch {}
    }
    detachRoomListeners();
    room = null;
    isConnected = false;
    participantCount = 0;
    audioUnlocked = false;
    requestedSubscriptions.clear();
  }

  async function connect() {
    if (destroyed) throw err(LISTENER_ERRORS.failed, 'Listener détruit.');
    if (ACTIVE.has(state)) throw err(LISTENER_ERRORS.busy, 'Listener déjà actif.');

    userStopped = false;
    lastError = null;
    autoplayBlocked = false;
    wasPlaying = false;
    audioUnlocked = false;
    requestedSubscriptions.clear();

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
      // Ne régresse pas un état déjà avancé par une piste reçue PENDANT
      // room.connect() (TrackSubscribed émis avant la résolution -> attemptPlay
      // peut déjà avoir mis 'playing'/'waiting_for_user'). On ne passe à
      // 'connected' que si on est encore en phase de connexion.
      if (state === 'connecting') setState('connected');
    } catch (e) {
      await cleanup();
      setError(LISTENER_ERRORS.connect, 'Échec connexion Room.', e);
      throw err(LISTENER_ERRORS.connect, 'Échec connexion Room.', e);
    }

    // 3. iOS / Safari : démarrer la lecture audio côté Room dans le geste
    //    utilisateur courant (le clic "ÉCOUTER LE DIRECT" a déclenché connect()).
    //    room.startAudio() est requis sur iOS pour activer la sortie audio ; on
    //    l'appelle au plus tôt (best-effort, non fatal). Si le geste a expiré
    //    pendant la négociation token/Room, audioUnlocked reste false et un
    //    second geste (startAudio / bouton ACTIVER LE SON) le fera.
    if (room && typeof room.startAudio === 'function') {
      try { await room.startAudio(); audioUnlocked = true; } catch { audioUnlocked = false; }
    }

    // 4. réconciliation complète des participants/pistes déjà présents avant
    //    que TrackSubscribed ne soit (éventuellement) émis (race multi-listener
    //    : un performer déjà en train de diffuser quand un 2e listener rejoint,
    //    ou une publication audio pas encore souscrite -> setSubscribed(true)).
    reconcileRemoteParticipants();
    if (!currentTrack) setState('waiting_for_track');

    // 5. retry borné : rattrape une publication arrivant légèrement après
    //    connect() (sans polling infini). Idempotent via selectProgramTrack.
    scheduleReconcileRetry();
    return getSnapshot();
  }

  // Retry borné (défaut 100/300/750 ms) après connect(). Chaque tick appelle
  // reconcileRemoteParticipants (idempotent). Pas de polling infini.
  function scheduleReconcileRetry() {
    if (!timerImpl || typeof timerImpl.setTimeout !== 'function') return;
    for (const delay of retryDelays) {
      try {
        const id = timerImpl.setTimeout(() => {
          if (!destroyed && !userStopped && room) reconcileRemoteParticipants();
        }, delay);
        retryTimers.push(id);
      } catch {}
    }
  }

  // Lecture après geste utilisateur (débloque l'autoplay). iOS/Safari : on
  // appelle d'abord room.startAudio() DANS le geste, puis audioSink.play(). Si
  // aucune piste n'est encore disponible, on mémorise le déblocage
  // (audioUnlocked=true) ; play() sera relancé à l'arrivée de la piste
  // (onTrackSubscribed -> attemptPlay). Non fatal en cas d'échec.
  async function startAudio() {
    if (destroyed || userStopped) return getSnapshot();
    if (room && typeof room.startAudio === 'function') {
      try { await room.startAudio(); audioUnlocked = true; }
      catch { audioUnlocked = false; }
    } else {
      // Pas de room.startAudio() (tests / SDK sans la méthode) : rien à débloquer.
      audioUnlocked = true;
    }
    if (!currentTrack || !audioSink) {
      // Piste pas encore là : on mémorise le déblocage ; la lecture partira à
      // l'arrivée de la piste. On ne change pas l'état ici.
      notify();
      return getSnapshot();
    }
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
      audioUnlocked,
      roomCanPlaybackAudio: !!(room && typeof room.startAudio === 'function'),
      existingParticipants,
      existingAudioPublications,
      subscribedAudioPublications,
      reconciliationCount,
      lastTrackEvent,
      lastTrackPublishedAt,
      lastTrackSubscribedAt,
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

export { DEFAULT_ROOM_EVENTS, DEFAULT_TRACK_KINDS, DEFAULT_RETRY_DELAYS };