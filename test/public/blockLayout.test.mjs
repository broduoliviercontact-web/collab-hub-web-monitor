import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlockLayoutRuntime, parseBlockVisibility } from '../../src/public/publicBlockLayoutRuntime.js';
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
    removeAttribute(k) { delete this._attrs[k]; },
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

test('parseBlockConfig valide le bloc, les enums, dimensions, typographie, couleurs et URL', () => {
  assert.deepEqual(parseBlockConfig('snd_show image_position left'), { blockId: 'snd_show', property: 'image_position', value: 'left' });
  assert.deepEqual(parseBlockConfig('snd_show text_position center'), { blockId: 'snd_show', property: 'text_position', value: 'center' });
  assert.deepEqual(parseBlockConfig('snd_title font_size 32px'), { blockId: 'snd_title', property: 'font_size', value: '32px' });
  assert.deepEqual(parseBlockConfig('snd_title font_size default'), { blockId: 'snd_title', property: 'font_size', value: '' });
  assert.deepEqual(parseBlockConfig('snd_info_5 image_width 75%'), { blockId: 'snd_info_5', property: 'image_width', value: '75%' });
  assert.deepEqual(parseBlockConfig('snd_title background_color #1a2b3c'), { blockId: 'snd_title', property: 'background_color', value: '#1a2b3c' });
  assert.equal(parseBlockConfig('snd_img_1 image_url https://example.com/a.png'), null);
  assert.equal(parseBlockConfig('snd_show image_url javascript:alert(1)'), null);
  assert.equal(parseBlockConfig('snd_show image_width 5000px'), null);
  assert.equal(parseBlockConfig('snd_show font_size 7px'), null);
  assert.equal(parseBlockConfig('snd_show font_size 97px'), null);
  assert.equal(parseBlockConfig('snd_show font_size calc(20px)'), null);
  assert.equal(parseBlockConfig('snd_show font_size 20'), null);
  assert.equal(parseBlockConfig('snd_show text_position bottom'), null);
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

test('runtime affiche seulement les blocs visibles ayant texte ou image', () => {
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

test('CLEAR retire complètement l image et sa source du bloc', () => {
  const { runtime, els } = makeRuntime();
  runtime.applyControl({ header: 'snd_show', values: 'Émission' });
  runtime.applyControl({ header: 'block_config', values: 'snd_show image_url /images/logo.png' });
  const image = childByTag(els.showNameSection, 'img');
  assert.equal(image.hidden, false);
  assert.equal(image.getAttribute('src'), '/images/logo.png');

  runtime.applyControl({ header: 'block_config', values: 'snd_show image_url' });
  assert.equal(image.hidden, true);
  assert.equal(image.getAttribute('src'), undefined);
  assert.equal(els.showNameSection.classList.contains('block--has-media'), false);
  assert.equal(els.showNameSection.classList.contains('block--media-above'), false);
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

test('font_size et text_position restent indépendants pour chacun des huit blocs', () => {
  const { runtime, els } = makeRuntime();
  runtime.applyControl({ header: 'snd_title', values: 'Un titre très long qui doit rester dans sa carte' });
  runtime.applyControl({ header: 'snd_author', values: 'Une autrice' });
  runtime.applyControl({ header: 'block_config', values: 'snd_title font_size 40px' });
  runtime.applyControl({ header: 'block_config', values: 'snd_title text_position center' });

  assert.equal(runtime.snapshot().configs.snd_title.fontSize, '40px');
  assert.equal(runtime.snapshot().configs.snd_author.fontSize, '');
  assert.equal(els.titleSection.classList.contains('block--custom-font-size'), true);
  assert.equal(els.titleSection.classList.contains('block--text-center'), true);
  assert.equal(els.titleSection.getAttribute('style'), '--block-font-size:40px');
  assert.equal(els.authorSection.classList.contains('block--custom-font-size'), false);
});

test('font_size default réinitialise seulement le bloc ciblé', () => {
  const { runtime, els } = makeRuntime();
  runtime.applyControl({ header: 'snd_title', values: 'Titre' });
  runtime.applyControl({ header: 'snd_author', values: 'Auteur' });
  runtime.applyControl({ header: 'block_config', values: 'snd_title font_size 26px' });
  runtime.applyControl({ header: 'block_config', values: 'snd_author font_size 14px' });
  runtime.applyControl({ header: 'block_config', values: 'snd_title font_size default' });

  assert.equal(runtime.snapshot().configs.snd_title.fontSize, '');
  assert.equal(runtime.snapshot().configs.snd_author.fontSize, '14px');
  assert.equal(els.titleSection.classList.contains('block--custom-font-size'), false);
  assert.equal(els.authorSection.classList.contains('block--custom-font-size'), true);
});

test('un bloc v2 combine Markdown sûr, taille exacte et position sans image', () => {
  const { runtime, els } = makeRuntime();
  const markup = '**Gras** *italique* `code` [site]{https://example.com} [LIVE]{color:accent}';
  runtime.applyControl({ header: 'snd_info_3', values: markup });
  runtime.applyControl({ header: 'block_config', values: 'snd_info_3 font_size 37px' });
  runtime.applyControl({ header: 'block_config', values: 'snd_info_3 text_position right' });

  assert.deepEqual(els.info3._children.map((child) => child.tagName || '#text'), [
    'STRONG', '#text', 'EM', '#text', 'CODE', '#text', 'A', '#text', 'SPAN',
  ]);
  assert.equal(els.info3._children[6].getAttribute('href'), 'https://example.com');
  assert.equal(els.info3._children[8].getAttribute('class'), 'collab-color collab-color--accent');
  assert.equal(els.info3Section.classList.contains('block--text-right'), true);
  assert.equal(els.info3Section.getAttribute('style'), '--block-font-size:37px');
  assert.equal(childByTag(els.info3Section, 'img').hidden, true);
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
