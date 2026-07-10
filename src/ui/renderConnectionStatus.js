// Indicateur de connexion discret. Pur vis-à-vis du document (refs passées).
// Lot 3B : "connected" se décline en "Connecté — Max actif/silencieux" selon
// l'activité du patch Max (heartbeat). Le statut serveur reste prioritaire.
const STATUS_MAP = {
  max_active: { text: 'Connecté — Max actif', cls: 'is-ok' },
  max_silent: { text: 'Connecté — Max silencieux', cls: 'is-wait' },
  connected: { text: 'Connecté', cls: 'is-ok' }, // fallback (sans info Max)
  reconnecting: { text: 'Reconnexion…', cls: 'is-wait' },
  disconnected: { text: 'Déconnecté', cls: 'is-off' },
  error: { text: 'Déconnecté', cls: 'is-off' },
};

export function renderConnectionStatus(status, els) {
  const { text, cls } = STATUS_MAP[status] || STATUS_MAP.disconnected;
  if (els.statusText) els.statusText.textContent = text;
  if (els.statusDot) els.statusDot.className = `status-dot ${cls}`;
}