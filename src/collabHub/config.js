// Configuration Collab-Hub centralisée (issue #9). Source unique de l'analyse
// des variables d'env (URL serveur, namespace, mode d'auth, nom d'utilisateur),
// auparavant dupliquée verbatim entre la page publique (src/publicPage.js) et la
// Control Room (src/control-room/controlRoomPage.js).
//
// Pur (aucun import io / DOM) -> testable en Node. Ne change aucune valeur : mêmes
// regex de nettoyage, même défaut de serveur, même préfixe de nom selon l'appelant.
// La résolution d'auth (resolveAuth / resolveAuthMode) reste dans authMode.js ;
// ce helper expose seulement le mode brut lu dans env, chaque appelant décide de
// le passer ou non (le publisher reste anonyme par construction).

const DEFAULT_SERVER_URL = 'https://server.collab-hub.io';

// 'CH-Web' (page publique) | 'CH-CR' (Control Room). Le préfixe identifie l'origine
// côté serveur sans transporter de secret.
export function resolveCollabHubConfig({ env, usernamePrefix = 'CH-Web' }) {
  const serverUrl = (env.VITE_COLLAB_HUB_URL || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const namespace = (env.VITE_COLLAB_HUB_NAMESPACE ?? '').replace(/^\/+|\/+$/g, '');
  const authMode = env.VITE_COLLAB_HUB_AUTH_MODE;
  const username = `${usernamePrefix}_${Math.floor(Math.random() * 1000)}`;
  return { serverUrl, namespace, authMode, username };
}