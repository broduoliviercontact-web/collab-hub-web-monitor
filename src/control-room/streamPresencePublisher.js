// Publisher de présence du flux direct (Lot 4G) côté Control Room. Publie un
// état LÉGER sur Collab-Hub (4 headers publics) pour que la page publique puisse
// afficher EN DIRECT / HORS ANTENNE / STATUT INDISPONIBLE + mini VU-mètre AVANT
// toute connexion LiveKit.
//
// Entièrement injectable (now, throttleMs, emitter) -> testable en Node sans
// socket ni navigateur. `emitter` expose publish(header, values) ; un emitter
// no-op (publish = () => {}) désactive proprement la publication (ex. Collab-Hub
// non configuré) sans casser le reste de la Control Room.
//
// Aucun secret, token, cookie ou mot de passe : on ne publie que des niveaux
// audio normalisés (0..1), un booléen onair et un timestamp epoch ms public.
//
// Sémantique (spec Lot 4G) :
//   stream_onair      = 1 uniquement si publisher.state === live (snapshot.onAir)
//   stream_level       = RMS normalisé 0..1 (0 si hors antenne)
//   stream_peak        = peak normalisé 0..1 (0 si hors antenne)
//   stream_updated_at  = timestamp epoch ms au moment de la publication
//
// Cadence : transition onair (start/stop) publiée IMMÉDIATEMENT (hors throttle) ;
// level/peak publiés au plus toutes les `throttleMs` (défaut 400 ms) — jamais à
// chaque frame. À l'arrêt : onair=0, level=0, peak=0, updatedAt mis à jour.

import { clamp01 } from '../state/streamStatus.js';

export const DEFAULT_STREAM_THROTTLE_MS = 400;

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
  let lastPublishedAt = null;   // epoch ms de la dernière publication
  let publishCount = 0;

  function emit(onAir, level, peak) {
    const t = now();
    publishFn('stream_onair', [onAir]);
    publishFn('stream_level', [level]);
    publishFn('stream_peak', [peak]);
    publishFn('stream_updated_at', [t]);
    publishedOnAir = onAir;
    publishedLevel = level;
    publishedPeak = peak;
    lastPublishedAt = t;
    publishCount++;
  }

  // Met à jour depuis un snapshot Control Room + une lecture meter.
  // Publie immédiatement sur transition onair, sinon au rythme du throttle.
  // N'envoie rien à chaque frame : le throttle limite à une publication par
  // fenêtre, sauf transition d'antenne (start/stop) qui force l'envoi.
  function update(snapshot, meter) {
    const onAir = snapshot && snapshot.onAir ? 1 : 0;
    const m = meter && typeof meter === 'object' ? meter : null;
    const level = onAir ? clamp01(m ? m.rms : 0) : 0;
    const peak = onAir ? clamp01(m ? m.peak : 0) : 0;
    const t = now();
    const transition = publishedOnAir !== onAir;
    const due = lastPublishedAt === null || (t - lastPublishedAt) >= throttleMs;
    if (transition || due) emit(onAir, level, peak);
  }

  // Arrêt immédiat : reset à 0 (onair=0, level=0, peak=0, updatedAt=now). Forcé
  // hors throttle pour que la page publique passe à HORS ANTENNE sans attendre.
  function stop() {
    emit(0, 0, 0);
  }

  function getDiagnostics() {
    return {
      lastPublishedAt,
      publishedOnAir,
      publishedLevel,
      publishedPeak,
      publishCount,
      throttleMs,
    };
  }

  return { update, stop, getDiagnostics };
}