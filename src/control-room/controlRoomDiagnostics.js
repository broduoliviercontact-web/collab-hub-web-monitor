// Rendu des diagnostics Control Room (issue #8). Extrait de mountControlRoom().
//
// Construit le snapshot debug JSON affiché dans <pre class="cr-debug-pre"> sous
// ?debug=1 : snapshot contrôleur + streamPresence + collabHubPublisher + bloc
// dédié au compteur d'auditeurs (compte + état d'enregistrement du header sur
// Collab-Hub, aucune identité/SID). Aucune valeur secrète transportée.
//
// `debugPre` est nul hors mode debug (la section debug n'est construite que sous
// ?debug=1) -> renderDiagnostics est alors un no-op. Recopié verbatim de l'ancien
// bloc diagnostics dans onSnapshot.

export function createDiagnosticsRenderer({ streamPublisher, getConn, debugPre }) {
  return function renderDiagnostics(snap) {
    if (!debugPre) return;
    const sp = streamPublisher.getDiagnostics();
    const conn = getConn();
    const cp = conn && typeof conn.getDiagnostics === 'function'
      ? conn.getDiagnostics()
      : { connected: false, note: 'connexion non résolue' };
    debugPre.textContent = JSON.stringify({
      ...snap,
      streamPresence: sp,
      collabHubPublisher: cp,
      // Lot 5 (partie B) : diagnostic dédié au compteur d'auditeurs. Aucune
      // identité/SID d'auditeur (juste le compte + l'état d'enregistrement du
      // header sur Collab-Hub).
      listenerCount: {
        streamListenerHeaderRegistered:
          !!(conn && typeof conn.isRegistered === 'function'
            && conn.isRegistered('stream_listener_count')),
        liveListenerCount: snap.liveListenerCount ?? 0,
        lastPublishedListenerCount: sp.lastPublishedListenerCount,
        listenerCountPublishCount: sp.listenerCountPublishCount,
      },
    }, null, 2);
  };
}