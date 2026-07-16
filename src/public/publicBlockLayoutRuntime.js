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

const DEFAULT_BLOCK_MODE = 'content';
const DRAWING_BLOCK_MODE = 'drawing';
const DRAWING_CANVAS_SIZE = 128;
const DRAWING_PRESETS = ['crosshair', 'grid', 'dot', 'frame', 'bars'];
const DRAWING_ALIGNS = ['left', 'center', 'right'];

function drawingCanvasStyle(align) {
  const margins = {
    left: ['0', 'auto'],
    center: ['auto', 'auto'],
    right: ['auto', '0'],
  };
  const [marginLeft, marginRight] = margins[align] || margins.left;
  return [
    'display:block',
    `width:${DRAWING_CANVAS_SIZE}px`,
    `height:${DRAWING_CANVAS_SIZE}px`,
    'flex:0 0 auto',
    `margin-left:${marginLeft}`,
    `margin-right:${marginRight}`,
  ].join(';');
}

function listTokens(values) {
  const rawValues = Array.isArray(values) ? values : [values];
  return rawValues.flatMap((value) => String(value ?? '').trim().split(/\s+/).filter(Boolean));
}

export function parseBlockVisibility(values) {
  const tokens = listTokens(values);
  if (tokens.length !== BLOCK_IDS.length || tokens.some((token) => token !== '0' && token !== '1')) return null;
  return tokens.map((token) => token === '1');
}

export function parseBlockModes(values) {
  const tokens = listTokens(values);
  if (tokens.length !== BLOCK_IDS.length) return null;
  const modes = tokens.map((token) => token.toLowerCase());
  if (modes.some((mode) => mode !== DEFAULT_BLOCK_MODE && mode !== DRAWING_BLOCK_MODE)) return null;
  return modes;
}

export function parseDrawingPreset(values) {
  const preset = normalizeValue(values).trim().toLowerCase();
  if (!DRAWING_PRESETS.includes(preset)) return null;
  return preset;
}

export function parseDrawingAlign(values) {
  const align = normalizeValue(values).trim().toLowerCase();
  if (!DRAWING_ALIGNS.includes(align)) return null;
  return align;
}

