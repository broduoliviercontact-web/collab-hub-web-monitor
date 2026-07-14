// Tests for the ui domain — split from the former monolithic test/runTests.mjs (issue #11).
// Behaviour is unchanged; tests and fakes were moved verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderField, isSafeHttpUrl, parseSoundLink, parseCollabMarkup } from '../../src/ui/renderSoundInfo.js';
import {
  isSafeImageSource, parseImageFit, parseImagePosition, parseImageSize, parseImageSlot, parseImageVisible, placeSoundImage, renderSoundImage,
} from '../../src/ui/renderSoundImage.js';
import {
  createStreamStatus, routeStreamControl,
  STALE_MS, SIGNAL_THRESHOLD,
  STREAM_STATUS, STREAM_SIGNAL,
  clamp01, parseOnAir, parseTimestamp,
  normalizeCount, formatListenerCount,
} from '../../src/state/streamStatus.js';
import { STREAM_HEADERS } from '../../src/collabHub/messageRouter.js';
import {
  buildStreamStatusDOM, renderStreamStatus,
  mountStreamCard, shouldMountStreamCard,
} from '../../src/ui/streamStatusView.js';
import { fakeEls, fakeDocument, fakeEl, fakeDomEl } from '../helpers/dom.mjs';

function richEl() {
  const handlers = {};
  const el = {
    tagName: '', textContent: '', hidden: false, _attrs: {}, _children: [], _parent: null,
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    appendChild(c) { this._children.push(c); if (c && typeof c === 'object') c._parent = this; return c; },
    append(...cs) { cs.forEach((c) => { this._children.push(c); if (c && typeof c === 'object') c._parent = this; }); },
    replaceChildren(...cs) { this._children = cs; cs.forEach((c) => { if (c && typeof c === 'object') c._parent = this; }); },
    addEventListener(ev, cb) { (handlers[ev] = handlers[ev] || []).push(cb); },
    removeEventListener() {},
    _fire: (ev, ...a) => (handlers[ev] || []).forEach((cb) => cb(...a)),
  };
  let _inner = '';
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get() { return _inner; },
    set() { throw new Error('innerHTML interdit (sécurité sound_link)'); },
  });
  return el;
}

function richDoc() {
  const created = [];
  return {
    _created: created,
    createElement(tag) {
      const e = richEl();
      e.tagName = tag.toUpperCase();
      e._tag = tag;
      created.push(e);
      return e;
    },
    createTextNode(text) {
      return { nodeType: 3, _text: String(text), textContent: String(text), _parent: null };
    },
  };
}

function richEls() {
  return { linkWrap: richEl(), link: richEl() };
}

function richSoundEls() {
  return {
    title: richEl(), author: richEl(), subtitle: richEl(), description: richEl(),
    linkWrap: richEl(), link: richEl(),
  };
}

test('isSafeHttpUrl accepte http/https', () => {
  assert.equal(isSafeHttpUrl('https://example.com'), true);
  assert.equal(isSafeHttpUrl('http://example.com/path?q=1'), true);
});

// 6. URL javascript refusée (+ data, vide)

test('isSafeHttpUrl refuse javascript:, data:, vide, non-URL', () => {
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,xxx'), false);
  assert.equal(isSafeHttpUrl(''), false);
  assert.equal(isSafeHttpUrl('   '), false);
  assert.equal(isSafeHttpUrl('not a url'), false);
});

test('renderSoundImage : URL sûre, visibilité et cadrage sont appliqués sans CSS libre', () => {
  const els = { wrap: fakeEl(), image: fakeEl() };
  const shown = renderSoundImage({
    sound_image_url: 'https://example.com/image.png', sound_image_visible: 'true',
    sound_image_width: '640px', sound_image_height: '40vh',
    sound_image_fit: 'cover', sound_image_position: 'top right',
  }, els);
  assert.equal(shown, true);
  assert.equal(els.wrap.hidden, false);
  assert.equal(els.image.getAttribute('src'), 'https://example.com/image.png');
  assert.equal(els.image.getAttribute('style'), 'width:640px;height:40vh;object-fit:cover;object-position:top right');
  assert.equal(parseImageVisible('off'), false);
  assert.equal(parseImageSize('url(evil)', '100%'), '100%');
  assert.equal(parseImageFit('expression(evil)'), 'contain');
  assert.equal(parseImagePosition('left; color:red'), 'center');
});

