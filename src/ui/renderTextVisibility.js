// Rendu sûr des préférences afficher/masquer des champs de programme.
const VISIBILITY_TO_CONTENT = {
  sound_show_name_visible: 'sound_show_name',
  sound_title_visible: 'sound_title',
  sound_author_visible: 'sound_author',
  sound_subtitle_visible: 'sound_subtitle',
  sound_description_visible: 'sound_description',
  sound_link_visible: 'sound_link',
};

const CONTENT_TO_VISIBILITY = Object.fromEntries(
  Object.entries(VISIBILITY_TO_CONTENT).map(([visibility, content]) => [content, visibility]),
);

const VISIBILITY_TO_ELEMENT = {
  sound_show_name_visible: 'showNameSection',
  sound_title_visible: 'titleSection',
  sound_author_visible: 'authorSection',
  sound_subtitle_visible: 'subtitleSection',
  sound_description_visible: 'descriptionSection',
  sound_link_visible: 'linkWrap',
};

export function parseTextVisible(value) {
  return ['true', '1', 'on', 'show', 'visible'].includes(String(value ?? '').trim().toLowerCase());
}

export function contentHeaderForVisibility(header) {
  return VISIBILITY_TO_CONTENT[header] || null;
}

// Un lien valide gère déjà son propre état hidden. On ne le force donc visible
// que via un nouveau rendu du contenu ; ici on applique seulement un masquage.
export function renderTextVisibility(state, els, contentHeader) {
  const visibilityHeader = CONTENT_TO_VISIBILITY[contentHeader];
  if (!visibilityHeader) return false;
  const element = els?.[VISIBILITY_TO_ELEMENT[visibilityHeader]];
  if (!element) return false;

  const visible = parseTextVisible(state[visibilityHeader]);
  if (!visible) element.hidden = true;
  else if (contentHeader === 'sound_show_name') {
    // Le nom du show n'a pas de valeur par défaut : true ne doit pas révéler un
    // conteneur vide si Max ne l'a pas encore envoyé.
    element.hidden = String(els?.showName?.textContent ?? '').trim() === '';
  }
  else if (contentHeader !== 'sound_link') element.hidden = false;
  return visible;
}
