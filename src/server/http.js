// Primitives HTTP partagées par les handlers serverless Vercel (issue #10).
// Pur (aucun import io / DOM / env) -> testable en Node. Mutualise les
// utilitaires jusqu'ici dupliqués verbatim dans api/control-room/{login,logout,
// session}.js et api/livekit/token.js. Aucune logique métier ici ; les handlers
// restent lisibles et autonomes.
//
// Noms explicites (sendJson / readJsonBody) pour distinguer ces nœuds dans le
// graphe de dépendances des génériques handler()/json() qui brouillaient la
// communauté « Serverless API & Session ».

// Réponse JSON + Content-Type + Cache-Control: no-store + headers optionnels.
// Compatible res Vercel (setHeader/status/end) et res Express-like (json).
// Retourne res pour permettre `return sendJson(res, 405, ...)`.
export function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  }
  if (typeof res.status === 'function') res.status(status);
  else res.statusCode = status;
  if (typeof res.end === 'function') res.end(payload);
  else if (typeof res.json === 'function') res.json(body);
  return res;
}

// Extrait le body JSON de la requête. Vercel parse déjà -> objet ; tests ->
// string/Buffer. Retourne :
//   - l'objet parsé si body est un objet ;
//   - undefined si body est string/Buffer mais JSON invalide (-> 400) ;
//   - null si body est absent (-> 400) ou d'un type inattendu.
export function readJsonBody(req) {
  let body = req.body;
  if (body == null) return null;
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    try { return JSON.parse(body.toString()); } catch { return undefined; }
  }
  if (typeof body === 'object') return body;
  return null;
}