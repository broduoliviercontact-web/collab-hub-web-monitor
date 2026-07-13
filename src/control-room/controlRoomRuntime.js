// Runtime audio local + publication LiveKit (issue #8). Extrait de
// mountControlRoom(). Construit le moteur audio (audioEngine), le publisher
// LiveKit (piste `program-audio`, options stéréo haute qualité figées) et le
// contrôleur qui les lie. Les factories sont injectables (défaut = implémentations
// réelles) pour les tests de caractérisation — aucun effet en production.
//
// Contrat figé (issue #8) : ne pas changer AudioContext, la destination
// MediaStream, ni la piste `program-audio`. Les options passées à
// createLiveKitPublisher sont recopiées verbatim de l'ancien mountControlRoom().

import { createAudioEngine } from '../audio/audioEngine.js';
import { createLiveKitPublisher } from '../audio/livekitPublisher.js';
import { requestLiveKitToken } from '../livekit/tokenClient.js';
import { Room, LocalAudioTrack, Track, AudioPresets } from '../livekit/livekitBrowser.js';
import { createControlRoomController } from './controlRoomController.js';

// Publisher LiveKit réel : piste program-audio, stéréo haute qualité, DTX off.
// Recopié verbatim de l'ancien mountControlRoom() (lot 4E) — audio-graph figé.
function defaultPublisherFactory() {
  return createLiveKitPublisher({
    tokenClient: { requestLiveKitToken },
    RoomClass: Room,
    LocalAudioTrackClass: LocalAudioTrack,
    trackSource: Track.Source.Microphone,
    publishOptions: { dtx: false, forceStereo: true, audioPreset: AudioPresets.musicHighQualityStereo },
    trackName: 'program-audio',
    roomOptions: {},
  });
}

export function createControlRoomRuntime({
  audioEngineFactory = createAudioEngine,
  publisherFactory = defaultPublisherFactory,
  controllerFactory = createControlRoomController,
} = {}) {
  const audioEngine = audioEngineFactory();
  const publisher = publisherFactory();
  const controller = controllerFactory({ audioEngine, publisher });
  return { audioEngine, publisher, controller };
}