test('renderSoundImage : URL interdite ou image masquée retire la source', () => {
  const els = { wrap: fakeEl(), image: fakeEl() };
  assert.equal(renderSoundImage({ sound_image_url: 'javascript:alert(1)', sound_image_visible: 'true' }, els), false);
  assert.equal(els.wrap.hidden, true);
  assert.equal(els.image.getAttribute('src'), '');
});

test('renderSoundImage : chemin public /images sûr accepté, autres chemins relatifs refusés', () => {
  const els = { wrap: fakeEl(), image: fakeEl() };
  assert.equal(isSafeImageSource('/images/collab-hub-image-test.svg'), true);
  assert.equal(isSafeImageSource('/images/../secret.png'), false);
  assert.equal(isSafeImageSource('/assets/cover.png'), false);
  assert.equal(renderSoundImage({ sound_image_url: '/images/collab-hub-image-test.svg', sound_image_visible: 'true' }, els), true);
  assert.equal(els.image.getAttribute('src'), '/images/collab-hub-image-test.svg');
});

test('placeSoundImage : sound_image_slot déplace le bloc entre les quatre ancres', () => {
  const calls = [];
  const card = {
    insertBefore: (wrap, anchor) => calls.push(['before', wrap, anchor]),
    appendChild: (wrap) => calls.push(['append', wrap]),
  };
  const els = {
    card, wrap: { id: 'image' }, titleSection: { id: 'title' }, authorSection: { id: 'author' },
    subtitleSection: { id: 'subtitle' }, descriptionSection: { id: 'description' },
  };
  assert.equal(placeSoundImage('top', els), 'top');
  assert.deepEqual(calls.pop(), ['before', els.wrap, els.titleSection]);
  assert.equal(placeSoundImage('after_title', els), 'after_title');
  assert.deepEqual(calls.pop(), ['before', els.wrap, els.authorSection]);
  assert.equal(placeSoundImage('after_author', els), 'after_author');
  assert.deepEqual(calls.pop(), ['before', els.wrap, els.subtitleSection]);
  assert.equal(placeSoundImage('after_subtitle', els), 'after_subtitle');
  assert.deepEqual(calls.pop(), ['before', els.wrap, els.descriptionSection]);
  assert.equal(placeSoundImage('bottom', els), 'bottom');
  assert.deepEqual(calls.pop(), ['append', els.wrap]);
  assert.equal(parseImageSlot('not-a-slot'), 'after_subtitle');
});

// 7. sound_link vide masque le lien

test('renderField sound_link vide -> lien masqué', () => {
  const els = fakeEls();
  renderField('sound_link', '', els);
  assert.equal(els.linkWrap.hidden, true);
});


test('renderField sound_link valide -> lien visible + href', () => {
  const els = fakeEls();
  renderField('sound_link', 'https://example.com', els);
  assert.equal(els.linkWrap.hidden, false);
  assert.equal(els.link.getAttribute('href'), 'https://example.com');
});


test('renderField sound_link javascript: -> lien masqué', () => {
  const els = fakeEls();
  renderField('sound_link', 'javascript:alert(1)', els);
  assert.equal(els.linkWrap.hidden, true);
  assert.equal(els.link.getAttribute('href'), '#');
});

// 8. sound_title met à jour le bon élément

test('renderField sound_title met à jour le titre seulement', () => {
  const els = fakeEls();
  els.author.textContent = 'auteur';
  els.subtitle.textContent = 'sous';
  renderField('sound_title', 'Nouveau titre', els);
  assert.equal(els.title.textContent, 'Nouveau titre');
  // 9. les autres champs restent inchangés
  assert.equal(els.author.textContent, 'auteur');
  assert.equal(els.subtitle.textContent, 'sous');
  assert.equal(els.description.textContent, '');
});

// 9. état : un seul header reçu ne change que ce champ

