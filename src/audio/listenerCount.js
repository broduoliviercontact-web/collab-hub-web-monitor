// Compteur public d'auditeurs LiveKit (Lot 5, partie B). Pur, injectable,
// testable en Node sans livekit-client ni navigateur.
//
// Source de vérité : la Control Room (performer) compte les participants
// DISTANTS de sa Room LiveKit dont l'identity commence par "listener-". On ne
// compte JAMAIS le performer local, ni un second performer, ni un participant
// non-auditeur. Chaque onglet/device = un auditeur distinct.
//
// SÉCURITÉ : cette fonction ne renvoie qu'un NOMBRE. Elle n'expose JAMAIS
// d'identité, de SID, de token ou de métadonnée d'auditeur — seulement le
// compte. Aucune identité n'est lue hors du test de préfixe "listener-".
//
// Accepte plusieurs formes pour `remoteParticipants` :
//   - une Map LiveKit (room.remoteParticipants) -> on itère .values() ;
//   - une collection itérable (Array, Set, générateur) ;
//   - un objet plat clé->participant (ex. test : { s1: { identity: 'listener-1' } }) ;
//   - un seul objet participant ({ identity: 'listener-1' }).
// Retourne TOUJOURS un entier sûr >= 0.

export const LISTENER_IDENTITY_PREFIX = 'listener-';

// Normalise l'entrée en un tableau de participants (chacun avec .identity).
function toParticipants(remoteParticipants) {
  if (remoteParticipants == null) return [];
  // Map LiveKit : possède .values() ET .get().
  if (typeof remoteParticipants.values === 'function' && typeof remoteParticipants.get === 'function') {
    return Array.from(remoteParticipants.values());
  }
  // Collection itérable (Array, Set, générateur). Map aussi itérable mais le
  // branch Map ci-dessus la capture en premier.
  if (typeof remoteParticipants[Symbol.iterator] === 'function') {
    return Array.from(remoteParticipants);
  }
  // Objet plat : soit un seul participant (possède .identity), soit un dictionnaire
  // clé->participant.
  if (typeof remoteParticipants === 'object') {
    if ('identity' in remoteParticipants) return [remoteParticipants];
    return Object.values(remoteParticipants).filter((v) => v && typeof v === 'object');
  }
  return [];
}

// Compte les auditeurs distants (identity commençant par "listener-").
// Entier sûr >= 0 quoi qu'il arrive.
export function countLiveListeners(remoteParticipants) {
  const participants = toParticipants(remoteParticipants);
  let count = 0;
  for (const p of participants) {
    if (p && typeof p.identity === 'string' && p.identity.startsWith(LISTENER_IDENTITY_PREFIX)) {
      count++;
    }
  }
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}