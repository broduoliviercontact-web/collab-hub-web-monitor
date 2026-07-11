// Page légère /control-room (Lot 4F.1) — gate applicatif. Montée par main.js sur
// la route /control-room. NE charge PAS livekit-client ni le moteur audio avant
// authentification : seul l'écran de login est construit. Après login valide
// (session serveur signée), import dynamique de controlRoomPage.js (lourd) qui
// monte la Control Room. Logout / expiration -> démontage + retour au login.
//
// Sécurité : aucun secret côté navigateur. Le mot de passe ne quitte pas l'écran
// de login (transmis à sessionClient.login puis l'<input> est vidé). Aucune
// permission audio, aucun import LiveKit lourd, aucun diagnostic performer avant
// session valide.

import { login, logout, checkSession } from './sessionClient.js';
import { createControlRoomGate } from './controlRoomGate.js';
import { buildLoginDOM, renderLogin, wireLogin } from './controlRoomView.js';
import '../styles/main.css';

export function mountControlRoomGate() {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return null;

  const mount = doc.body || doc.documentElement;
  const { root, els } = buildLoginDOM(doc, mount);
  if (!root) return null;

  const sessionClient = { login, logout, checkSession };
  const gate = createControlRoomGate({ sessionClient });

  let roomApi = null; // { destroy } retourné par controlRoomPage.mountControlRoom

  function showLogin() {
    if (root && root.parentNode == null && mount && typeof mount.appendChild === 'function') {
      mount.appendChild(root);
    }
    if (els.password) els.password.focus && els.password.focus();
    renderLogin(gate.getSnapshot(), els);
  }

  async function mountRoom() {
    // Import dynamique : le SDK livekit-client n'est téléchargé qu'ici (post-auth).
    const mod = await import('./controlRoomPage.js');
    roomApi = mod.mountControlRoom({
      onLogout: handleLogout,
      onSessionExpired: handleSessionExpired,
    });
  }

  // Déconnexion explicite (bouton QUITTER) : stoppe moteurs + détruit session.
  async function handleLogout() {
    if (roomApi) { try { await roomApi.destroy(); } catch {} roomApi = null; }
    await gate.logout();
    showLogin();
  }

  // Session expirée côté serveur (token performer refusé) : démonte + retour login.
  async function handleSessionExpired() {
    if (roomApi) { try { await roomApi.destroy(); } catch {} roomApi = null; }
    gate.reset('Session expirée.');
    showLogin();
  }

  // Rendu du gate -> écran de login. L'état authenticated déclenche le montage de
  // la Control Room (une seule fois).
  let mounted = false;
  gate.subscribe((snap) => {
    if (snap.state === 'authenticated' && !mounted) {
      mounted = true;
      // Retire l'écran de login avant de monter la Control Room.
      if (root && root.parentNode && typeof root.parentNode.removeChild === 'function') {
        try { root.parentNode.removeChild(root); } catch {}
      }
      mountRoom().catch((e) => {
        mounted = false;
        gate.reset('Service d\'authentification indisponible.');
        showLogin();
        console.error('[Control Room] page indisponible :', e);
      });
      return;
    }
    if (snap.state !== 'authenticated') {
      mounted = false;
    }
    renderLogin(snap, els);
  });

  wireLogin({ els, onLogin: (pw) => { gate.login(pw); } });

  // Au chargement : vérifie la session (rechargement pendant session -> accès
  // conservé sans redemander le mot de passe).
  gate.checkSession().then((r) => {
    if (!r.authenticated) showLogin();
    // si authenticated, le subscriber monte la Control Room.
  }).catch(() => showLogin());

  return { gate, els, root };
}