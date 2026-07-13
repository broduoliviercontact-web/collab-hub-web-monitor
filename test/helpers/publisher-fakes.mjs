// Shared test fakes for the publisher-fakes concern — extracted from the former monolithic runTests.mjs.
// Used by >=2 domain suites (see issue #11). No tests live here.

export function makeFakeMediaTrack({ readyState = 'live' } = {}) {
  return { kind: 'audio', readyState, _stopped: false, stop() { this._stopped = true; this.readyState = 'ended'; }, getSettings() { return {}; } };
}

export function makeFakeOutputStream(track) {
  return { getAudioTracks: () => (track ? [track] : []) };
}
