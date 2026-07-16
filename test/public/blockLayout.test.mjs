import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlockLayoutRuntime, parseBlockModes, parseBlockOrder, parseBlockVisibility, parseDrawingAlign, parseDrawingPreset,
} from '../../src/public/publicBlockLayoutRuntime.js';

function makeEl(id = '') {
  const classes = new Set();
  return {
    id,
    textContent: '',
    hidden: false,
    _attrs: {},
    classList: {
      add(name) { classes.add(name); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
    },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k]; },
    replaceChildren(...children) { this._children = children; this.textContent = children.map((child) => child.textContent || '').join(''); },
    appendChild(child) { this._child = child; return child; },
  };
}

function makeRuntime() {
  const sections = {
    info3Section: makeEl('info3Section'),
    subtitleSection: makeEl('subtitleSection'),
    descriptionSection: makeEl('descriptionSection'),
    showNameSection: makeEl('showNameSection'),
    titleSection: makeEl('titleSection'),
    authorSection: makeEl('authorSection'),
    imageWrap: makeEl('imageWrap'),
    image2Wrap: makeEl('image2Wrap'),
  };
  const els = {
    ...sections,
    card: {
      _placements: [],
      appendChild(child) { this._placements.push(child.id); return child; },
    },
    info3: makeEl('info3'),
    subtitle: makeEl('subtitle'),
    description: makeEl('description'),
    showName: makeEl('showName'),
    title: makeEl('title'),
    author: makeEl('author'),
    image: makeEl('image'),
    image2: makeEl('image2'),
  };
  const doc = {
    createElement: (tag) => {
      const el = makeEl(tag);
      el.tagName = tag.toUpperCase();
      return el;
    },
    createTextNode: (text) => ({ textContent: text }),
  };
  return { runtime: createBlockLayoutRuntime({ els, doc }), els, sections };
}

test('parseBlockVisibility accepte exactement 8 booléens 0/1', () => {
  assert.deepEqual(parseBlockVisibility(['1 1 0 1 0 0 1 1']), [true, true, false, true, false, false, true, true]);
  assert.deepEqual(parseBlockVisibility([1, 0, 1, 0, 1, 0, 1, 0]), [true, false, true, false, true, false, true, false]);
  assert.equal(parseBlockVisibility(['1 0 1']), null);
  assert.equal(parseBlockVisibility(['1 0 oui 0 1 0 1 0']), null);
});

test('parseBlockOrder exige une permutation exacte de 0 à 7', () => {
  assert.deepEqual(parseBlockOrder(['4 5 0 1 2 3 6 7']), [4, 5, 0, 1, 2, 3, 6, 7]);
  assert.equal(parseBlockOrder(['0 1 2 3 4 5 6 6']), null);
  assert.equal(parseBlockOrder(['0 1 2 3 4 5 6 8']), null);
});

test('parseBlockModes accepte exactement 8 modes content/drawing', () => {
  assert.deepEqual(parseBlockModes(['content drawing content content content content content drawing']), [
    'content', 'drawing', 'content', 'content', 'content', 'content', 'content', 'drawing',
  ]);
  assert.equal(parseBlockModes(['drawing drawing']), null);
  assert.equal(parseBlockModes(['content image content content content content content content']), null);
});

test('parseDrawingPreset et parseDrawingAlign valident les valeurs fermées', () => {
  assert.equal(parseDrawingPreset(['crosshair']), 'crosshair');
  assert.equal(parseDrawingPreset(['bars']), 'bars');
  assert.equal(parseDrawingPreset(['spiral']), null);
  assert.equal(parseDrawingAlign(['left']), 'left');
  assert.equal(parseDrawingAlign(['center']), 'center');
  assert.equal(parseDrawingAlign(['bottom']), null);
});