test('streamStatusView : rendu reduced-motion safe (largeurs + data-attr, pas de transition inline)', () => {
  const doc = fakeDocument();
  const { els } = buildStreamStatusDOM(doc, null);
  assert.ok(els.section, 'bloc flux construit');
  const snap = {
    computedStatus: STREAM_STATUS.LIVE, signal: STREAM_SIGNAL.PRESENT,
    level: 0.42, peak: 0.91, onAir: 1, ageMs: 100, fresh: true, signalPresent: true, updatedAt: 1000,
  };
  renderStreamStatus(snap, els);
  assert.equal(els.statusLabel.textContent, 'EN DIRECT');
  assert.equal(els.signalVal.textContent, 'présent');
  // largeurs posées via setAttribute('style', ...) — pas de transition inline.
  const barStyle = els.meterBar._attrs.style || '';
  assert.match(barStyle, /width:42%/);
  const peakStyle = els.meterPeak._attrs.style || '';
  assert.match(peakStyle, /left:91%/);
  assert.ok(!/transition/i.test(barStyle) && !/transition/i.test(peakStyle));
  // data-stream-status posé pour le styling (state-driven, pas animation)
  assert.equal(els.section._attrs['data-stream-status'], STREAM_STATUS.LIVE);
});

// 12b. rendu INDISPONIBLE par défaut (avant tout header reçu)

test('streamStatusView : INDISPONIBLE par défaut avant tout header', () => {
  const doc = fakeDocument();
  const { els } = buildStreamStatusDOM(doc, null);
  const s = createStreamStatus({ now: () => 1000 });
  renderStreamStatus(s.getSnapshot(), els);
  assert.equal(els.statusLabel.textContent, 'STATUT INDISPONIBLE');
  assert.equal(els.section._attrs['data-stream-status'], STREAM_STATUS.UNAVAILABLE);
  assert.match(els.meterBar._attrs.style, /width:0%/);
});

// 12c. constants stables (seuils documentés)

test('stream-card : règle shouldMountStreamCard (debug ET livekit)', () => {
  assert.equal(shouldMountStreamCard(false, true), false, 'hors debug -> pas de carte');
  assert.equal(shouldMountStreamCard(true, true), true, 'debug + livekit -> carte');
  assert.equal(shouldMountStreamCard(false, false), false, 'rien -> pas de carte');
  assert.equal(shouldMountStreamCard(true, false), false, 'debug sans livekit -> pas de carte');
});

// A6. aucun changement sur le moteur listener (DOM + contrôles présents)

test('sound_link : deux liens valides -> 2 segments link + texte entre', () => {
  const segs = parseSoundLink('[Tom Johnson]{https://en.wikipedia.org/wiki/Tom_Johnson_(composer)} aime les nombres, et [Music for 88]{https://example.com/music-for-88} est une œuvre intéressante.');
  assert.equal(segs.length, 4);
  assert.equal(segs[0].type, 'link');
  assert.equal(segs[0].label, 'Tom Johnson');
  assert.equal(segs[0].href, 'https://en.wikipedia.org/wiki/Tom_Johnson_(composer)');
  assert.equal(segs[1].type, 'text');
  assert.equal(segs[1].value, ' aime les nombres, et ');
  assert.equal(segs[2].type, 'link');
  assert.equal(segs[2].label, 'Music for 88');
  assert.equal(segs[2].href, 'https://example.com/music-for-88');
  assert.equal(segs[3].type, 'text');
  assert.equal(segs[3].value, ' est une œuvre intéressante.');
});

// 2. trois liens valides

test('sound_link : trois liens valides -> 3 segments link', () => {
  const segs = parseSoundLink('[a]{https://x} [b]{https://y} [c]{https://z}');
  const links = segs.filter((s) => s.type === 'link');
  assert.equal(links.length, 3);
  assert.deepEqual(links.map((s) => s.href), ['https://x', 'https://y', 'https://z']);
});

// 3. texte avant, entre et après

test('sound_link : texte avant, entre et après les liens', () => {
  const segs = parseSoundLink('Avant [a]{https://x} entre [b]{https://y} après');
  assert.equal(segs.length, 5);
  assert.equal(segs[0].type, 'text'); assert.equal(segs[0].value, 'Avant ');
  assert.equal(segs[1].type, 'link'); assert.equal(segs[1].href, 'https://x');
  assert.equal(segs[2].type, 'text'); assert.equal(segs[2].value, ' entre ');
  assert.equal(segs[3].type, 'link'); assert.equal(segs[3].href, 'https://y');
  assert.equal(segs[4].type, 'text'); assert.equal(segs[4].value, ' après');
});

