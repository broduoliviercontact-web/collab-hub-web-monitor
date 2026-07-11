// Portes d'activation du debug (Lot Ops Debug §1). Pures -> testables.
//
// debug public (page publique /?debug=1) : monté SI ?debug=1 ET la variable
// build publique VITE_PUBLIC_DEBUG_ENABLED vaut exactement 'true'. En production
// la variable est false par défaut -> aucun panneau monté, même avec ?debug=1.
//
// debug Control Room (/control-room?debug=1) : monté SI ?debug=1 ET la session
// performer est valide (authentifiée). La page Control Room elle-même n'est
// chargée qu'après authentification (gate) -> le debug performer n'existe jamais
// avant une session valide.
//
// Aucune route debug ne doit exposer token/cookie/password/secret/identity
// complète (appliqué côté panneau + sanitizer d'export).

export function shouldMountPublicDebug({ debugParam, publicDebugEnabled } = {}) {
  return debugParam === '1' && publicDebugEnabled === true;
}

export function controlRoomDebugAllowed({ authenticated, debugParam } = {}) {
  return authenticated === true && debugParam === '1';
}