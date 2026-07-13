// Shared test fakes for the dom concern — extracted from the former monolithic runTests.mjs.
// Used by >=2 domain suites (see issue #11). No tests live here.

export function fakeEl() {
  const set = new Set();
  return {
    textContent: '',
    hidden: false,
    _attrs: {},
    classList: { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    offsetWidth: 0,
  };
}

export function fakeEls() {
  return {
    title: fakeEl(), author: fakeEl(), subtitle: fakeEl(),
    description: fakeEl(), linkWrap: fakeEl(), link: fakeEl(),
  };
}

export function fakeDomEl({ checked = false } = {}) {
  const handlers = {};
  return {
    textContent: '', hidden: false, checked, disabled: false,
    className: '', value: '', _attrs: {}, _parent: null,
    classList: { add(c) { this._c = c; }, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    appendChild(c) { if (c && typeof c === 'object') c._parent = this; return c; },
    append(...cs) { cs.forEach((c) => { if (c && typeof c === 'object') c._parent = this; }); },
    replaceChildren(...cs) { cs.forEach((c) => { if (c && typeof c === 'object') c._parent = this; }); },
    addEventListener(ev, cb) { (handlers[ev] = handlers[ev] || []).push(cb); },
    removeEventListener() {},
    _fire(ev, ...args) { (handlers[ev] || []).forEach((cb) => cb(...args)); },
    _handlers: handlers,
  };
}

export function fakeDocument() {
  const cache = new Map();
  const created = [];
  const doc = {
    createElement(tag) {
      const e = fakeDomEl();
      e.tagName = tag.toUpperCase();
      e._tag = tag;
      created.push(e);
      return e;
    },
  };
  doc.querySelector = (sel) => {
    const id = sel.replace(/^#/, '');
    if (!cache.has(id)) cache.set(id, fakeDomEl());
    return cache.get(id);
  };
  doc._created = created;
  return doc;
}
