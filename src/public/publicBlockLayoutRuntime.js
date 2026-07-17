// Runtime des huit blocs fixes et composables (issues #42, #54 et #55).
import {
  BLOCK_CONFIG_HEADER, BLOCK_IDS, BLOCK_TEXT_HEADERS, normalizeValue, routeBlockControl,
} from '../collabHub/messageRouter.js';
import { renderMarkup } from '../ui/renderSoundInfo.js';
import { configKey, createDefaultBlockConfig, parseBlockConfig } from './composableBlockConfig.js';

const SECTION_KEYS = {
  snd_show: 'showNameSection',
  snd_title: 'titleSection',
  snd_author: 'authorSection',
  snd_info_1: 'subtitleSection',
  snd_info_2: 'descriptionSection',
  snd_info_3: 'info3Section',
  snd_info_4: 'info4Section',
  snd_info_5: 'info5Section',
};

const CONTENT_KEYS = {
  snd_show: 'showName',
  snd_title: 'title',
  snd_author: 'author',
  snd_info_1: 'subtitle',
  snd_info_2: 'description',
  snd_info_3: 'info3',
  snd_info_4: 'info4',
  snd_info_5: 'info5',
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

export function createBlockLayoutRuntime({ els, doc }) {
  const values = Object.fromEntries(BLOCK_IDS.map((id) => [id, '']));
  const configs = Object.fromEntries(BLOCK_IDS.map((id) => [id, createDefaultBlockConfig()]));
  let visibility = BLOCK_IDS.map(() => true);
  let active = false;
  const mediaImages = new Map();

  function placeFixedRegistry() {
    if (!els?.card) return;
    if (typeof els.card.insertBefore === 'function') {
      [...BLOCK_IDS].reverse().forEach((id) => {
        const section = els[SECTION_KEYS[id]];
        if (section) els.card.insertBefore(section, els.card.firstChild || null);
      });
      return;
    }
    if (typeof els.card.appendChild !== 'function') return;
    for (const id of BLOCK_IDS) {
      const section = els[SECTION_KEYS[id]];
      if (section) els.card.appendChild(section);
    }
  }

  function ensureMediaImage(id) {
    if (mediaImages.has(id)) return mediaImages.get(id);
    const section = els?.[SECTION_KEYS[id]];
    if (!section || !doc || typeof doc.createElement !== 'function') return null;
    const image = doc.createElement('img');
    if (!image) return null;
    image.classList?.add?.('block-media-image');
    image.setAttribute?.('alt', '');
    image.setAttribute?.('loading', 'lazy');
    image.hidden = true;
    section.appendChild?.(image);
    mediaImages.set(id, image);
    return image;
  }

  function mediaImageStyle(config) {
    const margins = {
      left: ['0', 'auto'],
      center: ['auto', 'auto'],
      right: ['auto', '0'],
    };
    const [marginLeft, marginRight] = margins[config.imageAlign] || margins.center;
    return [
      `width:${config.imageWidth}`,
      `height:${config.imageHeight}`,
      `object-fit:${config.imageFit}`,
      `object-position:${config.imageCrop.replace('-', ' ')}`,
      `margin-left:${marginLeft}`,
      `margin-right:${marginRight}`,
    ].join(';');
  }

  function syncBlockMedia(id) {
    const section = els?.[SECTION_KEYS[id]];
    if (!section) return;
    const config = configs[id];
    const positions = ['above', 'below', 'left', 'right', 'background'];
    positions.forEach((position) => section.classList?.remove?.(`block--media-${position}`));
    ['left', 'center', 'right'].forEach((position) => section.classList?.remove?.(`block--text-${position}`));
    section.classList?.remove?.(
      'block--has-media', 'block--custom-background', 'block--custom-foreground', 'block--custom-font-size',
    );
    if (config.backgroundColor) section.classList?.add?.('block--custom-background');
    if (config.foregroundColor) section.classList?.add?.('block--custom-foreground');
    if (config.fontSize) section.classList?.add?.('block--custom-font-size');
    section.classList?.add?.(`block--text-${config.textPosition}`);
    section.setAttribute?.('style', [
      config.backgroundColor ? `--block-background:${config.backgroundColor}` : '',
      config.foregroundColor ? `--block-foreground:${config.foregroundColor}` : '',
      config.fontSize ? `--block-font-size:${config.fontSize}` : '',
    ].filter(Boolean).join(';'));

    const image = ensureMediaImage(id);
    if (!image) return;
    const visible = config.imageVisible && Boolean(config.imageUrl);
    image.hidden = !visible;
    if (visible) image.setAttribute?.('src', config.imageUrl);
    else image.removeAttribute?.('src');
    image.setAttribute?.('style', mediaImageStyle(config));
    if (visible) {
      section.classList?.add?.('block--has-media');
      section.classList?.add?.(`block--media-${config.imagePosition}`);
    }
  }

  function applyVisibility() {
    for (const [index, id] of BLOCK_IDS.entries()) {
      const section = els?.[SECTION_KEYS[id]];
      if (!section) continue;
      syncBlockMedia(id);
      const hasContent = String(values[id] ?? '').trim() !== ''
        || (configs[id].imageVisible && Boolean(configs[id].imageUrl));
      section.hidden = !visibility[index] || !hasContent;
    }
  }

  function activate() {
    if (active) return;
    active = true;
    placeFixedRegistry();
    applyVisibility();
  }

  function renderText(id, value) {
    const target = els?.[CONTENT_KEYS[id]];
    renderMarkup(value, target, doc);
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
        configs[header].text = values[header];
        renderText(header, values[header]);
        applyVisibility();
        return { handled: true, valid: true, contentChanged: true };
      }

      if (header === BLOCK_CONFIG_HEADER) {
        const update = parseBlockConfig(rawValues);
        if (!update) return { handled: true, valid: false, reason: 'block_config_invalide' };
        activate();
        const key = configKey(update.property);
        configs[update.blockId][key] = update.value;
        if (update.property === 'text') {
          values[update.blockId] = update.value;
          renderText(update.blockId, update.value);
        }
        syncBlockMedia(update.blockId);
        applyVisibility();
        return { handled: true, valid: true, contentChanged: update.property === 'text' };
      }

      if (header === 'visibility') {
        const nextVisibility = parseBlockVisibility(rawValues);
        if (!nextVisibility) return { handled: true, valid: false, reason: 'visibility_invalide' };
        activate();
        visibility = nextVisibility;
        applyVisibility();
        return { handled: true, valid: true, contentChanged: false };
      }

      return { handled: true, valid: false, reason: 'controle_bloc_inconnu' };
    },
    isActive: () => active,
    snapshot: () => ({
      values: { ...values },
      configs: Object.fromEntries(BLOCK_IDS.map((id) => [id, { ...configs[id] }])),
      visibility: [...visibility],
      order: BLOCK_IDS.map((_, index) => index),
    }),
  };
}
