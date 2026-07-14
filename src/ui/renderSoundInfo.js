// Rendu DOM des champs. Pur vis-à-vis du document : reçoit des refs d'éléments.
// N'utilise JAMAIS innerHTML. Uniquement textContent / setAttribute / hidden et,
// pour les champs enrichis, des TextNode + éléments créés via les APIs DOM.

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

// Syntaxe Collab-Hub commune aux cinq champs sound_*.
// Ce n'est volontairement PAS du Markdown complet : seul ce petit sous-ensemble
// éditorial est reconnu et chaque autre caractère reste du texte littéral.
const COLOR_TOKENS = new Set(['red', 'green', 'blue', 'muted', 'accent']);

function pushText(segments, value) {
  if (value === '') return;
  const previous = segments[segments.length - 1];
  if (previous?.type === 'text') previous.value += value;
  else segments.push({ type: 'text', value });
}

function findClosing(value, marker, start) {
  const end = value.indexOf(marker, start);
  return end === start ? -1 : end;
}

// Retourne des segments sûrs, y compris des segments imbriqués pour le gras,
// l'italique et la couleur. Les liens ne sont créés que pour http(s).
export function parseCollabMarkup(value) {
  const source = typeof value === 'string' ? value : String(value ?? '');
  const segments = [];
  let i = 0;

  while (i < source.length) {
    if (source.startsWith('|||', i)) {
      segments.push({ type: 'separator' });
      i += 3;
      continue;
    }
    if (source.startsWith('||', i)) {
      segments.push({ type: 'paragraphBreak' });
      i += 2;
      continue;
    }
    if (source[i] === '|') {
      segments.push({ type: 'lineBreak' });
      i += 1;
      continue;
    }

    if (source[i] === '[') {
      const labelEnd = source.indexOf(']', i + 1);
      if (labelEnd !== -1 && source[labelEnd + 1] === '{') {
        const directiveEnd = source.indexOf('}', labelEnd + 2);
        if (directiveEnd !== -1) {
          const label = source.slice(i + 1, labelEnd);
          const directive = source.slice(labelEnd + 2, directiveEnd).trim();
          if (label.trim() !== '' && isSafeHttpUrl(directive)) {
            segments.push({ type: 'link', label, href: directive });
            i = directiveEnd + 1;
            continue;
          }
          const color = directive.match(/^color:(red|green|blue|muted|accent)$/i)?.[1]?.toLowerCase();
          if (label.trim() !== '' && COLOR_TOKENS.has(color)) {
            segments.push({ type: 'color', color, children: parseCollabMarkup(label) });
            i = directiveEnd + 1;
            continue;
          }
          // Directive inconnue ou interdite : le fragment reste littéral.
          pushText(segments, source.slice(i, directiveEnd + 1));
          i = directiveEnd + 1;
          continue;
        }
      }
    }

    if (source.startsWith('***', i)) {
      const end = findClosing(source, '***', i + 3);
      if (end !== -1) {
        segments.push({
          type: 'strong',
          children: [{ type: 'em', children: parseCollabMarkup(source.slice(i + 3, end)) }],
        });
        i = end + 3;
        continue;
      }
    }
    if (source.startsWith('**', i)) {
      const end = findClosing(source, '**', i + 2);
      if (end !== -1) {
        segments.push({ type: 'strong', children: parseCollabMarkup(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (source[i] === '*') {
      const end = findClosing(source, '*', i + 1);
      if (end !== -1) {
        segments.push({ type: 'em', children: parseCollabMarkup(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (source[i] === '`') {
      const end = findClosing(source, '`', i + 1);
      if (end !== -1) {
        segments.push({ type: 'code', value: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    pushText(segments, source[i]);
    i += 1;
  }
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
// défaut : document global) est requis pour le rendu enrichi (création de
// TextNode + éléments via les APIs DOM).
export function renderField(header, value, els, doc = (typeof document !== 'undefined' ? document : null)) {
  switch (header) {
    case 'sound_title':
      applyMarkup(value, els.title, doc);
      break;
    case 'sound_author':
      applyMarkup(value, els.author, doc);
      break;
    case 'sound_subtitle':
      applyMarkup(value, els.subtitle, doc);
      break;
    case 'sound_description':
      applyMarkup(value, els.description, doc);
      break;
    case 'sound_link':
      applyLink(value, els, doc);
      break;
    default:
      break;
  }
}

function buildMarkupNodes(doc, segments) {
  const nodes = [];
  for (const segment of segments) {
    if (segment.type === 'text') {
      nodes.push(doc.createTextNode(segment.value));
    } else if (segment.type === 'lineBreak') {
      nodes.push(doc.createElement('br'));
    } else if (segment.type === 'paragraphBreak' || segment.type === 'separator') {
      const marker = doc.createElement('span');
      marker.setAttribute('class', `collab-${segment.type === 'separator' ? 'separator' : 'paragraph-break'}`);
      marker.setAttribute('aria-hidden', 'true');
      nodes.push(marker);
    } else if (segment.type === 'code') {
      const code = doc.createElement('code');
      code.textContent = segment.value;
      nodes.push(code);
    } else if (segment.type === 'link') {
      const link = doc.createElement('a');
      link.setAttribute('href', segment.href);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      link.textContent = segment.label;
      nodes.push(link);
    } else {
      const tag = segment.type === 'strong' ? 'strong' : segment.type === 'em' ? 'em' : 'span';
      const element = doc.createElement(tag);
      if (segment.type === 'color') element.setAttribute('class', `collab-color collab-color--${segment.color}`);
      element.replaceChildren(...buildMarkupNodes(doc, segment.children));
      nodes.push(element);
    }
  }
  return nodes;
}

function applyMarkup(value, element, doc) {
  if (!element) return;
  const source = typeof value === 'string' ? value : String(value ?? '');
  if (!doc || typeof doc.createElement !== 'function' || typeof doc.createTextNode !== 'function' || typeof element.replaceChildren !== 'function') {
    // Garde le rendu utilisable dans les environnements DOM minimaux.
    element.textContent = source;
    return;
  }
  if (!('childNodes' in element) && !('_children' in element)) {
    // Certains hôtes de test exposent replaceChildren sans arbre DOM : ils
    // reçoivent le texte brut, sans modifier le comportement applicatif.
    element.textContent = source;
    return;
  }
  element.replaceChildren(...buildMarkupNodes(doc, parseCollabMarkup(source)));
}

// Applique le rendu sound_link depuis la liste de segments. JAMAIS d'innerHTML.
//   valeur vide, URL simple invalide ou texte sans syntaxe -> masque le lien
//   (compat historique : aucun href dangereux créé) ;
//   [{ link, label:null, href }] (URL simple historique valide) -> lien
//      original « En savoir plus » (réutilise els.link) ;
//   segments multiples (rich) -> TextNode pour 'text', <a> pour 'link', via
//      les APIs DOM. Les segments invalides ont déjà été convertis en 'text'
//      par le parseur -> texte brut non cliquable, jamais de HTML interprété.
function applyLink(value, els, doc) {
  const segments = parseSoundLink(value);
  const wrap = els.linkWrap;

  const source = typeof value === 'string' ? value : String(value ?? '');
  const markup = parseCollabMarkup(source);
  const isForbiddenBareScheme = /^[a-z][a-z0-9+.-]*:/i.test(source.trim()) && !isSafeHttpUrl(source);
  const hasMarkup = source.includes('[') || markup.some((segment) => segment.type !== 'text');
  if (source.trim() === '' || isForbiddenBareScheme || (segments.length === 0 && !hasMarkup)) {
    // Valeur vide, URL simple invalide ou texte sans syntaxe -> masquée.
    // Les fragments [..]{..} restent en revanche visibles en texte brut.
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

  // Rendu enrichi commun à tous les champs. Build via APIs DOM.
  if (!doc || typeof doc.createElement !== 'function' || typeof doc.createTextNode !== 'function') {
    // Environnement sans DOM (ex. test minimal sans doc) : fallback sûr -> masqué.
    if (wrap) wrap.hidden = true;
    return;
  }
  if (wrap && typeof wrap.replaceChildren === 'function') {
    wrap.replaceChildren(...buildMarkupNodes(doc, markup));
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
