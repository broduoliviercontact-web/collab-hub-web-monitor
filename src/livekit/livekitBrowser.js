// Adaptateur LiveKit côté navigateur (Lot 4D). Point d'import UNIQUE de
// livekit-client dans le code navigateur. Importe uniquement ce qui est
// nécessaire : Room, RoomEvent, Track, ConnectionState. Pas de livekit-server-sdk
// (côté serveur uniquement, jamais dans le bundle navigateur).
//
// Impact bundle : Room est le cœur du SDK ; l'importer entraîne le graphe
// livekit-client (≈ poids significatif). Ce module n'est JAMAIS importé
// statiquement par src/main.js : il est chargé via import() dynamique par
// src/listener/listenerSection.js, et seulement si VITE_LIVEKIT_ENABLED=true.
// -> tant que la fonctionnalité est désactivée (défaut production), le chunk
// livekit-client n'est PAS téléchargé par la page publique. Le chunk existe dans
// le build (code-splitting) mais n'est chargé qu'à la demande.
//
// Re-export des valeurs string de RoomEvent / Track.Kind / ConnectionState pour
// injection dans le moteur listener (testable sans livekit-client).

import { Room, RoomEvent, Track, ConnectionState, LocalAudioTrack, AudioPresets } from 'livekit-client';

// roomEvents : valeurs string consommées par le moteur (RoomEvent.X).
export const roomEvents = {
  TrackSubscribed: RoomEvent.TrackSubscribed,
  TrackUnsubscribed: RoomEvent.TrackUnsubscribed,
  ParticipantConnected: RoomEvent.ParticipantConnected,
  ParticipantDisconnected: RoomEvent.ParticipantDisconnected,
  Reconnecting: RoomEvent.Reconnecting,
  Reconnected: RoomEvent.Reconnected,
  Disconnected: RoomEvent.Disconnected,
};

// trackKinds : Track.Kind (audio/video) consommé par le moteur.
export const trackKinds = {
  audio: Track.Kind.Audio,
  video: Track.Kind.Video,
};

export { Room, RoomEvent, Track, ConnectionState, LocalAudioTrack, AudioPresets };