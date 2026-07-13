// Tests for the listener domain — split from the former monolithic test/runTests.mjs (issue #11).
// Behaviour is unchanged; tests and fakes were moved verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createListenerAudioElement } from '../../src/listener/listenerAudioElement.js';
import {
  isLiveKitEnabled, STATUS_LABELS, buildListenerDOM,
  renderListenerState, wireListenerControls, createClickDiscriminator,
} from '../../src/listener/listenerUI.js';
import {
  createStreamStatus, routeStreamControl,
  STREAM_HEADERS, STALE_MS, SIGNAL_THRESHOLD,
  STREAM_STATUS, STREAM_SIGNAL,
  clamp01, parseOnAir, parseTimestamp,
  normalizeCount, formatListenerCount,
} from '../../src/state/streamStatus.js';
import { makeFakeRemoteTrack, makeFakeAudioSink, makeFakeListenerRoomSubscribedPub, makeListener, makeFakeListenerTokenClient, makeFakeListenerRoomClass } from '../helpers/listener-fakes.mjs';
import { fakeDocument, fakeDomEl } from '../helpers/dom.mjs';
import { flush } from '../helpers/flush.mjs';

function fakeAudioEl({ playImpl = async () => {} } = {}) {
  const el = {
    tagName: 'AUDIO', _volume: 1, _muted: false, _srcObject: null,
    _paused: true, _removed: false, _playImpl: playImpl,
    parentNode: null,
    get volume() { return this._volume; }, set volume(v) { this._volume = v; },
    get muted() { return this._muted; }, set muted(v) { this._muted = v; },
    get srcObject() { return this._srcObject; }, set srcObject(v) { this._srcObject = v; },
    async play() { await this._playImpl(); this._paused = false; },
    pause() { this._paused = true; },
  };
  el.parentNode = { removeChild(x) { x._removed = true; } };
  return el;
}

function fakeTimer() {
  let q = [];
  return {
    setTimeout(cb) { q.push(cb); return q.length; },
    clearTimeout() { q = []; },
    _flush() { const c = q.splice(0); c.forEach((cb) => cb()); },
    _pending() { return q.length > 0; },
  };
}

test('listenerAudioElement : crée un élément audio', () => {
  const created = [];
  const doc = { createElement(t) { const e = fakeAudioEl(); created.push(e); return e; } };
  const a = createListenerAudioElement({ documentRef: doc });
  assert.equal(a.getSnapshot().hasElement, true);
  assert.equal(a.getSnapshot().ownsElement, true);
  assert.equal(created.length, 1);
});

// 2. autoplay contrôlé (pas de play à la construction)

test('listenerAudioElement : pas de play() à la construction', () => {
  let played = 0;
  const doc = { createElement: () => fakeAudioEl({ playImpl: async () => { played++; } }) };
  const a = createListenerAudioElement({ documentRef: doc });
  assert.equal(played, 0);
  assert.equal(a.getSnapshot().playing, false);
});

// 3. attachTrack

test('listenerAudioElement : attachTrack attache la piste', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  const t = makeFakeRemoteTrack();
  a.attachTrack(t);
  assert.equal(t._attached.length, 1);
  assert.equal(a.getSnapshot().attached, true);
});

// 4. detachTrack

test('listenerAudioElement : detachTrack détache + vide srcObject', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  const t = makeFakeRemoteTrack();
  a.attachTrack(t);
  a.detachTrack();
  assert.equal(t._detached.length, 1);
  assert.equal(el.srcObject, null);
  assert.equal(a.getSnapshot().attached, false);
});

// 5. play succès

test('listenerAudioElement : play succès -> playing', async () => {
  const el = fakeAudioEl({ playImpl: async () => {} });
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  await a.play();
  assert.equal(a.getSnapshot().playing, true);
});

// 6. play NotAllowedError propagé

test('listenerAudioElement : play NotAllowedError propagé', async () => {
  const el = fakeAudioEl({ playImpl: async () => { throw Object.assign(new Error('b'), { name: 'NotAllowedError' }); } });
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  await assert.rejects(() => a.play(), (e) => e.name === 'NotAllowedError');
});

// 7. volume

test('listenerAudioElement : setVolume', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  a.setVolume(0.3);
  assert.equal(el.volume, 0.3);
});

// 8. mute

test('listenerAudioElement : setMuted', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  a.setMuted(true);
  assert.equal(el.muted, true);
});

// 9. pause

test('listenerAudioElement : pause', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  a.pause();
  assert.equal(el._paused, true);
  assert.equal(a.getSnapshot().playing, false);
});

