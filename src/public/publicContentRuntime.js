// Runtime de contenu public (issue #7). Extrait de mountPublicPage().
//
// Responsabilités : état des 6 champs sound_* (createSoundState), rendu du
// contenu (renderField + flashElement), persistance locale (load/save/clear),
// fraîcheur contenu Max (createFreshnessState : onContentUpdate, onHeartbeat,
// restoreContent, isContentFresh, isMaxActive, setServerStatus), et notification
// de changement (retour du timestamp sauvegardé pour le diagnostic).
// Aucune connaissance du socket, de LiveKit, du flux ou du panneau diag : le
// runtime expose `freshness` (consommé par la racine pour le statut public + le
// diag) et un `clear()` (bouton « effacer » du diag).
import { routeControl, KNOWN_HEADERS, HEARTBEAT_HEADER } from '../collabHub/messageRouter.js';
import { createSoundState, DEFAULTS } from '../state/soundState.js';
import { renderField, flashElement, fieldElementKey } from '../ui/renderSoundInfo.js';
import { loadSoundState, saveSoundState, clearSoundState } from '../state/persist.js';
import { createFreshnessState } from '../state/freshness.js';

export function createContentRuntime({ doc, els, storage, now }) {
  // --- Restauration locale (Lot 3A) : dernier contenu reçu, sinon défauts ---
  const restored = loadSoundState(storage);
  const initial = restored ? { ...DEFAULTS, ...restored.fields } : DEFAULTS;
  const state = createSoundState(initial);
  for (const h of KNOWN_HEADERS) renderField(h, state.get(h), els, doc);

  let lastSavedAt = restored ? restored.updatedAt : null;
  let lastLocalRestore = restored ? restored.updatedAt : null;

  // --- État technique de fraîcheur (Lot 3B) ---
  // `now` injecté (défaut Date.now) -> testable en Node sans horloge réelle.
  const freshness = createFreshnessState({ now });
  if (restored && restored.updatedAt) {
    const ms = new Date(restored.updatedAt).getTime();
    if (Number.isFinite(ms)) freshness.restoreContent(ms);
  }

  return {
    freshness,
    getInitialSavedAt: () => lastSavedAt,
    getInitialRestore: () => lastLocalRestore,
    // Rejoue une valeur déjà connue, sans persister ni affecter la fraîcheur.
    // Utilisé lorsqu'un sound_link_visible repasse à true.
    rerender(header) {
      if (!KNOWN_HEADERS.includes(header)) return false;
      renderField(header, state.get(header), els, doc);
      return true;
    },
    // Applique un header de contenu (sound_* via routeControl, ou heartbeat).
    // Rend le champ, rafraîchit la fraîcheur contenu, persiste. Retourne le
    // timestamp sauvegardé (ou null si heartbeat / non routé / sauvegarde
    // échouée) pour le forwarding diagnostic (diag.setLocalSaved).
    applyControl(data) {
      if (data && data.header === HEARTBEAT_HEADER) {
        freshness.onHeartbeat();
        return null;
      }
      const routed = routeControl(data, (header, value) => {
        state.set(header, value);
        renderField(header, value, els, doc);
        const key = fieldElementKey(header);
        if (key) flashElement(els[key]);
      });
      if (routed) {
        freshness.onContentUpdate();
        const saved = saveSoundState(storage, state.snapshot());
        if (saved) {
          lastSavedAt = saved.updatedAt;
          return saved.updatedAt;
        }
      }
      return null;
    },
    // Bouton « effacer » du panneau diag : supprime la persistance et réinitialise
    // les marqueurs de sauvegarde/restauration.
    clear() {
      const ok = clearSoundState(storage);
      if (ok) { lastSavedAt = null; lastLocalRestore = null; }
      return ok;
    },
  };
}
