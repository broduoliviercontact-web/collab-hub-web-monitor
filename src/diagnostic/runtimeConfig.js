// Configuration runtime non sensible pour le panneau d'exploitation. PUR et
// injectable (env, build, location passés en arguments -> testable en Node, sans
// import.meta.env) -> aucun secret lu directement ici.
//
// Règle absolue (Lot Ops Debug §1/§4) : on n'expose JAMAIS token, API key, API
// secret, password, cookie ou session secret. On n'expose que des données
// publiques : version, SHA git, timestamp de build, env Vercel, flags publics
// VITE_LIVEKIT_ENABLED / VITE_PUBLIC_DEBUG_ENABLED, URL + namespace Collab-Hub,
// mode d'auth, et l'URL LiveKit RÉDUITE au host (sans query ni token).
//
// `—` pour toute valeur indisponible.

// Réduit une URL LiveKit (wss://…) à son host seul : on retire TOUT (chemin,
// query, fragment) -> aucun token n'apparaît jamais. Invalide/vide -> '—'.
export function redactLiveKitUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return '—';
  try {
    const u = new URL(url.trim());
    return u.host || '—';
  } catch {
    return '—';
  }
}

// `env`   : import.meta.env (ou stub de test) — vars publiques VITE_*.
// `build` : { version, gitCommitSha, buildTimestamp, vercelEnv, livekitUrl }
//           injectés au build (vite.config define) — aucune donnée secrète.
export function buildRuntimeConfig({ env = {}, build = {} } = {}) {
  const v = env || {};
  const b = build || {};
  return {
    version: b.version || '—',
    gitCommitSha: b.gitCommitSha || '—',
    buildTimestamp: b.buildTimestamp || '—',
    vercelEnv: b.vercelEnv || '—',
    livekitEnabled: v.VITE_LIVEKIT_ENABLED === 'true',
    publicDebugEnabled: v.VITE_PUBLIC_DEBUG_ENABLED === 'true',
    collabHubUrl: v.VITE_COLLAB_HUB_URL || '—',
    collabHubNamespace: v.VITE_COLLAB_HUB_NAMESPACE || '—',
    authMode: v.VITE_COLLAB_HUB_AUTH_MODE || '—',
    livekitUrl: redactLiveKitUrl(b.livekitUrl || v.VITE_LIVEKIT_URL || ''),
  };
}