test('createBlockLayoutRuntime affiche seulement les blocs visibles avec contenu', () => {
  const { runtime, els } = makeRuntime();
  assert.deepEqual(runtime.applyControl({ header: 'snd_info_3', values: ['Intro'] }), { handled: true, valid: true, contentChanged: true });
  assert.equal(els.info3.textContent, 'Intro');
  assert.equal(els.info3Section.hidden, false);
  assert.equal(els.titleSection.hidden, true, 'un bloc sans contenu reste masqué même si visible=true');

  assert.deepEqual(runtime.applyControl({ header: 'visibility', values: ['0 0 0 0 0 0 0 0'] }), { handled: true, valid: true, contentChanged: false });
  assert.equal(els.info3Section.hidden, true);

  assert.deepEqual(runtime.applyControl({ header: 'visibility', values: ['1 0 0 0 0 0 0 0'] }), { handled: true, valid: true, contentChanged: false });
  assert.equal(els.info3Section.hidden, false);
});

test('createBlockLayoutRuntime applique order atomiquement et ignore les ordres invalides', () => {
  const { runtime, els } = makeRuntime();
  runtime.applyControl({ header: 'snd_title', values: ['Titre'] });
  const result = runtime.applyControl({ header: 'order', values: ['4 3 5 0 1 2 6 7'] });
  assert.deepEqual(result, { handled: true, valid: true, contentChanged: false });
  assert.deepEqual(els.card._placements.slice(-8), [
    'titleSection', 'showNameSection', 'authorSection', 'info3Section',
    'subtitleSection', 'descriptionSection', 'imageWrap', 'image2Wrap',
  ]);

  const before = els.card._placements.length;
  assert.deepEqual(runtime.applyControl({ header: 'order', values: ['4 3 5 0 1 2 6 6'] }), {
    handled: true, valid: false, reason: 'order_invalide',
  });
  assert.equal(els.card._placements.length, before);
});

test('createBlockLayoutRuntime affiche un canvas 128x128 en mode drawing', () => {
  const { runtime, els, sections } = makeRuntime();
  const result = runtime.applyControl({ header: 'mode', values: ['drawing content content content content content content content'] });
  assert.deepEqual(result, { handled: true, valid: true, contentChanged: false });
  assert.equal(sections.info3Section.hidden, false);
  assert.equal(sections.info3Section.classList.contains('block--drawing-mode'), true);
  const snapshot = runtime.snapshot();
  assert.equal(snapshot.modes[0], 'drawing');
  assert.equal(els.info3.hidden, true);
});

test('createBlockLayoutRuntime accepte drawing_preset et drawing_align', () => {
  const { runtime, sections } = makeRuntime();
  runtime.applyControl({ header: 'mode', values: ['drawing content content content content content content content'] });
  assert.deepEqual(runtime.applyControl({ header: 'drawing_preset', values: ['bars'] }), {
    handled: true, valid: true, contentChanged: false,
  });
  assert.deepEqual(runtime.applyControl({ header: 'drawing_align', values: ['center'] }), {
    handled: true, valid: true, contentChanged: false,
  });
  const snapshot = runtime.snapshot();
  assert.equal(snapshot.drawingPreset, 'bars');
  assert.equal(snapshot.drawingAlign, 'center');
  assert.equal(sections.info3Section.classList.contains('block--drawing-align-center'), true);
  const canvas = sections.info3Section._child;
  assert.equal(canvas.getAttribute('data-drawing-align'), 'center');
  assert.match(canvas.getAttribute('style'), /margin-left:auto;margin-right:auto/);

  runtime.applyControl({ header: 'drawing_align', values: ['right'] });
  assert.equal(sections.info3Section.classList.contains('block--drawing-align-center'), false);
  assert.equal(sections.info3Section.classList.contains('block--drawing-align-right'), true);
  assert.equal(canvas.getAttribute('data-drawing-align'), 'right');
  assert.match(canvas.getAttribute('style'), /margin-left:auto;margin-right:0/);

  runtime.applyControl({ header: 'drawing_align', values: ['left'] });
  assert.equal(sections.info3Section.classList.contains('block--drawing-align-right'), false);
  assert.equal(sections.info3Section.classList.contains('block--drawing-align-left'), true);
  assert.equal(canvas.getAttribute('data-drawing-align'), 'left');
  assert.match(canvas.getAttribute('style'), /margin-left:0;margin-right:auto/);
});
