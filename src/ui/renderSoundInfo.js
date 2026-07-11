// Rendu DOM des champs. Pur vis-à-vis du document : reçoit des refs d'éléments.
// N'utilise JAMAIS innerHTML. Uniquement textContent / setAttribute / hidden et,
// pour sound_link enrichi, des TextNode + éléments <a> créés via les APIs DOM.

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

// --- Lot 5 (sound_link enrichi) : parseur PUR et testable ---------------------
//
// Syntaxe personnalisée (NON Markdown), un ou plusieurs liens par valeur :
//   [texte cliquable]{URL} texte complémentaire [autre label]{autre URL} suite
//
// Règles :
//   - plusieurs liens enrichis autorisés dans une même valeur sound_link ;
//   - texte avant, entre et après les liens autorisé ;
//   - crochets réservés au label, accolades à l'URL (les parenthèses sont
//     autorisées telles quelles dans l'URL, ex. Tom_Johnson_(composer)) ;
//   - compatibilité avec les URL simples historiques (https://example.com) ;
//   - la syntaxe Markdown classique [label](url) n'est PAS supportée (ambiguïté
//     avec les parenthèses présentes dans certaines URLs) ;
//   - seuls les protocoles http: et https: sont acceptés ;
//   - aucun innerHTML, aucune interprétation de HTML reçu.
//
// Retourne une LISTE de segments :
//   [ { type: 'link', label, href }, { type: 'text', value }, ... ]
//
//   - segment 'link' : label (string, ou null pour une URL simple historique),
//     href (string http/https). label null -> le rendu utilise « En savoir plus ».
//   - segment 'text' : value (string), texte non cliquable.
//
// Cas particuliers :
//   - valeur vide / non-chaîne -> []  (le rendu masque le lien) ;
//   - URL simple historique valide -> [{ type:'link', label:null, href }] ;
//   - URL simple invalide (ex. javascript:, sans crochet) -> [] (masquée,
//     compat historique : aucun href dangereux créé) ;
//   - un segment [label]{url} invalide (label/URL vide, crochet/accolade
//     manquant, protocole interdit) -> émis en segment 'text' (texte brut non
//     cliquable) SANS jeter le reste de la valeur ; les autres liens restent
//     valides.
export function parseSoundLink(value) {
  if (typeof value !== 'string' || value.trim() === '') return [];

  // Pas de crochet -> syntaxe URL simple historique (un seul lien possible).
  if (!value.includes('[')) {
    return isSafeHttpUrl(value) ? [{ type: 'link', label: null, href: value.trim() }] : [];
  }

  // Scan multi-liens. Les segments invalides deviennent du texte brut.
  const segments = [];
  let textBuf = '';
  const flushText = () => { if (textBuf !== '') { segments.push({ type: 'text', value: textBuf }); textBuf = ''; } };
  let i = 0;
  while (i < value.length) {
    if (value[i] !== '[') { textBuf += value[i]; i++; continue; }

    // Tente de parser [label]{url} à partir de i.
    const bracketEnd = value.indexOf(']', i + 1);
    if (bracketEnd === -1) {
      // Pas de ']' -> '[' littéral, on reprend après (un '[' ultérieur peut
      // ouvrir un lien valide).
      textBuf += value[i]; i++; continue;
    }
    const label = value.slice(i + 1, bracketEnd);
    if (label.trim() === '' || value[bracketEnd + 1] !== '{') {
      // Label vide ou structure incomplète (pas d'accolade après ']') -> le
      // fragment '[...]' devient texte brut, on reprend après ']'.
      textBuf += value.slice(i, bracketEnd + 1); i = bracketEnd + 1; continue;
    }
    const braceEnd = value.indexOf('}', bracketEnd + 2);
    if (braceEnd === -1) {
      // Pas d'accolade fermante -> '[' littéral, on reprend après '['.
      textBuf += value[i]; i++; continue;
    }
    const href = value.slice(bracketEnd + 2, braceEnd);
    if (href.trim() === '' || !isSafeHttpUrl(href)) {
      // URL vide ou protocole interdit -> fragment '[label]{...}' en texte brut
      // (jamais d'href dangereux créé), on reprend après '}'.
      textBuf += value.slice(i, braceEnd + 1); i = braceEnd + 1; continue;
    }
    // Lien valide.
    flushText();
    segments.push({ type: 'link', label, href: href.trim() });
    i = braceEnd + 1;
  }
  flushText();
  return segments;
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

// Met à jour un champ vers le DOM. `els` = map de refs DOM. `doc` (optionnel,
// défaut : document global) est requis pour le rendu enrichi de sound_link
// (création de TextNode + <a> via les APIs DOM).
export function renderField(header, value, els, doc = (typeof document !== 'undefined' ? document : null)) {
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
      applyLink(value, els, doc);
      break;
    default:
      break;
  }
}

