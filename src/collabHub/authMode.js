// Mode d'authentification Collab-Hub.
// anonymous : socket direct, AUCUNE requête vers /api/v1/auth/guest
//   (mode attendu pour le serveur public v0.3.4, où cette route renvoie 404).
// guest    : tente l'auth invitée puis retombe sur l'anonyme en cas d'échec.

const trimSlash = (s) => (s || '').replace(/\/+$/, '');

// 'anonymous' | 'guest'. Toute autre valeur -> 'anonymous' (safe) + avertissement
// discret, pour ne jamais déclencher de fetch inattendu sur le site public.
export function resolveAuthMode(mode) {
  if (mode === 'guest') return 'guest';
  if (mode && mode !== 'anonymous') {
    console.warn(`[Collab-Hub] auth mode inconnu "${mode}" -> anonyme (sans /api/v1/auth/guest)`);
  }
  return 'anonymous';
}

// En mode anonymous : pas de fetch, on renvoie {} immédiatement.
// En mode guest : POST /api/v1/auth/guest, on prend le token si présent,
// sinon {} (fallback anonyme). fetchImpl injectable pour les tests.
export async function resolveAuth({ serverUrl, username, authMode, fetchImpl = fetch }) {
  if (authMode !== 'guest') return {};
  try {
    const res = await fetchImpl(`${trimSlash(serverUrl)}/api/v1/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.accessToken) return { token: data.accessToken };
    }
  } catch {
    /* réseau/CORS bloqué -> fallback anonyme */
  }
  return {};
}

// Construit l'URL socket (serveur + namespace). Exporté pour les tests.
export function buildSocketUrl(serverUrl, namespace) {
  const ns = (namespace || '').replace(/^\/+|\/+$/g, '');
  return ns ? `${trimSlash(serverUrl)}/${ns}` : trimSlash(serverUrl);
}