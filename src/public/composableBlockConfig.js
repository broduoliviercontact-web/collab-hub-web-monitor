import { BLOCK_IDS, normalizeValue } from '../collabHub/messageRouter.js';
import { isSafeImageSource } from '../ui/renderSoundImage.js';

const POSITIONS = ['above', 'below', 'left', 'right', 'background'];
const FITS = ['contain', 'cover', 'fill', 'none'];
const ALIGNS = ['left', 'center', 'right'];
const CROPS = ['center', 'top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
const COLORS = ['transparent', 'black', 'white'];

export const BLOCK_CONFIG_PROPERTIES = Object.freeze([
  'text', 'text_position', 'font_size', 'image_url', 'image_visible', 'image_position', 'image_width',
  'image_height', 'image_fit', 'image_align', 'image_crop',
  'background_color', 'foreground_color',
]);

export function createDefaultBlockConfig() {
  return {
    text: '',
    textPosition: 'left',
    fontSize: '',
    imageUrl: '',
    imageVisible: true,
    imagePosition: 'above',
    imageWidth: 'auto',
    imageHeight: 'auto',
    imageFit: 'contain',
    imageAlign: 'center',
    imageCrop: 'center',
    backgroundColor: '',
    foregroundColor: '',
  };
}

function parseBoolean(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return null;
}

function parseDimension(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'auto') return normalized;
  const match = normalized.match(/^(\d{1,4})(px|%)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] || 'px';
  if (unit === '%' && (amount < 1 || amount > 100)) return null;
  if (unit === 'px' && (amount < 1 || amount > 2000)) return null;
  return `${amount}${unit}`;
}

function parseFontSize(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'default') return '';
  const match = normalized.match(/^(\d{1,2})px$/);
  if (!match) return null;
  const amount = Number(match[1]);
  return amount >= 8 && amount <= 96 ? `${amount}px` : null;
}

function parseColor(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'default' || normalized === '') return '';
  if (COLORS.includes(normalized) || /^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(normalized)) return normalized;
  return null;
}

function parseEnum(value, allowed) {
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : null;
}

export function parseBlockConfig(values) {
  const source = normalizeValue(values).trim();
  const match = source.match(/^(\S+)\s+(\S+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const [, blockId, property] = match;
  const value = match[3] ?? '';
  if (!BLOCK_IDS.includes(blockId) || !BLOCK_CONFIG_PROPERTIES.includes(property)) return null;

  let parsedValue = value;
  if (property === 'font_size') parsedValue = parseFontSize(value);
  else if (property === 'text_position') parsedValue = parseEnum(value, ALIGNS);
  else if (property === 'image_url') {
    parsedValue = value.trim();
    if (parsedValue && !isSafeImageSource(parsedValue)) return null;
  } else if (property === 'image_visible') {
    parsedValue = parseBoolean(value);
    if (parsedValue === null) return null;
  } else if (property === 'image_position') parsedValue = parseEnum(value, POSITIONS);
  else if (property === 'image_width' || property === 'image_height') parsedValue = parseDimension(value);
  else if (property === 'image_fit') parsedValue = parseEnum(value, FITS);
  else if (property === 'image_align') parsedValue = parseEnum(value, ALIGNS);
  else if (property === 'image_crop') parsedValue = parseEnum(value, CROPS);
  else if (property === 'background_color' || property === 'foreground_color') parsedValue = parseColor(value);

  if (parsedValue === null) return null;
  return { blockId, property, value: parsedValue };
}

export function configKey(property) {
  return property.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
