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
// Syntaxe personnalisée (NON Markdown) :
//   [texte cliquable]{URL} texte complémentaire
//
// Règles :
//   - un seul lien enrichi par valeur sound_link ;
//   - texte avant (prefix) et après (suffix) autorisés ;
//   - crochets réservés au label, accolades à l'URL (les parenthèses sont
//     autorisées telles quelles dans l'URL, ex. Tom_Johnson_(composer)) ;
//   - compatibilité avec les URL simples historiques (https://example.com) ;
//   - la syntaxe Markdown classique [label](url) est abandonnée pour éviter
//     les ambiguïtés avec les parenthèses présentes dans certaines URLs ;
//   - seuls les protocoles http: et https: sont acceptés ;
//   - aucun innerHTML, aucune interprétation de HTML reçu.
//
// Retourne un objet décrivant le rendu à appliquer :
//   { type, href, label, prefix, suffix, raw, attemptedRich }
// type :
//   'plain-url'  -> URL simple historique valide (http/https)
//   'rich-link'  -> [label]{url} valide, avec prefix/suffix optionnels
//   'invalid'    -> valeur non vide mais non exploitable (syntaxe incomplète,
//                   label/URL vide, protocole interdit, crochet/accolade
//                   non équilibré). `attemptedRich` indique si la valeur
//                   contenait '[' (syntaxe enrichie tentée).
//   'empty'      -> valeur vide / blancs uniquement -> masquer le lien.
export function parseSoundLink(value) {
  if (typeof value !== 'string') {
    return { type: 'invalid', href: null, label: null, prefix: null, suffix: null, raw: value, attemptedRich: false };
  }
  const raw = value;
  if (raw.trim() === '') {
    return { type: 'empty', href: null, label: null, prefix: null, suffix: null, raw };
  }

  const bracketStart = raw.indexOf('[');
  if (bracketStart === -1) {
    // Pas de crochet -> syntaxe URL simple historique.
    if (isSafeHttpUrl(raw)) {
      return { type: 'plain-url', href: raw.trim(), label: null, prefix: null, suffix: null, raw };
    }
    return { type: 'invalid', href: null, label: null, prefix: null, suffix: null, raw, attemptedRich: false };
  }

  // Syntaxe enrichie [label]{url}. Recherche le crochet fermant.
  const bracketEnd = raw.indexOf(']', bracketStart + 1);
  if (bracketEnd === -1) {
    return { type: 'invalid', href: null, label: null, prefix: null, suffix: null, raw, attemptedRich: true };
  }
  const label = raw.slice(bracketStart + 1, bracketEnd);
  if (label.trim() === '') {
    return { type: 'invalid', href: null, label, prefix: raw.slice(0, bracketStart), suffix: null, raw, attemptedRich: true };
  }
  // L'URL doit commencer immédiatement après ']' par '{'.
  if (raw[bracketEnd + 1] !== '{') {
    return { type: 'invalid', href: null, label, prefix: raw.slice(0, bracketStart), suffix: null, raw, attemptedRich: true };
  }
  // L'URL est délimitée par les accolades : les parenthèses qu'elle contient
  // (ex. Tom_Johnson_(composer)) sont prises telles quelles, sans équilibrage.
  const braceEnd = raw.indexOf('}', bracketEnd + 2);
  if (braceEnd === -1) {
    return { type: 'invalid', href: null, label, prefix: raw.slice(0, bracketStart), suffix: null, raw, attemptedRich: true };
  }
  const href = raw.slice(bracketEnd + 2, braceEnd);
  if (href.trim() === '') {
    return { type: 'invalid', href: null, label, prefix: raw.slice(0, bracketStart), suffix: raw.slice(braceEnd + 1), raw, attemptedRich: true };
  }
  if (!isSafeHttpUrl(href)) {
    // Protocole interdit (javascript:, data:, file:, etc.) -> jamais d'href
    // dangereux créé. On tombe sur 'invalid' (rendu en texte brut non cliquable).
    return { type: 'invalid', href: null, label, prefix: raw.slice(0, bracketStart), suffix: raw.slice(braceEnd + 1), raw, attemptedRich: true };
  }
  const prefix = raw.slice(0, bracketStart);
  const suffix = raw.slice(braceEnd + 1);
  return { type: 'rich-link', href: href.trim(), label, prefix, suffix, raw, attemptedRich: true };
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

// Applique le rendu sound_link depuis le parseur. JAMAIS d'innerHTML.
//   plain-url  -> lien historique « En savoir plus » (http/https) ;
//   rich-link  -> prefix (TextNode) + <a label> (target/rel) + suffix (TextNode) ;
//   empty      -> masque le lien ;
//   invalid + attemptedRich  -> texte brut non cliquable (la syntaxe enrichie
//                 était tentée : on affiche la valeur reçue telle quelle, sans
//                 jamais interpréter de HTML ni créer d'href) ;
//   invalid + !attemptedRich -> URL simple invalide (ex. javascript:) : masquée
//                 (compat historique), aucun href dangereux créé.
function applyLink(value, els, doc) {
  const parsed = parseSoundLink(value);
  const wrap = els.linkWrap;

  if (parsed.type === 'empty') {
    if (wrap) wrap.hidden = true;
    if (els.link && els.link.setAttribute) els.link.setAttribute('href', '#');
    return;
  }

  if (parsed.type === 'plain-url') {
    if (els.link && els.link.setAttribute) {
      els.link.setAttribute('href', parsed.href);
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

  if (parsed.type === 'rich-link') {
    if (!doc || typeof doc.createElement !== 'function' || typeof doc.createTextNode !== 'function') {
      // Environnement sans DOM (ex. test minimal) : fallback sûr -> masqué.
      if (wrap) wrap.hidden = true;
      return;
    }
    const a = doc.createElement('a');
    a.setAttribute('href', parsed.href);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.textContent = parsed.label; // TextNode : le HTML éventuel du label n'est JAMAIS interprété.
    const parts = [];
    if (parsed.prefix) parts.push(doc.createTextNode(parsed.prefix));
    parts.push(a);
    if (parsed.suffix) parts.push(doc.createTextNode(parsed.suffix));
    if (wrap && typeof wrap.replaceChildren === 'function') {
      wrap.replaceChildren(...parts);
    }
    if (wrap) wrap.hidden = false;
    return;
  }

  // parsed.type === 'invalid'
  if (parsed.attemptedRich) {
    // Syntaxe enrichie incomplète / protocole interdit : on affiche la valeur
    // brute en texte non cliquable (TextNode -> HTML jamais interprété, aucun
    // href créé). Choix documenté : plutôt que masquer, on rend le texte lisible
    // sans danger pour l'utilisateur.
    if (doc && typeof doc.createTextNode === 'function' && wrap && typeof wrap.replaceChildren === 'function') {
      wrap.replaceChildren(doc.createTextNode(parsed.raw));
      wrap.hidden = false;
      return;
    }
    if (wrap) wrap.hidden = true;
    return;
  }

  // URL simple invalide (ex. javascript:, data:, "not a url") : masquée
  // (compat historique) + avertissement discret. Aucun href dangereux créé.
  if (els.link && els.link.setAttribute) els.link.setAttribute('href', '#');
  if (wrap) wrap.hidden = true;
  if (parsed.raw && parsed.raw.trim() !== '') {
    console.warn(`[Collab-Hub] sound_link ignoré (URL invalide ou protocole non http/https) : ${parsed.raw}`);
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