// Rendu DOM des champs. Pur vis-à-vis du document : reçoit des refs d'éléments.
// N'utilise JAMAIS innerHTML. Uniquement textContent / setAttribute / hidden.

// Valide qu'une URL est http(s) uniquement (refuse javascript:, data:, etc.).
export function isSafeHttpUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed === '') return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const FIELD_TO_EL = {
  sound_title: 'title',
  sound_author: 'author',
  sound_subtitle: 'subtitle',
  sound_description: 'description',
  sound_link: 'linkWrap',
};

export function fieldElementKey(header) {
  return FIELD_TO_EL[header];
}

// Met à jour un champ vers le DOM. `els` = map de refs DOM.
// Pour sound_link : URL http(s) valide -> lien visible ; vide/invalide -> masqué.
export function renderField(header, value, els) {
  switch (header) {
    case 'sound_title':
      els.title.textContent = value;
      break;
    case 'sound_author':
      els.author.textContent = value;
      break;
    case 'sound_subtitle':
      els.subtitle.textContent = value;
      break;
    case 'sound_description':
      els.description.textContent = value;
      break;
    case 'sound_link':
      applyLink(value, els);
      break;
    default:
      break;
  }
}

function applyLink(value, els) {
  if (isSafeHttpUrl(value)) {
    els.link.setAttribute('href', value.trim());
    els.linkWrap.hidden = false;
  } else {
    els.linkWrap.hidden = true;
    els.link.setAttribute('href', '#');
    if (value && value.trim() !== '') {
      // Invalide non vide : on le signale discrètement, sans l'afficher au public.
      console.warn(`[Collab-Hub] sound_link ignoré (URL invalide ou protocole non http/https) : ${value}`);
    }
  }
}

// Micro-transition discrète (fondu). Respecte prefers-reduced-motion via CSS.
export function flashElement(el) {
  if (!el || !el.classList) return;
  el.classList.remove('just-updated');
  // force reflow pour rejouer l'animation
  void el.offsetWidth;
  el.classList.add('just-updated');
}