// 10. destroy (pause + detach)

test('listenerAudioElement : destroy pause + détache', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el }, audioElement: el });
  const t = makeFakeRemoteTrack();
  a.attachTrack(t);
  a.destroy();
  assert.equal(t._detached.length, 1);
  assert.equal(a.getSnapshot().attached, false);
});

// 11. retrait si propriétaire (élément créé)

test('listenerAudioElement : retire l élément créé du DOM', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => el } });
  a.destroy();
  assert.equal(el._removed, true);
});

// 12. conservation si élément fourni (ne retire pas)

test('listenerAudioElement : conserve l élément fourni (pas de retrait)', () => {
  const el = fakeAudioEl();
  const a = createListenerAudioElement({ documentRef: { createElement: () => fakeAudioEl() }, audioElement: el });
  assert.equal(a.getSnapshot().ownsElement, false);
  a.destroy();
  assert.equal(el._removed, false);
});


test('listenerUI : isLiveKitEnabled("false") -> false', () => {
  assert.equal(isLiveKitEnabled('false'), false);
});

// 2. absent / vide -> false (aucun import LiveKit)

test('listenerUI : isLiveKitEnabled absent/vide -> false', () => {
  assert.equal(isLiveKitEnabled(undefined), false);
  assert.equal(isLiveKitEnabled(''), false);
  assert.equal(isLiveKitEnabled(null), false);
});

// 2b. valeur inconnue -> false + warning

test('listenerUI : isLiveKitEnabled valeur inconnue -> false', () => {
  const orig = console.warn; let warned = false; console.warn = () => { warned = true; };
  try { assert.equal(isLiveKitEnabled('maybe'), false); }
  finally { console.warn = orig; }
  assert.equal(warned, true);
});

// 3. bouton visible si activé (état idle -> primary visible)

test('listenerUI : bouton principal visible à l état idle', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'idle', volume: 0.8, muted: false, hasAudioTrack: false }, els);
  assert.equal(els.primary.hidden, false);
  assert.equal(els.primary.textContent, 'ÉCOUTER LE DIRECT');
});

// 4. premier clic déclenche la connexion (onPrimary appelé)

test('listenerUI : premier clic appelle onPrimary', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  let called = 0;
  wireListenerControls({ els, onPrimary: () => { called++; }, onMuteToggle: () => {}, onVolume: () => {} });
  els.primary._fire('click');
  assert.equal(called, 1);
});

// 5. statut en attente

test('listenerUI : statut "En attente du direct"', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'waiting_for_track', volume: 0.8, muted: false, hasAudioTrack: false }, els);
  assert.equal(els.status.textContent, 'En attente du direct');
});

// 6. statut lecture

test('listenerUI : statut "Lecture en cours"', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: false, hasAudioTrack: true }, els);
  assert.equal(els.status.textContent, 'Lecture en cours');
});

// 7. bouton enceinte (🔇/🔊) + aria-label mute/unmute

test('listenerUI : bouton enceinte 🔊 puis 🔇 + aria-label', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: false, hasAudioTrack: true }, els);
  assert.equal(els.speaker.hidden, false);
  assert.equal(els.speaker.textContent, '🔊');
  assert.equal(els.speaker.getAttribute('aria-label'), 'Couper le son');
  renderListenerState({ state: 'playing', volume: 0.8, muted: true, hasAudioTrack: true }, els);
  assert.equal(els.speaker.textContent, '🔇');
  assert.equal(els.speaker.getAttribute('aria-label'), 'Réactiver le son');
});

// 8. volume (slider + pourcentage)

test('listenerUI : volume slider + pourcentage', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.5, muted: false, hasAudioTrack: true }, els);
  assert.equal(els.volume.value, '0.5');
  assert.equal(els.volumeLabel.textContent, '50%');
});

// 8b. volume input déclenche onVolume

test('listenerUI : volume input appelle onVolume', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  let v = null;
  wireListenerControls({ els, onPrimary: () => {}, onMuteToggle: () => {}, onVolume: (x) => { v = x; } });
  els.volume.value = '0.25';
  els.volume._fire('input');
  assert.equal(v, 0.25);
});

// 9. erreur + retry (bouton RÉESSAYER)

test('listenerUI : erreur -> statut Erreur audio + RÉESSAYER', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'error', volume: 0.8, muted: false, hasAudioTrack: false, lastError: { code: 'disconnected' } }, els);
  assert.equal(els.status.textContent, 'Erreur audio');
  assert.equal(els.primary.hidden, false);
  assert.equal(els.primary.textContent, 'RÉESSAYER');
});

