// Rendu sûr de l'image de programme. Les valeurs de mise en page passent par
// des listes fermées : aucune valeur reçue ne devient une règle CSS arbitraire.
import { isSafeHttpUrl } from './renderSoundInfo.js';

const FIT_VALUES = new Set(['contain', 'cover', 'fill', 'none', 'scale-down']);
const POSITION_VALUES = new Set([
  'center', 'top', 'bottom', 'left', 'right',
  'top left', 'top right', 'bottom left', 'bottom right',
]);
const SLOT_VALUES = new Set(['top', 'after_title', 'after_author', 'after_subtitle', 'bottom']);
const LOCAL_IMAGE_PATH = /^\/images\/(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_.-]*\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

// Les visuels versionnés dans public/images sont servis par Vite/Vercel à la
// racine /images. On n'accepte aucun autre chemin relatif ni "..".
export function isSafeImageSource(value) {
  const source = String(value ?? '').trim();
  return isSafeHttpUrl(source) || LOCAL_IMAGE_PATH.test(source);
}

export function parseImageVisible(value) {
  return ['true', '1', 'on', 'show', 'visible'].includes(String(value).trim().toLowerCase());
}

// Accepte auto, pixels, pourcentages ou unités viewport dans des bornes utiles.
export function parseImageSize(value, fallback) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'auto') return 'auto';
  const match = raw.match(/^(\d+(?:\.\d+)?)(px|%|vw|vh)$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return fallback;
  if (match[2] === 'px' && amount <= 1600) return `${amount}px`;
  if (match[2] !== 'px' && amount <= 100) return `${amount}${match[2]}`;
  return fallback;
}

export function parseImageFit(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return FIT_VALUES.has(raw) ? raw : 'contain';
}

export function parseImagePosition(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return POSITION_VALUES.has(raw) ? raw : 'center';
}

export function parseImageSlot(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return SLOT_VALUES.has(raw) ? raw : 'after_subtitle';
}

// Déplace le bloc entier, pas le point focal de l'image. Les quatre ancres
// restent dans la carte afin que Max puisse modifier le placement à chaud.
export function placeSoundImage(slot, els) {
  const target = parseImageSlot(slot);
  const { card, wrap, titleSection, authorSection, subtitleSection, descriptionSection } = els || {};
  if (!card || !wrap || typeof card.insertBefore !== 'function') return target;

  if (target === 'top' && titleSection) card.insertBefore(wrap, titleSection);
  else if (target === 'after_title' && authorSection) card.insertBefore(wrap, authorSection);
  else if (target === 'after_author' && subtitleSection) card.insertBefore(wrap, subtitleSection);
  else if (target === 'after_subtitle' && descriptionSection) card.insertBefore(wrap, descriptionSection);
  else if (target === 'bottom' && typeof card.appendChild === 'function') card.appendChild(wrap);
  return target;
}

export function renderSoundImage(state, els) {
  const imageUrl = String(state.sound_image_url ?? '').trim();
  const canShow = parseImageVisible(state.sound_image_visible) && isSafeImageSource(imageUrl);
  if (!els?.wrap || !els?.image) return false;

  placeSoundImage(state.sound_image_slot, els);

  els.wrap.hidden = !canShow;
  if (!canShow) {
    els.image.setAttribute('src', '');
    return false;
  }

  const width = parseImageSize(state.sound_image_width, '100%');
  const height = parseImageSize(state.sound_image_height, 'auto');
  const fit = parseImageFit(state.sound_image_fit);
  const position = parseImagePosition(state.sound_image_position);
  els.image.setAttribute('src', imageUrl);
  els.image.setAttribute('style', `width:${width};height:${height};object-fit:${fit};object-position:${position}`);
  return true;
}
