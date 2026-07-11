// Stats réseau WebRTC du listener — architecture préparatoire uniquement.
//
// Lot Ops Debug §8 : on ne veut PAS de fausses métriques. Tant qu'aucune
// implémentation fiable (getStats RTCPeerConnection, agrégation multi-pistes,
// gestion du cycle de vie Room) n'est branchée, on renvoie explicitement
// `unsupported`. L'UI affiche « non supporté » plutôt qu'un nombre inventé.
//
// Quand une implémentation fiable sera disponible, remplacer le corps par une
// lecture réelle (ex. room.localParticipant.trackPublication.track.mediaStreamTrack
// -> RTCRtpSender.getStats()). L'API publique (clé `status`) reste stable.

export function getListenerNetworkStats() {
  return { status: 'unsupported' };
}