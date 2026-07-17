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

export function parseBlockOrder(values) {
  const tokens = listTokens(values);
  if (tokens.length !== BLOCK_IDS.length || tokens.some((token) => !/^\d+$/.test(token))) return null;
  const order = tokens.map(Number);
  if (new Set(order).size !== BLOCK_IDS.length || order.some((index) => index < 0 || index >= BLOCK_IDS.length)) return null;
  return order;
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
  let visibility = BLOCK_IDS.map(() => true);
  let order = BLOCK_IDS.map((_, index) => index);
  let modes = BLOCK_IDS.map(() => DEFAULT_BLOCK_MODE);
  let drawingPreset = 'crosshair';
  let drawingAlign = 'left';
  let active = false;
  const drawingCanvases = new Map();

  function place(orderToApply) {
    if (!els?.card || typeof els.card.appendChild !== 'function') return;
    for (const index of orderToApply) {
      const section = els[SECTION_KEYS[BLOCK_IDS[index]]];
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

  function syncBlockMode(id) {
    const section = els?.[SECTION_KEYS[id]];
    if (!section) return;
    const content = els?.[CONTENT_KEYS[id]];
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
      return;
    }
    section.classList?.remove?.('block--drawing-mode');
    const canvas = drawingCanvases.get(id);
    if (canvas) canvas.hidden = true;
    if (content) content.hidden = false;
  }

  function applyVisibility() {
    for (const [index, id] of BLOCK_IDS.entries()) {
      const section = els?.[SECTION_KEYS[id]];
      if (!section) continue;
      syncBlockMode(id);
      const hasContent = isDrawingMode(id)
        ? true
        : BLOCK_IMAGE_HEADERS.includes(id)
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

      const nextOrder = parseBlockOrder(rawValues);
      if (!nextOrder) return { handled: true, valid: false, reason: 'order_invalide' };
      activate();
      order = nextOrder;
      place(order);
      return { handled: true, valid: true, contentChanged: false };
    },
    isActive: () => active,
    snapshot: () => ({
      values: { ...values },
      visibility: [...visibility],
      order: [...order],
      modes: [...modes],
      drawingPreset,
      drawingAlign,
    }),
  };
}
