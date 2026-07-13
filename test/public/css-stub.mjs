// Loader hook pour node:test : les imports .css (ex. publicPage.js -> styles/main.css)
// deviennent des modules vides. Vite gère le CSS dans le build réel ; les tests
// n'ont besoin que du graphe JS. Aucune dépendance ajoutée, aucun changement src.
// Réservé à la suite d'orchestration publicPage (enregistré via module.register
// avant l'import dynamique de publicPage.js).
export async function load(url, context, defaultLoad) {
  if (url.endsWith('.css')) {
    return { format: 'module', source: '', shortCircuit: true };
  }
  return defaultLoad(url, context);
}