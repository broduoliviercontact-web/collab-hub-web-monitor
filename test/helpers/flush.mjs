// Shared test fakes for the flush concern — extracted from the former monolithic runTests.mjs.
// Used by >=2 domain suites (see issue #11). No tests live here.

export const flush = () => new Promise((r) => setTimeout(r, 0));