// 4. URL contenant des parenthèses (préservées, délimiteurs = accolades)

test('sound_link : URL avec parenthèses préservée', () => {
  const segs = parseSoundLink('[Tom Johnson]{https://en.wikipedia.org/wiki/Tom_Johnson_(composer)}');
  assert.equal(segs.length, 1);
  assert.equal(segs[0].type, 'link');
  assert.equal(segs[0].href, 'https://en.wikipedia.org/wiki/Tom_Johnson_(composer)');
});

// 5. un lien valide + un lien javascript invalide (le reste est conservé)

test('sound_link : lien valide + lien javascript invalide -> texte brut pour l invalide', () => {
  const segs = parseSoundLink('[a]{https://x} [b]{javascript:alert(1)}');
  const links = segs.filter((s) => s.type === 'link');
  assert.equal(links.length, 1);
  assert.equal(links[0].href, 'https://x');
  // Le fragment invalide devient texte brut (non cliquable), pas jeté.
  const texts = segs.filter((s) => s.type === 'text').map((s) => s.value).join('');
  assert.ok(texts.includes('[b]{javascript:alert(1)}'), 'fragment invalide conservé en texte');
  // Aucun href dangereux créé.
  assert.ok(!segs.some((s) => s.type === 'link' && /javascript:/.test(s.href)));
});

// 6. accolade fermante manquante -> texte brut (aucun lien)

test('sound_link : accolade fermante manquante -> texte brut, aucun lien', () => {
  const segs = parseSoundLink('[Tom Johnson]{https://example.com');
  assert.equal(segs.filter((s) => s.type === 'link').length, 0);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].type, 'text');
});

// 6b. crochet fermant manquant -> texte brut

test('sound_link : crochet fermant manquant -> texte brut, aucun lien', () => {
  const segs = parseSoundLink('[Tom Johnson{https://example.com}');
  assert.equal(segs.filter((s) => s.type === 'link').length, 0);
});

// 7. label vide -> texte brut (aucun lien)

test('sound_link : label vide -> texte brut, aucun lien', () => {
  assert.equal(parseSoundLink('[]{https://example.com}').filter((s) => s.type === 'link').length, 0);
  assert.equal(parseSoundLink('[   ]{https://example.com}').filter((s) => s.type === 'link').length, 0);
});

// 8. URL vide -> texte brut (aucun lien)

test('sound_link : URL vide -> texte brut, aucun lien', () => {
  assert.equal(parseSoundLink('[Tom]{}').filter((s) => s.type === 'link').length, 0);
});

// 8b. data: et file: refusés -> texte brut (aucun href dangereux)

test('sound_link : data: et file: refusés -> texte brut', () => {
  assert.equal(parseSoundLink('[Tom]{data:text/html,xxx}').filter((s) => s.type === 'link').length, 0);
  assert.equal(parseSoundLink('[Tom]{file:///etc/passwd}').filter((s) => s.type === 'link').length, 0);
});

// 9. HTML non interprété (label gardé littéral dans le segment)

test('sound_link : HTML reçu dans le label non interprété', () => {
  const segs = parseSoundLink('[<b>bold</b>]{https://example.com}');
  assert.equal(segs.length, 1);
  assert.equal(segs[0].type, 'link');
  assert.equal(segs[0].label, '<b>bold</b>'); // gardé littéral, pas interprété
});

// 10. URL simple historique toujours valide (label null)

test('sound_link : URL simple historique -> segment link label null', () => {
  const segs = parseSoundLink('https://example.com');
  assert.equal(segs.length, 1);
  assert.equal(segs[0].type, 'link');
  assert.equal(segs[0].label, null);
  assert.equal(segs[0].href, 'https://example.com');
});

// 11. ordre exact des segments (multi-lien)

test('sound_link : ordre exact des segments préservé', () => {
  const segs = parseSoundLink('Avant [a]{https://x} milieu [b]{https://y} fin');
  assert.deepEqual(segs.map((s) => s.type), ['text', 'link', 'text', 'link', 'text']);
  assert.deepEqual(segs.map((s) => s.type === 'link' ? s.href : s.value), ['Avant ', 'https://x', ' milieu ', 'https://y', ' fin']);
});

// 11b. valeur vide -> [] (masquée)

