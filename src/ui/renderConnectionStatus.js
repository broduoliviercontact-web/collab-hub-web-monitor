// Indicateur de connexion discret. Pur vis-à-vis du document (refs passées).
const STATUS_MAP = {
  connected: { text: 'Connecté', cls: 'is-ok' },
  reconnecting: { text: 'Reconnexion…', cls: 'is-wait' },
  disconnected: { text: 'Déconnecté', cls: 'is-off' },
  error: { text: 'Déconnecté', cls: 'is-off' },
};

export function renderConnectionStatus(status, els) {
  const { text, cls } = STATUS_MAP[status] || STATUS_MAP.disconnected;
  if (els.statusText) els.statusText.textContent = text;
  if (els.statusDot) els.statusDot.className = `status-dot ${cls}`;
}