// Orchestrateur de la Control Room performer (Lot 4E). Assemble le moteur audio
// (audioEngine, Lot 4B) et le publisher LiveKit (livekitPublisher, Lot 4C) en un
// état composite unique, expose des actions à l'UI, et publie un snapshot sans
// AUCUNE valeur secrète. Entièrement injectable (audioEngine, publisher, now) ->
// testable en Node sans navigateur, micro ni vrai LiveKit.
//
// Sécurité (§13/§18/§20) : le mot de passe performer est un paramètre local de
// startBroadcast, jamais stocké, jamais loggué, jamais dans le snapshot, transmis
// uniquement à publisher.connect (-> tokenClient -> /api/livekit/token). Le token
// reste dans le publisher (mémoire) et n'est jamais exposé ici.

import {
  deriveCompositeState,
  derivePermission,
  broadcastStatus,
  isOnAir,
  describeError,
  PUBLISHER_ACTIVE,
} from './controlRoomState.js';

export function createControlRoomController({
  audioEngine,
  publisher,
  now = Date.now,
} = {}) {
  if (!audioEngine || !publisher) throw new Error('audioEngine et publisher requis.');

  const listeners = new Set();
  let broadcasting = false; // garde anti double-clic sur DÉMARRER LA DIFFUSION
  let lastActionResult = null; // {ok, code} du dernier startBroadcast (sans secret)

  function snapshot() {
    const a = audioEngine.getSnapshot();
    const p = publisher.getSnapshot();
    const composite = deriveCompositeState(a.state, p.state, a.devices && a.devices.length > 0);
    const onAir = isOnAir(composite);

    // Erreur prioritaire : publisher en erreur, sinon moteur audio en erreur.
    let error = null;
    if (p.state === 'error' && p.lastError) error = { code: p.lastError.code, message: describeError(p.lastError.code) };
    else if (a.state === 'error' && a.error) error = { code: a.error.code, message: describeError(a.error.code) };

    const canBroadcast =
      a.state === 'capturing' &&
      !!a.hasOutputStream &&
      !PUBLISHER_ACTIVE.has(p.state) &&
      !broadcasting;

    return {
      composite,
      audioState: a.state,
      publisherState: p.state,
      onAir,
      permission: derivePermission(a.state, a.error),
      devices: a.devices || [],
      selectedDeviceId: a.selectedDeviceId,
      selectedDeviceLabel: a.selectedDeviceLabel,
      settings: a.settings || null,
      gain: a.gain,
      meter: a.meter || null,
      hasOutputStream: !!a.hasOutputStream,
      canBroadcast,
      broadcastLabel: broadcastStatus(composite),
      // Champs publisher (non secrets) pour la section STATUT.
      roomName: p.roomName,
      identity: p.identity,
      trackSid: p.trackSid,
      connected: p.connected,
      published: p.published,
      reconnectCount: p.reconnectCount,
      liveSince: p.liveSince,
      error,
      lastActionResult,
      updatedAt: now(),
    };
  }

  function notify() {
    const snap = snapshot();
    for (const l of listeners) { try { l(snap); } catch { /* un listener ne casse pas l'orchestre */ } }
  }

  // Recalcule sur tout changement d'un des deux sous-moteurs.
  audioEngine.subscribe(notify);
  publisher.subscribe(notify);

  async function requestPermission() {
    try { await audioEngine.requestPermission(); return { ok: true }; }
    catch (e) { return { ok: false, code: (e && e.code) || 'permission_denied' }; }
  }

  async function refreshDevices() {
    try { return await audioEngine.listDevices(); }
    catch { return []; }
  }

  function selectDevice(deviceId) {
    audioEngine.selectDevice(deviceId);
  }

  async function startCapture() {
    try { await audioEngine.startCapture(); return { ok: true }; }
    catch (e) { return { ok: false, code: (e && e.code) || 'capture_failed' }; }
  }

  async function stopCapture() {
    try { await audioEngine.stopCapture(); } catch {}
    return { ok: true };
  }

  // gainPct : 0..100 -> 0..1 (borné côté audioEngine).
  function setGain(gainPct) {
    const v = Number(gainPct);
    if (!Number.isFinite(v)) return;
    audioEngine.setMasterGain(Math.max(0, Math.min(100, v)) / 100);
  }

  function readMeter() {
    return audioEngine.readMeter();
  }

  // Démarre la diffusion. password : paramètre local, jamais conservé.
  async function startBroadcast(password) {
    lastActionResult = null;
    if (broadcasting) { lastActionResult = { ok: false, code: 'publisher_busy' }; notify(); return lastActionResult; }
    const pState = publisher.getState();
    if (PUBLISHER_ACTIVE.has(pState)) { lastActionResult = { ok: false, code: 'publisher_busy' }; notify(); return lastActionResult; }
    if (audioEngine.getState() !== 'capturing') { lastActionResult = { ok: false, code: 'no_output_stream' }; notify(); return lastActionResult; }
    const outputStream = audioEngine.getOutputStream();
    if (!outputStream) { lastActionResult = { ok: false, code: 'no_output_stream' }; notify(); return lastActionResult; }
    if (typeof password !== 'string' || password.length === 0) {
      lastActionResult = { ok: false, code: 'no_password' }; notify(); return lastActionResult;
    }

    broadcasting = true;
    notify(); // -> canBroadcast false pendant la tentative (UI désactive).
    try {
      await publisher.connect({ password, outputStream });
      lastActionResult = { ok: true };
      return lastActionResult;
    } catch (e) {
      lastActionResult = { ok: false, code: (e && e.code) || 'publisher_failed' };
      return lastActionResult;
    } finally {
      broadcasting = false;
      notify();
    }
  }

  async function stopBroadcast() {
    try { await publisher.stop(); } catch {}
    return { ok: true };
  }

  // Retry = redémarre la diffusion (publisher en error/stopped, non actif).
  function retry(password) {
    return startBroadcast(password);
  }

  // Arrêt total : stoppe la diffusion puis la capture. Idempotent.
  async function stopAll() {
    try { await publisher.stop(); } catch {}
    try { await audioEngine.stopCapture(); } catch {}
    return { ok: true };
  }

  // Nettoyage (beforeunload) : non bloquant, sans fetch supplémentaire.
  async function destroy() {
    try { await publisher.destroy(); } catch {}
    try { await audioEngine.destroy(); } catch {}
    listeners.clear();
  }

  function getSnapshot() {
    return snapshot();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    requestPermission,
    refreshDevices,
    selectDevice,
    startCapture,
    stopCapture,
    setGain,
    readMeter,
    startBroadcast,
    stopBroadcast,
    retry,
    stopAll,
    destroy,
    getSnapshot,
    subscribe,
  };
}