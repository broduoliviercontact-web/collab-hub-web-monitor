// Shared test fakes for the stream-fakes concern — extracted from the former monolithic runTests.mjs.
// Used by >=2 domain suites (see issue #11). No tests live here.

export function makeFakeStreamEmitter() {
  const calls = [];
  return {
    calls,
    publish(header, values) { calls.push({ header, values: Array.isArray(values) ? values.slice() : values }); },
  };
}

export function meterOf(rms, peak) { return { rms, peak, db: rms > 0 ? 20 * Math.log10(rms) : -Infinity, clipping: false }; }
