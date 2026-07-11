// Client du endpoint token LiveKit (Lot 4C / 4F.1). Pur vis-à-vis du transport :
// `fetchImpl` injectable (fetch en prod, faux en tests). Same-origin, POST JSON,
// timeout via AbortController, validation stricte, erreurs normalisées.
//
// Lot 4F.1 : le performer s'authentifie via le cookie de session Control Room
// (same-origin, credentials:'same-origin') — aucun mot de passe n'est envoyé dans
// le corps. Le listener n'a pas besoin de session. Le token n'est JAMAIS loggué.

export const TOKEN_PATH = '/api/livekit/token';
export const DEFAULT_TIMEOUT_MS = 8000;

export const TOKEN_ERRORS = {
  unauthorized: 'token_unauthorized',
  unavailable: 'token_unavailable',
  invalid_response: 'token_invalid_response',
  network_error: 'token_network_error',
  timeout: 'token_timeout',
  failed: 'token_failed',
};

function err(code, message) {
  return { code, message };
}

// Rôle invalide -> rejeté AVANT tout fetch (pas d'appel réseau).
export async function requestLiveKitToken({
  role,
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  path = TOKEN_PATH,
  AbortControllerImpl,
} = {}) {
  if (role !== 'performer' && role !== 'listener') {
    throw err(TOKEN_ERRORS.failed, 'Rôle invalide.');
  }

  // Lot 4F.1 : corps réduit à { role }. Le performer est authentifié côté serveur
  // par le cookie de session (credentials:'same-origin'). Aucun mot de passe.
  const body = { role };
  const Controller = AbortControllerImpl || (typeof AbortController !== 'undefined' ? AbortController : null);
  const controller = Controller ? new Controller() : null;
  const timer = controller ? setTimeout(() => { try { controller.abort(); } catch {} }, timeoutMs) : null;

  let res;
  try {
    const fetchFn = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) throw err(TOKEN_ERRORS.network_error, 'fetch indisponible.');
    res = await fetchFn(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    });
  } catch (e) {
    if (e && e.code) throw e; // erreur déjà normalisée
    if (e && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
      throw err(TOKEN_ERRORS.timeout, 'Délai dépassé.');
    }
    throw err(TOKEN_ERRORS.network_error, 'Erreur réseau.');
  } finally {
    if (timer) clearTimeout(timer);
  }

  // Statut d'erreur serveur -> codes normalisés.
  if (res.status === 401) throw err(TOKEN_ERRORS.unauthorized, 'Non autorisé.');
  if (res.status === 503) throw err(TOKEN_ERRORS.unavailable, 'LiveKit indisponible.');

  // Corps JSON.
  let json;
  try {
    json = await res.json();
  } catch {
    throw err(TOKEN_ERRORS.invalid_response, 'Réponse non JSON.');
  }
  if (!res.ok) {
    throw err(TOKEN_ERRORS.failed, `Échec token (HTTP ${res.status}).`);
  }

  // Validation stricte des champs attendus.
  if (typeof json.token !== 'string' || !json.token) {
    throw err(TOKEN_ERRORS.invalid_response, 'Token absent.');
  }
  if (typeof json.url !== 'string' || !json.url) {
    throw err(TOKEN_ERRORS.invalid_response, 'URL LiveKit absente.');
  }
  if (typeof json.room !== 'string' || !json.room) {
    throw err(TOKEN_ERRORS.invalid_response, 'Room absente.');
  }
  if (typeof json.identity !== 'string' || !json.identity) {
    throw err(TOKEN_ERRORS.invalid_response, 'Identity absente.');
  }
  if (json.role !== role) {
    throw err(TOKEN_ERRORS.invalid_response, 'Rôle de la réponse inattendu.');
  }

  return {
    token: json.token,
    url: json.url,
    room: json.room,
    identity: json.identity,
    role: json.role,
    expiresIn: typeof json.expiresIn === 'number' ? json.expiresIn : null,
  };
}