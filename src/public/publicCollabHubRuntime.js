import {
  IMAGE_HEADERS, KNOWN_HEADERS, SHOW_NAME_POSITION_HEADERS, TEXT_VISIBILITY_HEADERS,
} from '../collabHub/messageRouter.js';

// Runtime Collab-Hub public (issue #7). Extrait de mountPublicPage().
//
// Responsabilités : connexion socket (connect injectée), dispatch de routage des
// messages (handleControl sound_*/stream_*/heartbeat, handleStatus), déclenchement
// de l'observation des headers de flux après (re)connexion (guard idempotent côté
// socketClient), suivi du statut de connexion, et fermeture socket pour le teardown.
// Ne rend pas la page (recomputePublicState/renderStreamState sont des callbacks
// injectés), ne connaît pas LiveKit, ne gère pas la persistance métier (déléguée
// au runtime contenu). Les snapshots diag sont bâtis par les runtime stream/listener
// via collab.getApi() ; le montage diag est orchestré par la racine via onConnected.
const LEGACY_VISUAL_HEADERS = new Set([
  ...KNOWN_HEADERS,
  ...IMAGE_HEADERS,
  ...SHOW_NAME_POSITION_HEADERS,
  ...TEXT_VISIBILITY_HEADERS,
]);

export function createCollabHubRuntime({
  connect, serverUrl, namespace, username, authMode,
  stream, content, image, showNamePosition, textVisibility, blocks, diag, dbg = () => {},
  recomputePublicState, renderStreamState, syncProgramCardVisibility = () => {}, onConnected = () => {}, onError,
}) {
  let collabApi = null;
  let connStatus = null;

  // Dispatch de routage d'un message de contrôle. Headers stream_* -> runtime
  // flux (avant tout routeControl, qui n'accepte que les 6 contenus) ; sinon
  // contenu (sound_* ou heartbeat). Aucun secret transporté.
  function handleControl(data) {
    if (stream.ingest(data)) {
      dbg('received stream control', data.header, data.values);
      renderStreamState();
      recomputePublicState();
      diag.logControl(data);
      diag.refreshStream();
      return;
    }
    const blockResult = blocks?.applyControl(data);
    if (blockResult?.handled) {
      if (blockResult.contentChanged) content.markExternalContentUpdate();
      syncProgramCardVisibility();
      if (blockResult.valid) dbg('received v2 block control', data.header, data.values);
      else dbg('ignored invalid v2 block control', data.header, data.values, blockResult.reason);
      diag.logControl(data);
      recomputePublicState();
      diag.refreshFreshness(content.freshness);
      return;
    }
    if (blocks?.isActive() && LEGACY_VISUAL_HEADERS.has(data?.header)) {
      dbg('ignored legacy visual control after v2 activation', data.header);
      diag.logControl(data);
      return;
    }
    if (image && image.applyControl(data)) {
      syncProgramCardVisibility();
      dbg('received image control', data.header, data.values);
      diag.logControl(data);
      return;
    }
    if (showNamePosition && showNamePosition.applyControl(data)) {
      syncProgramCardVisibility();
      dbg('received show name position control', data.header, data.values);
      diag.logControl(data);
      return;
    }
    if (textVisibility && textVisibility.applyControl(data, content.rerender)) {
      syncProgramCardVisibility();
      dbg('received text visibility control', data.header, data.values);
      diag.logControl(data);
      return;
    }
    // applyControl rend, rafraîchit la fraîcheur, persiste ; retourne le timestamp
    // sauvegardé (null si heartbeat / non routé / sauvegarde échouée).
    const savedAt = content.applyControl(data);
    if (textVisibility) textVisibility.applyForContent(data?.header);
    syncProgramCardVisibility();
    if (savedAt) diag.setLocalSaved(savedAt);
    recomputePublicState();
    diag.logControl(data);
    diag.refreshFreshness(content.freshness);
  }

  function handleStatus(status) {
    connStatus = status;
    content.freshness.setServerStatus(status);
    recomputePublicState();
    if (status === 'connected') { // (re)connexion -> réobserve les headers de flux
      dbg('socket connected -> observe stream headers');
      stream.observeHeaders(collabApi);
    }
    diag.setStatus(status);
  }

  // Connexion socket. onConnected (montage diag par la racine) ne s'exécute qu'en
  // cas de succès (inside .then) — sur rejet, onError seule, aucun montage diag.
  const ready = connect({ serverUrl, namespace, username, authMode, onControl: handleControl, onStatus: handleStatus })
    .then((api) => {
      collabApi = api;
      stream.observeHeaders(api); // 1re connexion (si déjà connectée, guard idempotent)
      onConnected(api);
      return api;
    })
    .catch((err) => onError('[Collab-Hub] connexion impossible :', err));

  return {
    ready,
    getApi: () => collabApi,
    getConnStatus: () => connStatus,
    // Teardown : ferme la socket si elle fut ouverte. Idempotent (guard interne).
    close() {
      try { if (collabApi && collabApi.socket && typeof collabApi.socket.close === 'function') collabApi.socket.close(); } catch { /* socket déjà fermée */ }
    },
  };
}