test('sound_link : valeur vide -> []', () => {
  assert.deepEqual(parseSoundLink(''), []);
  assert.deepEqual(parseSoundLink('   '), []);
  assert.deepEqual(parseSoundLink(null), []);
});

// 11c. URL simple invalide sans crochet -> [] (masquée, compat historique)

test('sound_link : URL simple invalide sans crochet -> []', () => {
  assert.deepEqual(parseSoundLink('javascript:alert(1)'), []);
  assert.deepEqual(parseSoundLink('not a url'), []);
});

// 10. rendu rich-link : prefix TextNode + <a> + suffix TextNode, visible

test('sound_link : rendu rich-link construit via APIs DOM (TextNode + <a>)', () => {
  const doc = richDoc();
  const els = richEls();
  renderField('sound_link', 'Découvrir [Tom Johnson]{https://example.com}.', els, doc);
  assert.equal(els.linkWrap.hidden, false);
  const children = els.linkWrap._children;
  // prefix TextNode + <a> + suffix TextNode
  assert.equal(children.length, 3);
  assert.equal(children[0].nodeType, 3);
  assert.equal(children[0]._text, 'Découvrir ');
  assert.equal(children[1].tagName, 'A');
  assert.equal(children[1].textContent, 'Tom Johnson');
  assert.equal(children[2]._text, '.');
});

// 11. rendu rich-link : target="_blank" posé

test('sound_link : rendu rich-link pose target="_blank"', () => {
  const doc = richDoc();
  const els = richEls();
  renderField('sound_link', '[Tom]{https://example.com}', els, doc);
  const a = els.linkWrap._children.find((c) => c.tagName === 'A');
  assert.equal(a.getAttribute('target'), '_blank');
});

// 12. rendu rich-link : rel="noopener noreferrer" posé

test('sound_link : rendu rich-link pose rel="noopener noreferrer"', () => {
  const doc = richDoc();
  const els = richEls();
  renderField('sound_link', '[Tom]{https://example.com}', els, doc);
  const a = els.linkWrap._children.find((c) => c.tagName === 'A');
  assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(a.getAttribute('href'), 'https://example.com');
});

// 13. aucun innerHTML utilisé (piège -> throw si tenté)

test('sound_link : aucun innerHTML utilisé au rendu rich-link', () => {
  const doc = richDoc();
  const els = richEls();
  // Si le rendu utilisait innerHTML, le piège lèverait -> le test échouerait.
  renderField('sound_link', '[Tom]{https://example.com}', els, doc);
  assert.equal(els.linkWrap.innerHTML, '');
});

// 14. rendu plain-url : lien historique visible + href + « En savoir plus »

