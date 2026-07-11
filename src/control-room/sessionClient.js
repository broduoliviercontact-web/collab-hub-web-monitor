// Client des endpoints de session Control Room (Lot 4F.1). Pur vis-à-vis du
// transport : `fetchImpl` injectable (fetch en prod, faux en tests). Same-origin,
// credentials:'same-origin' (le cookie de session accompagne chaque requête).
//
// Aucune valeur secrète n'est logguée. Le mot de passe n'est envoyé qu'au login,
// jamais conservé au-delà de l'appel (l'appelant vide l'<input>).

export const LOGIN_PATH = '/api/control-room/login';
export const LOGOUT_PATH = '/api/control-room/logout';
export const SESSION_PATH = '/api/control-room/session';
export const DEFAULT_TIMEOUT_MS = 8000;

export const SESSION_ERRORS = {
  unauthorized: 'session_unauthorized',
  unavailable: 'session_unavailable',
  network: 'session_network',
  timeout: 'session_timeout',
  failed: 'session_failed',
};

// Messages FR affichables (n'ont aucune valeur sensible). Le gate les remonte tels.
export const SESSION_ERROR_MESSAGES = {
  session_unauthorized: 'Mot de passe incorrect.',
  session_unavailable: 'Service d\'authentification indisponible.',
  session_network: 'Erreur réseau.',
  session_timeout: 'Délai dépassé.',
  session_failed: 'Service d\'authentification indisponible.',
};

function makeError(code) {
  return { code, message: SESSION_ERROR_MESSAGES[code] || SESSION_ERROR_MESSAGES.session_failed };
}

async function doFetch({ fetchImpl, path, method, body, timeoutMs, AbortControllerImpl }) {
  const Controller = AbortControllerImpl || (typeof AbortController !== 'undefined' ? AbortController : null);
  const controller = Controller ? new Controller() : null;
  const timer = controller ? setTimeout(() => { try { controller.abort(); } catch {} }, timeoutMs) : null;
  let res;
  try {
    const fetchFn = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) throw makeError(SESSION_ERRORS.network);
    res = await fetchFn(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller ? controller.signal : undefined,
    });
  } catch (e) {
    if (e && e.code) throw e;
    if (e && (e.name === 'AbortError' || e.name === 'TimeoutError')) throw makeError(SESSION_ERRORS.timeout);
    throw makeError(SESSION_ERRORS.network);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return res;
}

// POST /login {password}. Retourne { authenticated, expiresIn } ou lève une
// erreur normalisée (401 -> session_unauthorized, 503 -> session_unavailable).
export async function login({ password, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const res = await doFetch({ fetchImpl, path: LOGIN_PATH, method: 'POST', body: { password }, timeoutMs });
  if (res.status === 401) throw makeError(SESSION_ERRORS.unauthorized);
  if (res.status === 503) throw makeError(SESSION_ERRORS.unavailable);
  let json;
  try { json = await res.json(); } catch { throw makeError(SESSION_ERRORS.failed); }
  if (!res.ok || !json.authenticated) throw makeError(SESSION_ERRORS.failed);
  return { authenticated: true, expiresIn: typeof json.expiresIn === 'number' ? json.expiresIn : null };
}

// POST /logout. Retourne { authenticated: false }. Non fatal si échec.
export async function logout({ fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    await doFetch({ fetchImpl, path: LOGOUT_PATH, method: 'POST', body: {}, timeoutMs });
  } catch { /* logout best-effort côté client */ }
  return { authenticated: false };
}

// GET /session. Retourne { authenticated, exp } sans lever (une session absente
// est un état normal, pas une erreur). Lève seulement sur réseau/503.
export async function checkSession({ fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const res = await doFetch({ fetchImpl, path: SESSION_PATH, method: 'GET', timeoutMs });
  if (res.status === 503) throw makeError(SESSION_ERRORS.unavailable);
  let json;
  try { json = await res.json(); } catch { throw makeError(SESSION_ERRORS.failed); }
  if (!res.ok) return { authenticated: false };
  return { authenticated: !!json.authenticated, exp: typeof json.exp === 'number' ? json.exp : null };
}