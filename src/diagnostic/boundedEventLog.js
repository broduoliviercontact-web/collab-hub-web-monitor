// Journal d'événements borné (ring buffer) pour le panneau d'exploitation.
// Pur, injectable (now), sans DOM ni innerHTML -> testable en Node.
//
// Raison du lot Ops Debug : le log événementnel précédent reconstruisait
// textContent à chaque entrée par concaténation (croissance non bornée + O(n)
// par ajout). On le remplace par un ring buffer capé à `maxEntries` (défaut 200)
// qui ne conserve que les N dernières entrées. Le rendu DOM (textContent) est
// recalculé uniquement depuis getEntries() -> taille constante, jamais infinie.
//
// Sémantique :
//   - add(entry)      : ajoute une entrée en TÊTE (newest first), comme le
//                       comportement précédent (prepend). Coupe le surplus en
//                       queue (plus ancien). `totalCount` augmente à chaque add
//                       (même quand on déborde) -> compteur cumulé d'événements
//                       reçus, indépendant de la fenêtre conservée.
//   - clear()         : vide UNIQUEMENT les entrées conservées. `totalCount`
//                       (événements reçus) n'est PAS remis à zéro.
//   - getEntries()    : tableau (newest first), copie défensive.
//   - getTotalCount() : nombre cumulé d'événements reçus (jamais remis à zéro
//                       par clear).
//   - getSnapshot()   : { entries, count, totalCount, maxEntries }.

export const DEFAULT_MAX_ENTRIES = 200;

export function createBoundedEventLog({ maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
  const cap = Math.max(1, Math.floor(Number(maxEntries)) || DEFAULT_MAX_ENTRIES);
  let entries = []; // newest first (head = entrée la plus récente)
  let totalCount = 0;

  function add(entry) {
    if (entry === null || entry === undefined) return;
    const line = typeof entry === 'string' ? entry : String(entry);
    totalCount++;
    entries.unshift(line); // prepend (comportement historique conservé)
    if (entries.length > cap) entries.length = cap; // coupe le plus ancien (queue)
  }

  // Vide les entrées conservées SANS toucher au compteur cumulé d'événements reçus.
  function clear() {
    entries = [];
  }

  function getEntries() {
    return entries.slice();
  }

  function getTotalCount() {
    return totalCount;
  }

  function getSnapshot() {
    return {
      entries: entries.slice(),
      count: entries.length,
      totalCount,
      maxEntries: cap,
    };
  }

  return { add, clear, getEntries, getTotalCount, getSnapshot };
}