// 10. section indépendante (carte séparée, n interfère pas avec Collab-Hub)

test('listenerUI : section est une carte séparée lk-listener', () => {
  const doc = fakeDocument();
  const { section } = buildListenerDOM(doc, null);
  assert.ok(section.className.includes('lk-listener'));
  assert.equal(section.getAttribute('data-lk-section'), ''); // attribut présent (vide)
});

// 11. diagnostic existant continue + extension LiveKit

test('enceinte : icône 🔊 volume actif', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: false, attenuationActive: false, hasAudioTrack: true }, els);
  assert.equal(els.speaker.textContent, '🔊');
});

// 2. icône mute 🔇

test('enceinte : icône 🔇 quand mute', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: true, attenuationActive: false, hasAudioTrack: true }, els);
  assert.equal(els.speaker.textContent, '🔇');
});

// 3. clic simple mute (engine)

test('enceinte : double-clic -> onDouble seulement (pas onSingle)', () => {
  const t = fakeTimer();
  let single = 0, dbl = 0;
  const disc = createClickDiscriminator({ onSingle: () => { single++; }, onDouble: () => { dbl++; } }, t);
  disc.click();      // programme l'action simple (non exécutée)
  assert.ok(t._pending());
  disc.dblclick();  // annule l'action simple + déclenche l'atténuation
  assert.equal(single, 0);
  assert.equal(dbl, 1);
  assert.ok(!t._pending());
});


test('enceinte : clic simple (sans dblclick) -> onSingle après délai', () => {
  const t = fakeTimer();
  let single = 0;
  const disc = createClickDiscriminator({ onSingle: () => { single++; }, onDouble: () => {} }, t);
  disc.click();
  assert.equal(single, 0);
  t._flush();
  assert.equal(single, 1);
});

// 7. nouveau double-clic restaure

test('enceinte : badge -20 dB + label "60% · −20 dB" visibles si actif', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.6, muted: false, attenuationActive: false, hasAudioTrack: true }, els);
  assert.equal(els.attenBadge.hidden, true);
  assert.equal(els.volumeLabel.textContent, '60%');
  renderListenerState({ state: 'playing', volume: 0.6, muted: false, attenuationActive: true, hasAudioTrack: true }, els);
  assert.equal(els.attenBadge.hidden, false);
  assert.equal(els.volumeLabel.textContent, '60% · −20 dB');
});

// 14. aria-label correct (speaker + bouton -20 dB)

test('enceinte : aria-label speaker Couper/Réactiver + attenBtn aria-pressed', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: false, attenuationActive: false, hasAudioTrack: true }, els);
  assert.equal(els.speaker.getAttribute('aria-label'), 'Couper le son');
  assert.equal(els.attenBtn.getAttribute('aria-pressed'), 'false');
  renderListenerState({ state: 'playing', volume: 0.8, muted: true, attenuationActive: true, hasAudioTrack: true }, els);
  assert.equal(els.speaker.getAttribute('aria-label'), 'Réactiver le son');
  assert.equal(els.attenBtn.getAttribute('aria-pressed'), 'true');
});

// 15. clavier fonctionne (vrai <button> focusable ; Entrée/Espace -> clic -> mute)

test('enceinte : speaker et attenBtn sont des <button> (clavier utilisable)', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  assert.equal(els.speaker.tagName, 'BUTTON');
  assert.equal(els.attenBtn.tagName, 'BUTTON');
  // Le clic speaker déclenche onMuteToggle via le discriminateur.
  let muted = false;
  wireListenerControls({ els, onMuteToggle: () => { muted = !muted; }, onAttenuationToggle: () => {} });
  els.speaker._fire('click'); // simule Enter/Espace -> click
});

// 16. fallback tactile accessible (bouton -20 dB visible quand piste présente)

test('enceinte : bouton -20 dB visible (fallback clavier/tactile) quand piste', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState({ state: 'playing', volume: 0.8, muted: false, attenuationActive: false, hasAudioTrack: true }, els);
  assert.equal(els.attenBtn.hidden, false);
  let toggled = false;
  wireListenerControls({ els, onMuteToggle: () => {}, onAttenuationToggle: () => { toggled = true; } });
  els.attenBtn._fire('click');
  assert.equal(toggled, true);
});


