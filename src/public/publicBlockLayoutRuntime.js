// Runtime du protocole v2 (issue #42). Les huit blocs partagent un état de
// visibilité et un ordre atomiques, séparés des anciens contrôles sound_*.
import {
  BLOCK_IDS, BLOCK_IMAGE_HEADERS, BLOCK_TEXT_HEADERS, normalizeValue, routeBlockControl,
} from '../collabHub/messageRouter.js';
import { isSafeImageSource } from '../ui/renderSoundImage.js';
import { renderMarkup } from '../ui/renderSoundInfo.js';

const SECTION_KEYS = {
  snd_info_3: 'info3Section',
  snd_info_1: 'subtitleSection',
  snd_info_2: 'descriptionSection',
  snd_show: 'showNameSection',
  snd_title: 'titleSection',
  snd_author: 'authorSection',
  snd_img_1: 'imageWrap',
  snd_img_2: 'image2Wrap',
};

const CONTENT_KEYS = {
  snd_info_3: 'info3',
  snd_info_1: 'subtitle',
  snd_info_2: 'description',
  snd_show: 'showName',
  snd_title: 'title',
  snd_author: 'author',
  snd_img_1: 'image',
  snd_img_2: 'image2',
};

function listTokens(values) {
  const rawValues = Array.isArray(values) ? values : [values];
  return rawValues.flatMap((value) => String(value ?? '').trim().split(/\s+/).filter(Boolean));
}

export function parseBlockVisibility(values) {
  const tokens = listTokens(values);
  if (tokens.length !== BLOCK_IDS.length || tokens.some((token) => token !== '0' && token !== '1')) return null;
  return tokens.map((token) => token === '1');
}

export function parseBlockOrder(values) {
  const tokens = listTokens(values);
  if (tokens.length !== BLOCK_IDS.length || tokens.some((token) => !/^\d+$/.test(token))) return null;
  const order = tokens.map(Number);
  if (new Set(order).size !== BLOCK_IDS.length || order.some((index) => index < 0 || index >= BLOCK_IDS.length)) return null;
  return order;
}

export function createBlockLayoutRuntime({ els, doc }) {
  const values = Object.fromEntries(BLOCK_IDS.map((id) => [id, '']));
  let visibility = BLOCK_IDS.map(() => true);
  let order = BLOCK_IDS.map((_, index) => index);
  let active = false;

  function place(orderToApply) {
    if (!els?.card || typeof els.card.appendChild !== 'function') return;
    for (const index of orderToApply) {
      const section = els[SECTION_KEYS[BLOCK_IDS[index]]];
      if (section) els.card.appendChild(section);
    }
  }

  function applyVisibility() {
    for (const [index, id] of BLOCK_IDS.entries()) {
      const section = els?.[SECTION_KEYS[id]];
      if (!section) continue;
      const hasContent = BLOCK_IMAGE_HEADERS.includes(id)
        ? isSafeImageSource(values[id])
        : String(values[id] ?? '').trim() !== '';
      section.hidden = !visibility[index] || !hasContent;
    }
  }

  function activate() {
    if (active) return;
    active = true;
    place(order);
    applyVisibility();
  }

  function renderText(id, value) {
    const target = els?.[CONTENT_KEYS[id]];
    renderMarkup(value, target, doc);
  }

  function renderImage(id, value) {
    const image = els?.[CONTENT_KEYS[id]];
    if (!image) return;
    if (!isSafeImageSource(value)) {
      image.setAttribute('src', '');
      return;
    }
    image.setAttribute('src', value);
    image.setAttribute('style', 'width:100%;height:auto;object-fit:contain;object-position:center');
  }

  return {
    applyControl(data) {
      let header = null;
      let rawValues = null;
      if (!routeBlockControl(data, (nextHeader, nextValues) => { header = nextHeader; rawValues = nextValues; })) {
        return { handled: false };
      }

      if (BLOCK_TEXT_HEADERS.includes(header)) {
        activate();
        values[header] = normalizeValue(rawValues);
        renderText(header, values[header]);
        applyVisibility();
        return { handled: true, valid: true, contentChanged: true };
      }

      if (BLOCK_IMAGE_HEADERS.includes(header)) {
        const value = normalizeValue(rawValues).trim();
        if (value !== '' && !isSafeImageSource(value)) return { handled: true, valid: false, reason: 'image_invalide' };
        activate();
        values[header] = value;
        renderImage(header, value);
        applyVisibility();
        return { handled: true, valid: true, contentChanged: true };
      }

      if (header === 'visibility') {
        const nextVisibility = parseBlockVisibility(rawValues);
        if (!nextVisibility) return { handled: true, valid: false, reason: 'visibility_invalide' };
        activate();
        visibility = nextVisibility;
        applyVisibility();
        return { handled: true, valid: true, contentChanged: false };
      }

      const nextOrder = parseBlockOrder(rawValues);
      if (!nextOrder) return { handled: true, valid: false, reason: 'order_invalide' };
      activate();
      order = nextOrder;
      place(order);
      return { handled: true, valid: true, contentChanged: false };
    },
    isActive: () => active,
    snapshot: () => ({ values: { ...values }, visibility: [...visibility], order: [...order] }),
  };
}
