// Placement du nom d'émission entre les blocs éditoriaux. La liste est fermée
// pour que Max ne puisse déplacer que ce bloc vers une ancre connue.
const SHOW_NAME_POSITION_VALUES = new Set([
  'top', 'after_title', 'after_author', 'after_subtitle', 'bottom',
]);

export function parseShowNamePosition(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return SHOW_NAME_POSITION_VALUES.has(raw) ? raw : 'top';
}

export function placeShowName(position, els) {
  const target = parseShowNamePosition(position);
  const {
    card, showNameSection, titleSection, authorSection, subtitleSection, descriptionSection,
  } = els || {};
  if (!card || !showNameSection || typeof card.insertBefore !== 'function') return target;

  if (target === 'top') {
    // `top` passe avant une éventuelle image elle-même placée en top.
    card.insertBefore(showNameSection, card.firstChild || titleSection || null);
  }
  else if (target === 'after_title' && authorSection) card.insertBefore(showNameSection, authorSection);
  else if (target === 'after_author' && subtitleSection) card.insertBefore(showNameSection, subtitleSection);
  else if (target === 'after_subtitle' && descriptionSection) card.insertBefore(showNameSection, descriptionSection);
  else if (target === 'bottom' && typeof card.appendChild === 'function') card.appendChild(showNameSection);
  return target;
}