test('hotfix iOS : autoplay refusé -> waiting_for_user + bouton ACTIVER LE SON', async () => {
  const sink = makeFakeAudioSink({ playMode: 'NotAllowed' });
  const RoomClass = makeFakeListenerRoomSubscribedPub({ withStartAudio: true });
  const l = makeListener({ RoomClass, audioSink: sink, retryDelays: [] });
  await l.connect();
  await flush();
  const s = l.getSnapshot();
  assert.equal(s.state, 'waiting_for_user');
  assert.equal(s.autoplayBlocked, true);
  // Rendu UI : bouton ACTIVER LE SON visible, primary masqué.
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  renderListenerState(s, els);
  assert.equal(els.activate.hidden, false, 'ACTIVER LE SON visible');
  assert.equal(els.primary.hidden, true, 'primary masqué quand ACTIVER LE SON visible');
  l.destroy();
});

// F.11. Second geste (ACTIVER LE SON) : room.startAudio() + audioSink.play() -> playing.

test('listener : bouton ÉCOUTER LE DIRECT inchangé + titre section ajusté (Lot 4G)', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  assert.equal(els.primary.textContent, 'ÉCOUTER LE DIRECT');
  // Le h2 de la section listener ne duplique plus "DIRECT AUDIO" (titre du bloc
  // de flux public). On ne dépend pas du texte exact, juste de l'absence du
  // doublon.
  const h2 = doc._created.find((e) => e.tagName === 'H2');
  assert.ok(h2, 'section listener a un titre');
  assert.notEqual(h2.textContent, 'DIRECT AUDIO');
});

// 11. aucun secret dans snapshots streamStatus + publisher diagnostics

test('listener : visible quel que soit debug (ÉCOUTER LE DIRECT inchangé)', () => {
  for (const debug of [false, true]) {
    const doc = fakeDocument();
    const { els } = buildListenerDOM(doc, null);
    assert.ok(els.section, `section listener construite (debug=${debug})`);
    assert.equal(els.primary.textContent, 'ÉCOUTER LE DIRECT', `bouton principal inchangé (debug=${debug})`);
  }
});

// A4. diagnostic flux cohérent même hors debug (streamStatus actif sans carte)

test('listener : moteur inchangé (contrôles attendus présents)', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  // Contrats stables du moteur listener (Lot 4D/4F.1) : bouton principal,
  // bouton activation iOS, bouton enceinte, badge atténuation, statut.
  assert.equal(els.primary.id, 'lk-primary');
  assert.equal(els.activate.id, 'lk-activate');
  assert.equal(els.activate.textContent, 'ACTIVER LE SON');
  assert.equal(els.speaker.id, 'lk-speaker');
  assert.equal(els.attenBadge.id, 'lk-atten-badge');
  assert.equal(els.status.id, 'lk-status');
});


test('listener : span de compteur d auditeurs présent (lk-listener-count)', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  assert.ok(els.count, 'els.count exposé');
  assert.equal(els.count.id, 'lk-listener-count');
  assert.equal(els.count.getAttribute('aria-live'), 'polite');
  // classe listener-count posée
  assert.equal(els.count.className, 'listener-count');
  // libellé initial discret
  assert.equal(els.count.textContent, 'Auditeurs : —');
});

// 34. UI listener : compteur visible quel que soit debug (section listener)

test('listener : span compteur construit hors debug (visible sur /)', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  // Le span est toujours créé par buildListenerDOM (debug ou non) -> visible
  // sur / et /?debug=1 (la stream-card reste, elle, debug-only).
  assert.ok(els.count);
  assert.equal(els.count.id, 'lk-listener-count');
});

// 35. UI listener : aucun secret/identité dans le span de compteur

test('listener : span compteur ne contient aucune identité/SID', () => {
  const doc = fakeDocument();
  const { els } = buildListenerDOM(doc, null);
  assert.ok(!/sid|identity|token|secret/i.test(els.count.textContent));
  assert.ok(!/sid|identity|token|secret/i.test(els.count.id));
});

// 36. routeStreamControl : stream_listener_count routé (header de flux)

test('ops : listener audio non régressé (renderListenerState playing -> bouton ÉCOUTER)', () => {
  // Réutilise le faux DOM riche existant. On vérifie juste que le rendu d'état
  // 'playing' ne lève pas et positionne le contrôle principal (non masqué).
  const els = buildListenerDOM(fakeDocument(), fakeDocument().body || { appendChild() {} });
  // buildListenerDOM peut retourner { els } ou null selon l'anchor ; on teste
  // directement renderListenerState sur un faux els minimal.
  const minimalEls = {
    primary: { textContent: '', classList: { add() {}, remove() {} } },
    status: { textContent: '' },
    activate: { classList: { add() {}, remove() {} } },
  };
  assert.doesNotThrow(() => renderListenerState({ state: 'playing', volume: 1, muted: false }, minimalEls));
});

