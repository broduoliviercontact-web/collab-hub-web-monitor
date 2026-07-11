// Gate d'accès Control Room (Lot 4F.1) — PUR, testable, sans DOM ni LiveKit.
// Machine d'état : unauthenticated -> authenticating -> authenticated (ou error).
// Délègue l'authentification à un `sessionClient` injectable
// ({ login, logout, checkSession } — voir sessionClient.js). Aucune valeur
// secrète : le mot de passe est un paramètre local de login(), jamais stocké,
// jamais dans le snapshot. Le snapshot n'expose que { state, authenticated,
// error, exp }.

export const GATE_STATES = ['unauthenticated', 'authenticating', 'authenticated', 'error'];

export function createControlRoomGate({ sessionClient, now = Date.now } = {}) {
  if (!sessionClient) throw new Error('sessionClient requis.');

  let state = 'unauthenticated';
  let error = null;     // message FR affichable, aucune valeur sensible
  let exp = null;       // timestamp ms d'expiration de session (indicatif)

  const listeners = new Set();

  function snapshot() {
    return {
      state,
      authenticated: state === 'authenticated',
      error,
      exp,
      updatedAt: now(),
    };
  }
  function notify() {
    const snap = snapshot();
    for (const l of listeners) { try { l(snap); } catch {} }
  }
  function setState(next, err = null) {
    state = next;
    error = err;
    notify();
  }

  // login(password) : password paramètre local, jamais conservé.
  async function login(password) {
    setState('authenticating');
    try {
      const res = await sessionClient.login({ password });
      exp = res.expiresIn ? now() + res.expiresIn * 1000 : null;
      setState('authenticated');
      return { ok: true };
    } catch (e) {
      setState('error', (e && e.message) || 'Service d\'authentification indisponible.');
      return { ok: false, error: (e && e.message) || 'Service d\'authentification indisponible.' };
    }
  }

  async function logout() {
    try { await sessionClient.logout(); } catch {}
    exp = null;
    setState('unauthenticated');
    return { ok: true };
  }

  // checkSession : au chargement (rechargement pendant session -> accès conservé).
  // Sur échec réseau/503, reste unauthenticated avec message (login toujours possible).
  async function checkSession() {
    try {
      const res = await sessionClient.checkSession();
      exp = res.authenticated ? (res.exp || null) : null;
      setState(res.authenticated ? 'authenticated' : 'unauthenticated');
      return { ok: true, authenticated: res.authenticated };
    } catch (e) {
      exp = null;
      setState('unauthenticated', (e && e.message) || 'Service d\'authentification indisponible.');
      return { ok: false, authenticated: false };
    }
  }

  // Revenu à l'écran de login avec un message optionnel (expiration, logout externe).
  function reset(reason = null) {
    exp = null;
    setState('unauthenticated', reason);
  }

  function getSnapshot() { return snapshot(); }
  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { login, logout, checkSession, reset, getSnapshot, subscribe, getState: () => state };
}