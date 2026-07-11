// Publisher de présence du flux direct (Lot 4G + Lot 5 partie B) côté Control
// Room. Publie un état LÉGER sur Collab-Hub (5 headers publics) pour que la page
// publique puisse afficher EN DIRECT / HORS ANTENNE / STATUT INDISPONIBLE + mini
// VU-mètre + compteur d'auditeurs AVANT toute connexion LiveKit côté public.
//
// Entièrement injectable (now, throttleMs, emitter) -> testable en Node sans
// socket ni navigateur. `emitter` expose publish(header, values) ; un emitter
// no-op (publish = () => {}) désactive proprement la publication (ex. Collab-Hub
// non configuré) sans casser le reste de la Control Room.
//
// Aucun secret, token, cookie ou mot de passe : on ne publie que des niveaux
// audio normalisés (0..1), un booléen onair, un timestamp epoch ms public et un
// NOMBRE d'auditeurs (aucune identité/SID d'auditeur n'est jamais publiée).
//
// Sémantique (spec Lot 4G + Lot 5) :
//   stream_onair          = 1 uniquement si publisher.state === live (snapshot.onAir)
//   stream_level          = RMS normalisé 0..1 (0 si hors antenne)
//   stream_peak           = peak normalisé 0..1 (0 si hors antenne)
//   stream_updated_at     = timestamp epoch ms au moment de la publication
//   stream_listener_count = nombre d'auditeurs distants (snapshot.liveListenerCount,
//                           0 si hors antenne). Aucune identité publiée.
//
// Cadence : transition onair (start/stop) ET changement du compteur d'auditeurs
// publiées IMMÉDIATEMENT (hors throttle) ; level/peak publiés au plus toutes les
// `throttleMs` (défaut 400 ms) — jamais à chaque frame. À l'arrêt : onair=0,
// level=0, peak=0, listener_count=0, updatedAt mis à jour. On évite toute
// publication superflue quand le compteur est stable (pas à chaque frame VU).

import { clamp01 } from '../state/streamStatus.js';

export const DEFAULT_STREAM_THROTTLE_MS = 400;

// Entier sûr >= 0 depuis une valeur de compteur (défensif : snapshot invalide).
function toCount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function createStreamPresencePublisher({
  now = Date.now,
  throttleMs = DEFAULT_STREAM_THROTTLE_MS,
  emitter = null,
} = {}) {
  const publishFn = emitter && typeof emitter.publish === 'function'
    ? emitter.publish
    : () => {}; // no-op safe si Collab-Hub non configuré.

  let publishedOnAir = null;   // 1 | 0 | null (jamais publié)
  let publishedLevel = 0;
  let publishedPeak = 0;
  let publishedListenerCount = null; // dernier compteur publié (entier >= 0)
  let lastPublishedAt = null;   // epoch ms de la dernière publication
  let publishCount = 0;
  let lastListenerCountPublishedAt = null; // epoch ms du dernier changement de compteur publié
  let listenerCountPublishCount = 0;       // nb de publications liées à un changement de compteur

  function emit(onAir, level, peak, listenerCount) {
    const t = now();
    publishFn('stream_onair', [onAir]);
    publishFn('stream_level', [level]);
    publishFn('stream_peak', [peak]);
    publishFn('stream_updated_at', [t]);
    publishFn('stream_listener_count', [listenerCount]);
    publishedOnAir = onAir;
    publishedLevel = level;
    publishedPeak = peak;
    // On suit le compteur séparément : un changement de compteur est une
    // transition qui force une publication immédiate (hors throttle).
    if (publishedListenerCount !== listenerCount) {
      publishedListenerCount = listenerCount;
      lastListenerCountPublishedAt = t;
      listenerCountPublishCount++;
    }
    lastPublishedAt = t;
    publishCount++;
  }

  // Met à jour depuis un snapshot Control Room + une lecture meter.
  // Publie immédiatement sur transition onair ou changement du compteur
  // d'auditeurs (en antenne), sinon au rythme du throttle. N'envoie rien à
  // chaque frame : le throttle limite à une publication par fenêtre, sauf
  // transition d'antenne (start/stop) ou variation du nombre d'auditeurs.
  function update(snapshot, meter) {
    const onAir = snapshot && snapshot.onAir ? 1 : 0;
    const m = meter && typeof meter === 'object' ? meter : null;
    const level = onAir ? clamp01(m ? m.rms : 0) : 0;
    const peak = onAir ? clamp01(m ? m.peak : 0) : 0;
    // Hors antenne -> 0 auditeur (on ne publie jamais un ancien compte en HORS
    // ANTENNE). En antenne -> compte courant du snapshot LiveKit.
    const liveListenerCount = onAir ? toCount(snapshot && snapshot.liveListenerCount) : 0;
    const t = now();
    const onAirTransition = publishedOnAir !== onAir;
    // Un changement de compteur n'est une transition que pendant la diffusion
    // (hors antenne, le compteur est forcé à 0 et couvert par onAirTransition).
    const countChanged = onAir && publishedListenerCount !== liveListenerCount;
    const due = lastPublishedAt === null || (t - lastPublishedAt) >= throttleMs;
    if (onAirTransition || countChanged || due) {
      emit(onAir, level, peak, liveListenerCount);
    }
  }

  // Arrêt immédiat : reset à 0 (onair=0, level=0, peak=0, listener_count=0,
  // updatedAt=now). Forcé hors throttle pour que la page publique passe à
  // HORS ANTENNE + 0 auditeur sans attendre.
  function stop() {
    emit(0, 0, 0, 0);
  }

  function getDiagnostics() {
    return {
      lastPublishedAt,
      publishedOnAir,
      publishedLevel,
      publishedPeak,
      lastPublishedListenerCount: publishedListenerCount,
      lastListenerCountPublishedAt,
      listenerCountPublishCount,
      publishCount,
      throttleMs,
    };
  }

  return { update, stop, getDiagnostics };
}