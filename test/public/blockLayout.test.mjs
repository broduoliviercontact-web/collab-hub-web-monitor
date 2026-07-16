import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlockLayoutRuntime, parseBlockModes, parseBlockVisibility, parseDrawingAlign, parseDrawingPreset,
} from '../../src/public/publicBlockLayoutRuntime.js';
import { parseBlockConfig } from '../../src/public/composableBlockConfig.js';

function makeEl(id = '') {
  const classes = new Set();
  return {
    id,
    textContent: '',
    hidden: false,
    _attrs: {},
    _children: [],
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
    },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k]; },
    replaceChildren(...children) { this._children = children; this.textContent = children.map((child) => child.textContent || '').join(''); },
    appendChild(child) { this._children.push(child); return child; },
  };
}

function makeRuntime() {
  const ids = ['showName', 'title', 'author', 'subtitle', 'description', 'info3', 'info4', 'info5'];
  const sections = Object.fromEntries(ids.map((id) => [`${id}Section`, makeEl(`${id}Section`)]));
  const els = {
    ...sections,
    ...Object.fromEntries(ids.map((id) => [id, makeEl(id)])),
    card: {
      _placements: [],
      appendChild(child) { this._placements.push(child.id); return child; },
    },
  };
  const doc = {
    createElement(tag) {
      const el = makeEl(tag);
      el.tagName = tag.toUpperCase();
      return el;
    },
    createTextNode: (text) => ({ textContent: text }),
  };
  return { runtime: createBlockLayoutRuntime({ els, doc }), els, sections };
}

function childByTag(section, tag) {
  return section._children.find((child) => child.tagName === tag.toUpperCase());
}

test('parseBlockVisibility accepte exactement 8 booléens 0/1', () => {
  assert.deepEqual(parseBlockVisibility(['1 1 0 1 0 0 1 1']), [true, true, false, true, false, false, true, true]);
  assert.equal(parseBlockVisibility(['1 0 1']), null);
  assert.equal(parseBlockVisibility(['1 0 oui 0 1 0 1 0']), null);
});

test('parseBlockModes accepte exactement 8 modes content/drawing', () => {
  assert.deepEqual(parseBlockModes(['content drawing content content content content content drawing']), [
    'content', 'drawing', 'content', 'content', 'content', 'content', 'content', 'drawing',
  ]);
  assert.equal(parseBlockModes(['drawing drawing']), null);
});

test('parseDrawingPreset et parseDrawingAlign valident les valeurs fermées', () => {
  assert.equal(parseDrawingPreset(['bars']), 'bars');
  assert.equal(parseDrawingPreset(['spiral']), null);
  assert.equal(parseDrawingAlign(['center']), 'center');
  assert.equal(parseDrawingAlign(['bottom']), null);
});

test('parseBlockConfig valide le bloc, les enums, dimensions, couleurs et URL', () => {
  assert.deepEqual(parseBlockConfig('snd_show image_position left'), { blockId: 'snd_show', property: 'image_position', value: 'left' });
  assert.deepEqual(parseBlockConfig('snd_info_5 image_width 75%'), { blockId: 'snd_info_5', property: 'image_width', value: '75%' });
  assert.deepEqual(parseBlockConfig('snd_title background_color #1a2b3c'), { blockId: 'snd_title', property: 'background_color', value: '#1a2b3c' });
  assert.equal(parseBlockConfig('snd_img_1 image_url https://example.com/a.png'), null);
  assert.equal(parseBlockConfig('snd_show image_url javascript:alert(1)'), null);
  assert.equal(parseBlockConfig('snd_show image_width 5000px'), null);
  assert.equal(parseBlockConfig('snd_show foreground_color red;display:none'), null);
});

