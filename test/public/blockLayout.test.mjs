import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlockLayoutRuntime, parseBlockOrder, parseBlockVisibility,
} from '../../src/public/publicBlockLayoutRuntime.js';

function makeEl(id = '') {
  return {
    id,
    textContent: '',
    hidden: false,
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k]; },
    replaceChildren(...children) { this._children = children; this.textContent = children.map((child) => child.textContent || '').join(''); },
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