export function createBlockLayoutRuntime({ els, doc }) {
  const values = Object.fromEntries(BLOCK_IDS.map((id) => [id, '']));
  const configs = Object.fromEntries(BLOCK_IDS.map((id) => [id, createDefaultBlockConfig()]));
  let visibility = BLOCK_IDS.map(() => true);
  let modes = BLOCK_IDS.map(() => DEFAULT_BLOCK_MODE);
  let drawingPreset = 'crosshair';
  let drawingAlign = 'left';
  let active = false;
  const drawingCanvases = new Map();
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

  function getMode(id) {
    return modes[BLOCK_IDS.indexOf(id)] || DEFAULT_BLOCK_MODE;
  }

  function isDrawingMode(id) {
    return getMode(id) === DRAWING_BLOCK_MODE;
  }

  function ensureDrawingCanvas(id) {
    if (drawingCanvases.has(id)) return drawingCanvases.get(id);
    if (!doc || typeof doc.createElement !== 'function') return null;
    const canvas = doc.createElement('canvas');
    if (!canvas) return null;
    canvas.width = DRAWING_CANVAS_SIZE;
    canvas.height = DRAWING_CANVAS_SIZE;
    if (typeof canvas.setAttribute === 'function') {
      canvas.setAttribute('width', String(DRAWING_CANVAS_SIZE));
      canvas.setAttribute('height', String(DRAWING_CANVAS_SIZE));
      canvas.setAttribute('aria-label', `Drawing canvas ${id}`);
      canvas.setAttribute('style', drawingCanvasStyle(drawingAlign));
    }
    if (canvas.classList?.add) canvas.classList.add('drawing-canvas');
    drawCanvasPlaceholder(canvas, drawingPreset);
    drawingCanvases.set(id, canvas);
    return canvas;
  }

  function drawCanvasPlaceholder(canvas, preset = drawingPreset) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = DRAWING_CANVAS_SIZE;
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, size, size);

    if (preset === 'crosshair' || preset === 'grid') {
      ctx.strokeStyle = '#243041';
      ctx.lineWidth = 1;
      for (let step = 16; step < size; step += 16) {
        ctx.beginPath();
        ctx.moveTo(step + 0.5, 0);
        ctx.lineTo(step + 0.5, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, step + 0.5);
        ctx.lineTo(size, step + 0.5);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);

    if (preset === 'crosshair') {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(size / 2, 14);
      ctx.lineTo(size / 2, size - 14);
      ctx.moveTo(14, size / 2);
      ctx.lineTo(size - 14, size / 2);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (preset === 'dot') {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    if (preset === 'frame') {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4;
      ctx.strokeRect(14, 14, size - 28, size - 28);
    }

    if (preset === 'bars') {
      const barHeights = [28, 54, 84, 60, 94, 44];
      ctx.fillStyle = '#f59e0b';
      barHeights.forEach((height, index) => {
        const x = 16 + index * 16;
        ctx.fillRect(x, size - 14 - height, 10, height);
      });
    }

    ctx.fillStyle = '#e5e7eb';
    ctx.font = '600 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(preset.toUpperCase(), size / 2, 24);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('128 x 128', size / 2, size - 14);
  }

  function redrawDrawingCanvases() {
    for (const canvas of drawingCanvases.values()) drawCanvasPlaceholder(canvas, drawingPreset);
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
    section.classList?.remove?.('block--has-media', 'block--custom-background', 'block--custom-foreground');
    if (config.backgroundColor) section.classList?.add?.('block--custom-background');
    if (config.foregroundColor) section.classList?.add?.('block--custom-foreground');
    section.setAttribute?.('style', [
      config.backgroundColor ? `--block-background:${config.backgroundColor}` : '',
      config.foregroundColor ? `--block-foreground:${config.foregroundColor}` : '',
    ].filter(Boolean).join(';'));

    const image = ensureMediaImage(id);
    if (!image) return;
    const visible = config.imageVisible && Boolean(config.imageUrl) && !isDrawingMode(id);
    image.hidden = !visible;
    image.setAttribute?.('src', visible ? config.imageUrl : '');
    image.setAttribute?.('style', mediaImageStyle(config));
    if (visible) {
      section.classList?.add?.('block--has-media');
      section.classList?.add?.(`block--media-${config.imagePosition}`);
    }
  }

  function syncBlockMode(id) {
    const section = els?.[SECTION_KEYS[id]];
    if (!section) return;
    const content = els?.[CONTENT_KEYS[id]];
    const mediaImage = mediaImages.get(id);
    const drawing = isDrawingMode(id);
    section.classList?.remove?.('block--drawing-align-left', 'block--drawing-align-center', 'block--drawing-align-right');
    if (drawing) {
      section.classList?.add?.('block--drawing-mode');
      section.classList?.add?.(`block--drawing-align-${drawingAlign}`);
      const canvas = ensureDrawingCanvas(id);
      if (canvas) {
        canvas.setAttribute?.('style', drawingCanvasStyle(drawingAlign));
        canvas.setAttribute?.('data-drawing-align', drawingAlign);
        if (canvas.hidden !== false) canvas.hidden = false;
        if (typeof section.appendChild === 'function') section.appendChild(canvas);
      }
      if (content) content.hidden = true;
      if (mediaImage) mediaImage.hidden = true;
      return;
    }
    section.classList?.remove?.('block--drawing-mode');
    const canvas = drawingCanvases.get(id);
    if (canvas) canvas.hidden = true;
    if (content) content.hidden = false;
    syncBlockMedia(id);
  }

  function applyVisibility() {
    for (const [index, id] of BLOCK_IDS.entries()) {
      const section = els?.[SECTION_KEYS[id]];
      if (!section) continue;
      syncBlockMode(id);
      const hasContent = isDrawingMode(id)
        ? true
        : String(values[id] ?? '').trim() !== ''
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

      if (header === 'mode') {
        const nextModes = parseBlockModes(rawValues);
        if (!nextModes) return { handled: true, valid: false, reason: 'mode_invalide' };
        activate();
        modes = nextModes;
        applyVisibility();
        return { handled: true, valid: true, contentChanged: false };
      }

      if (header === 'drawing_preset') {
        const nextPreset = parseDrawingPreset(rawValues);
        if (!nextPreset) return { handled: true, valid: false, reason: 'drawing_preset_invalide' };
        activate();
        drawingPreset = nextPreset;
        redrawDrawingCanvases();
        applyVisibility();
        return { handled: true, valid: true, contentChanged: false };
      }

      if (header === 'drawing_align') {
        const nextAlign = parseDrawingAlign(rawValues);
        if (!nextAlign) return { handled: true, valid: false, reason: 'drawing_align_invalide' };
        activate();
        drawingAlign = nextAlign;
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
      modes: [...modes],
      drawingPreset,
      drawingAlign,
    }),
  };
}
