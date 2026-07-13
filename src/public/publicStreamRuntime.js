// Runtime de flux public (issue #7). Extrait de mountPublicPage().
//
// Responsabilités : état de flux direct (streamStatus), routage des headers
// stream_* (routeStreamControl), carte de flux publique + mini VU (mountStreamCard
// + renderStreamStatus, montés seulement si LiveKit activé), compteur d'auditeurs
// (libellé rendu dans le span détenu par le runtime listener), fraîcheur stale/
// fresh du flux, observation des headers stream_* après (re)connexion, et snapshot
// diagnostic (sans secret) pour le panneau diag.
// Aucune connaissance du socket, du contenu, de la persistance ou de LiveKit :
// `collabApi` et `getCountEl` sont injectés par la racine de composition.
import { STREAM_HEADERS } from '../collabHub/messageRouter.js';
import { createStreamStatus, routeStreamControl } from '../state/streamStatus.js';
import { renderStreamStatus, mountStreamCard } from '../ui/streamStatusView.js';

export function createStreamRuntime({ doc, card, enabled, debug, now, getCountEl, dbg = () => {} }) {
  // La logique métier flux (streamStatus, observation, routage, carte de flux) ne
  // s'active que si LiveKit est activé. Hors debug, la carte publique n'est pas
  // montée — « ÉCOUTER LE DIRECT » reste l'entrée principale, aucun DOM de flux créé.
  let streamStatus = null;
  let streamEls = null;
  let streamAnchor = card;
  // Lot 5 (partie B) : le libellé du compteur d'auditeurs n'est réécrit que s'il
  // change (discrétion aria-live polite -> pas de réannonce à chaque tick).
  let lastListenerCountLabel = null;

  if (enabled) {
    streamStatus = createStreamStatus({ now });
    const mounted = mountStreamCard(doc, card, { debug, livekitEnabled: enabled, streamStatus });
    if (mounted) {
      streamEls = mounted.els;
      streamAnchor = mounted.section; // la section listener se monte APRÈS ce bloc
    }
  }

  return {
    getAnchor: () => streamAnchor,
    hasStatus: () => streamStatus !== null,
    // Rend le statut de flux + le compteur d'auditeurs. Appelé à chaque header de
    // flux reçu et à chaque tick 1 s (un état peut devenir STALE sans nouveau
    // header -> STATUT INDISPONIBLE / « Auditeurs : — »).
    render() {
      if (!streamStatus) return;
      const snap = streamStatus.getSnapshot();
      if (streamEls) renderStreamStatus(snap, streamEls);
      const countEl = getCountEl();
      if (countEl && snap.listenerCountLabel !== lastListenerCountLabel) {
        countEl.textContent = snap.listenerCountLabel;
        lastListenerCountLabel = snap.listenerCountLabel;
      }
    },
    // Ingest un header de flux reçu. Retourne true si data était un header stream_*
    // (et l'a routé vers streamStatus), false sinon (la racine poursuit vers le
    // routage contenu/heartbeat). Aucun secret transporté.
    ingest(data) {
      if (!streamStatus || !data || !STREAM_HEADERS.includes(data.header)) return false;
      routeStreamControl(data, streamStatus);
      return true;
    },
    // Observe les headers de flux (Lot 4G) après (re)connexion. Idempotent via le
    // guard de socketClient (réémis une fois par socket.id après vrai disconnect).
    observeHeaders(collabApi) {
      if (!collabApi || !streamStatus) return;
      for (const h of STREAM_HEADERS) {
        try { const ok = collabApi.observeHeaderOnce(h); if (ok) dbg('observe stream header', h); } catch { /* guard idempotent */ }
      }
    },
    // Snapshot diagnostic (sans secret) bâti pour le panneau diag.
    diagSnapshot(collabApi) {
      if (!streamStatus) return null;
      return {
        ...streamStatus.getSnapshot(),
        ...streamStatus.getDiagnostics(),
        observedStreamHeaders: collabApi ? STREAM_HEADERS.filter((h) => collabApi.isObserved(h)) : [],
      };
    },
  };
}