// Applique le rendu sound_link depuis la liste de segments. JAMAIS d'innerHTML.
//   [] (vide ou URL simple invalide sans crochet) -> masque le lien (compat
//      historique : aucun href dangereux créé) ;
//   [{ link, label:null, href }] (URL simple historique valide) -> lien
//      original « En savoir plus » (réutilise els.link) ;
//   segments multiples (rich) -> TextNode pour 'text', <a> pour 'link', via
//      les APIs DOM. Les segments invalides ont déjà été convertis en 'text'
//      par le parseur -> texte brut non cliquable, jamais de HTML interprété.
function applyLink(value, els, doc) {
  const segments = parseSoundLink(value);
  const wrap = els.linkWrap;

  if (segments.length === 0) {
    // Valeur vide OU URL simple invalide (javascript:, data:, etc. sans crochet)
    // -> masquée (compat historique). Aucun href dangereux créé.
    if (els.link && els.link.setAttribute) els.link.setAttribute('href', '#');
    if (wrap) wrap.hidden = true;
    if (typeof value === 'string' && value.trim() !== '') {
      console.warn(`[Collab-Hub] sound_link ignoré (URL invalide ou protocole non http/https) : ${value}`);
    }
    return;
  }

  // URL simple historique : un seul lien sans label -> on réutilise le <a>
  // original (présent dans index.html) avec « En savoir plus ».
  if (segments.length === 1 && segments[0].type === 'link' && segments[0].label == null) {
    const { href } = segments[0];
    if (els.link && els.link.setAttribute) {
      els.link.setAttribute('href', href);
      els.link.setAttribute('target', '_blank');
      els.link.setAttribute('rel', 'noopener noreferrer');
    }
    if (els.link) els.link.textContent = 'En savoir plus';
    // Replace le lien original comme seul enfant (au cas où un rendu enrichi
    // précédent aurait mis du texte autour). Pas de innerHTML : replaceChildren.
    if (wrap && typeof wrap.replaceChildren === 'function' && els.link) {
      wrap.replaceChildren(els.link);
    }
    if (wrap) wrap.hidden = false;
    return;
  }

  // Rendu enrichi (un ou plusieurs liens labellisés + texte). Build via APIs DOM.
  if (!doc || typeof doc.createElement !== 'function' || typeof doc.createTextNode !== 'function') {
    // Environnement sans DOM (ex. test minimal sans doc) : fallback sûr -> masqué.
    if (wrap) wrap.hidden = true;
    return;
  }
  const parts = [];
  for (const seg of segments) {
    if (seg.type === 'link') {
      const a = doc.createElement('a');
      a.setAttribute('href', seg.href);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      // TextNode : le HTML éventuel du label n'est JAMAIS interprété.
      a.textContent = seg.label == null ? 'En savoir plus' : seg.label;
      parts.push(a);
    } else {
      parts.push(doc.createTextNode(seg.value));
    }
  }
  if (wrap && typeof wrap.replaceChildren === 'function') {
    wrap.replaceChildren(...parts);
  }
  if (wrap) wrap.hidden = false;
}

// Micro-transition discrète (fondu). Respecte prefers-reduced-motion via CSS.
export function flashElement(el) {
  if (!el || !el.classList) return;
  el.classList.remove('just-updated');
  // force reflow pour rejouer l'animation
  void el.offsetWidth;
  el.classList.add('just-updated');
}