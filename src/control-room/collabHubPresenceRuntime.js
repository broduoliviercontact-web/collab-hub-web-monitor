// Runtime présence Collab-Hub (issue #8). Extrait de mountControlRoom().
//
// Connexion Collab-Hub en mode publication (même serveur/namespace que la page
// publique, préfixe CH-CR, auth anonyme : publie des headers de présence flux
// publics, aucun token guest nécessaire). `streamPublisher` est créé
// synchronement (consommé immédiatement par le tick du VU-mètre et onSnapshot) ;
// la connexion résout en asynchrone -> l'emitter est branché alors. Avant
// résolution, la publication est désactivée propre (no-op) : le reste fonctionne.
// Aucun secret (valeurs publiques : onair, level, peak, timestamp, compte).
//
// Issue #9 : configuration Collab-Hub centralisée dans collabHub/config.js
// (source unique partagée avec la page publique).

import { connectCollabHubPublisher } from '../collabHub/publishClient.js';
import { resolveCollabHubConfig } from '../collabHub/config.js';
import { createStreamPresencePublisher } from './streamPresencePublisher.js';

function defaultConnect(opts) { return connectCollabHubPublisher(opts); }

export function createCollabHubPresenceRuntime({
  env, debug = false, now = Date.now, connect = defaultConnect,
} = {}) {
  const chCfg = resolveCollabHubConfig({ env, usernamePrefix: 'CH-CR' });
  let streamConn = null;                     // connexion Collab-Hub (pour destroy)
  const emitterRef = { current: null };      // {publish} branché à la connexion
  const streamEmitter = {
    publish(header, values) {
      const e = emitterRef.current;
      if (e && typeof e.publish === 'function') e.publish(header, values);
    },
  };
  const streamPublisher = createStreamPresencePublisher({ now, emitter: streamEmitter });
  connect({ serverUrl: chCfg.serverUrl, namespace: chCfg.namespace, username: chCfg.username, debug })
    .then((c) => { streamConn = c; emitterRef.current = { publish: c.publish }; })
    .catch((e) => { console.warn('[Control Room] publication flux Collab-Hub désactivée :', e && e.message); });

  return {
    streamPublisher,
    getConn: () => streamConn,
    // Teardown : stoppe la publication + ferme la socket si résolue. Idempotent
    // (appels multiples sûrs). Recopié verbatim de l'ancien beforeunload/destroy.
    destroy() {
      try { streamPublisher.stop(); } catch {}
      try { if (streamConn) streamConn.destroy(); } catch {}
    },
  };
}