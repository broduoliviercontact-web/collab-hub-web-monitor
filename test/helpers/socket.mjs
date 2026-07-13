// Shared test fakes for the socket concern — extracted from the former monolithic runTests.mjs.
// Used by >=2 domain suites (see issue #11). No tests live here.

export function fakeSocket() {
  const handlers = {};
  return {
    on(evt, fn) { (handlers[evt] ||= []).push(fn); },
    emit() {},
    fire(evt, ...args) { (handlers[evt] || []).forEach((fn) => fn(...args)); },
    listenerCount(evt) { return (handlers[evt] || []).length; },
  };
}