test('sound_link : rendu plain-url -> lien visible + href + En savoir plus', () => {
  const doc = richDoc();
  const els = richEls();
  renderField('sound_link', 'https://example.com', els, doc);
  assert.equal(els.linkWrap.hidden, false);
  assert.equal(els.link.getAttribute('href'), 'https://example.com');
  assert.equal(els.link.getAttribute('target'), '_blank');
  assert.equal(els.link.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(els.link.textContent, 'En savoir plus');
});

// 15. rendu invalid attemptedRich -> texte brut non cliquable, visible

test('sound_link : syntaxe enrichie invalide -> texte brut non cliquable', () => {
  const doc = richDoc();
  const els = richEls();
  const raw = '[Tom]{javascript:alert(1)}';
  renderField('sound_link', raw, els, doc);
  assert.equal(els.linkWrap.hidden, false);
  // Un seul enfant TextNode contenant la valeur brute ; aucun <a> créé.
  const children = els.linkWrap._children;
  assert.equal(children.length, 1);
  assert.equal(children[0].nodeType, 3);
  assert.equal(children[0]._text, raw);
  const a = children.find((c) => c && c.tagName === 'A');
  assert.equal(a, undefined);
});

// 15b. rendu invalid bare (javascript: sans '[') -> masqué (compat historique)

test('sound_link : URL simple invalide (javascript:) -> masqué, href neutre', () => {
  const doc = richDoc();
  const els = richEls();
  renderField('sound_link', 'javascript:alert(1)', els, doc);
  assert.equal(els.linkWrap.hidden, true);
  assert.equal(els.link.getAttribute('href'), '#');
});

test('sound_link : texte simple non-URL sans syntaxe -> masqué (compat historique)', () => {
  const doc = richDoc();
  const els = richEls();
  renderField('sound_link', 'not a url', els, doc);
  assert.equal(els.linkWrap.hidden, true);
  assert.equal(els.link.getAttribute('href'), '#');
});

// 15c. rendu vide -> masqué

test('sound_link : valeur vide -> lien masqué', () => {
  const doc = richDoc();
  const els = richEls();
  renderField('sound_link', '', els, doc);
  assert.equal(els.linkWrap.hidden, true);
});

// 15d. compat historique : URL simple via renderField -> lien visible

test('sound_link : compat historique URL simple via renderField', () => {
  const doc = richDoc();
  const els = richEls();
  renderField('sound_link', 'https://example.com/path?q=1', els, doc);
  assert.equal(els.linkWrap.hidden, false);
  assert.equal(els.link.getAttribute('href'), 'https://example.com/path?q=1');
});

test('syntaxe Collab-Hub : parse gras, italique, code, lien, couleur et séparateurs', () => {
  const segments = parseCollabMarkup('**gras** *italique* `code` [site]{https://example.com} [EN DIRECT]{color:red}|ligne||paragraphe|||séparation');
  assert.deepEqual(segments.map((segment) => segment.type), [
    'strong', 'text', 'em', 'text', 'code', 'text', 'link', 'text', 'color',
    'lineBreak', 'text', 'paragraphBreak', 'text', 'separator', 'text',
  ]);
  assert.equal(segments[0].children[0].value, 'gras');
  assert.equal(segments[2].children[0].value, 'italique');
  assert.equal(segments[4].value, 'code');
  assert.equal(segments[6].href, 'https://example.com');
  assert.equal(segments[8].color, 'red');
});

test('syntaxe Collab-Hub : ***texte*** rend gras et italique simultanément', () => {
  const segments = parseCollabMarkup('***Concert***');
  assert.equal(segments.length, 1);
  assert.equal(segments[0].type, 'strong');
  assert.equal(segments[0].children[0].type, 'em');
  assert.equal(segments[0].children[0].children[0].value, 'Concert');
});

test('syntaxe Collab-Hub : les cinq champs sound_* rendent le même balisage sûr', () => {
  const doc = richDoc();
  const els = richSoundEls();
  const value = '**Titre** [source]{https://example.com} [EN DIRECT]{color:accent}|suite';
  const targets = [
    ['sound_title', els.title], ['sound_author', els.author],
    ['sound_subtitle', els.subtitle], ['sound_description', els.description],
    ['sound_link', els.linkWrap],
  ];

  for (const [header, target] of targets) {
    renderField(header, value, els, doc);
    assert.equal(target.hidden, false);
    assert.equal(target._children.find((child) => child.tagName === 'STRONG')._children[0]._text, 'Titre');
    const link = target._children.find((child) => child.tagName === 'A');
    assert.equal(link.getAttribute('href'), 'https://example.com');
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
    const color = target._children.find((child) => child.getAttribute?.('class') === 'collab-color collab-color--accent');
    assert.ok(color, `${header} rend la couleur contrôlée`);
    assert.ok(target._children.some((child) => child.tagName === 'BR'), `${header} rend le séparateur de ligne`);
  }
});

test('syntaxe Collab-Hub : CSS libre, URL dangereuse et HTML restent du texte', () => {
  const raw = '[rouge]{color:#f00} [danger]{javascript:alert(1)} <img src=x onerror=alert(1)>';
  const segments = parseCollabMarkup(raw);
  assert.ok(!segments.some((segment) => segment.type === 'color' || segment.type === 'link'));
  assert.equal(segments.map((segment) => segment.value).join(''), raw);

  const doc = richDoc();
  const els = richSoundEls();
  renderField('sound_description', raw, els, doc);
  assert.equal(els.description._children.length, 1);
  assert.equal(els.description._children[0].nodeType, 3);
  assert.equal(els.description._children[0]._text, raw);
});


test('listener count : la stream-card reste debug-only (pas sur /)', () => {
  assert.equal(shouldMountStreamCard(false, true), false, 'hors debug pas de stream-card');
  assert.equal(shouldMountStreamCard(true, true), true, 'debug -> stream-card');
});

// 38. register/deliver : stream_listener_count pré-enregistré par publishClient
