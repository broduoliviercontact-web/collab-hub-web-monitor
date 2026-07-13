// Shared test fakes for the clock concern — extracted from the former monolithic runTests.mjs.
// Used by >=2 domain suites (see issue #11). No tests live here.

export function makeClock(start) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}