test('runtime applique le registre fixe et ignore order venant de Max', () => {
  const { runtime, els } = makeRuntime();
  runtime.applyControl({ header: 'snd_show', values: 'Émission' });
  assert.deepEqual(els.card._placements, [
    'showNameSection', 'titleSection', 'authorSection', 'subtitleSection',
    'descriptionSection', 'info3Section', 'info4Section', 'info5Section',
  ]);
  assert.deepEqual(runtime.applyControl({ header: 'order', values: '7 6 5 4 3 2 1 0' }), { handled: false });
  assert.deepEqual(runtime.snapshot().order, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('runtime affiche seulement les blocs visibles ayant texte, image ou canvas', () => {
  const { runtime, els } = makeRuntime();
  runtime.applyControl({ header: 'snd_show', values: 'Émission' });
  runtime.applyControl({ header: 'block_config', values: 'snd_info_5 image_url https://example.com/logo.png' });
  assert.equal(els.showNameSection.hidden, false);
  assert.equal(els.info5Section.hidden, false, 'une image seule rend le bloc visible');
  assert.equal(els.titleSection.hidden, true);
  runtime.applyControl({ header: 'visibility', values: '0 0 0 0 0 0 0 1' });
  assert.equal(els.showNameSection.hidden, true);
  assert.equal(els.info5Section.hidden, false);
});

test('block_config compose texte et image dans les cinq positions', () => {
  for (const position of ['above', 'below', 'left', 'right', 'background']) {
    const { runtime, els } = makeRuntime();
    runtime.applyControl({ header: 'block_config', values: 'snd_show text Radio Canvas' });
    runtime.applyControl({ header: 'block_config', values: 'snd_show image_url /images/logo.png' });
    runtime.applyControl({ header: 'block_config', values: `snd_show image_position ${position}` });
    const image = childByTag(els.showNameSection, 'img');
    assert.equal(els.showName.textContent, 'Radio Canvas');
    assert.equal(image.getAttribute('src'), '/images/logo.png');
    assert.equal(image.hidden, false);
    assert.equal(els.showNameSection.classList.contains(`block--media-${position}`), true);
  }
});

test('block_config applique dimensions, fit, crop, alignement et couleurs sûres', () => {
  const { runtime, els } = makeRuntime();
  const controls = [
    'snd_title image_url https://example.com/cover.jpg',
    'snd_title image_width 320',
    'snd_title image_height 180px',
    'snd_title image_fit cover',
    'snd_title image_crop top-right',
    'snd_title image_align right',
    'snd_title background_color #112233',
    'snd_title foreground_color white',
  ];
  controls.forEach((values) => runtime.applyControl({ header: 'block_config', values }));
  const image = childByTag(els.titleSection, 'img');
  assert.match(image.getAttribute('style'), /width:320px;height:180px;object-fit:cover;object-position:top right/);
  assert.match(image.getAttribute('style'), /margin-left:auto;margin-right:0/);
  assert.equal(els.titleSection.getAttribute('style'), '--block-background:#112233;--block-foreground:white');
});

test('block_config invalide est rejeté sans modifier la configuration courante', () => {
  const { runtime } = makeRuntime();
  runtime.applyControl({ header: 'block_config', values: 'snd_show image_fit contain' });
  const before = runtime.snapshot().configs.snd_show;
  assert.deepEqual(runtime.applyControl({ header: 'block_config', values: 'snd_show image_fit calc(100%)' }), {
    handled: true, valid: false, reason: 'block_config_invalide',
  });
  assert.deepEqual(runtime.snapshot().configs.snd_show, before);
});

test('runtime affiche un canvas 128x128 et conserve ses alignements', () => {
  const { runtime, sections, els } = makeRuntime();
  runtime.applyControl({ header: 'mode', values: 'drawing content content content content content content content' });
  runtime.applyControl({ header: 'drawing_preset', values: 'bars' });
  runtime.applyControl({ header: 'drawing_align', values: 'center' });
  const canvas = childByTag(sections.showNameSection, 'canvas');
  assert.equal(sections.showNameSection.hidden, false);
  assert.equal(els.showName.hidden, true);
  assert.equal(canvas.getAttribute('data-drawing-align'), 'center');
  assert.match(canvas.getAttribute('style'), /margin-left:auto;margin-right:auto/);
});
