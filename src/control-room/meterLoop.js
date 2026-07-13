// Boucle du VU-mètre Control Room (issue #8). Extraite de mountControlRoom().
//
// Pilote le rendu du meter (renderMeter) + la publication continue level/peak
// via streamPublisher à chaque tick. requestAnimationFrame en nominal,
// setInterval 100 ms si prefers-reduced-motion. start/stop idempotents (un seul
// loop à la fois). Recopié verbatim de l'ancien startMeter/stopMeter.
//
// Les primitives de scheduling (rAF, setInterval) sont injectables avec défauts
// navigateur — aucun effet en production, testable en Node.

import { renderMeter } from './controlRoomView.js';

export function createMeterLoop({
  controller, els, streamPublisher,
  matchMediaFn = (typeof matchMedia === 'function' ? matchMedia : null),
  requestAnimationFrameFn = (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null),
  cancelAnimationFrameFn = (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null),
  schedule = setInterval,
  clearSchedule = clearInterval,
} = {}) {
  const reduceMotion = matchMediaFn && matchMediaFn('(prefers-reduced-motion: reduce)').matches;
  let rafId = null;
  let timerId = null;

  function start() {
    if (rafId != null || timerId != null) return;
    if (reduceMotion) {
      timerId = schedule(() => {
        const m = controller.readMeter();
        renderMeter(m, els);
        streamPublisher.update(controller.getSnapshot(), m);
      }, 100);
    } else {
      const tick = () => {
        const m = controller.readMeter();
        renderMeter(m, els);
        streamPublisher.update(controller.getSnapshot(), m);
        rafId = requestAnimationFrameFn(tick);
      };
      rafId = requestAnimationFrameFn(tick);
    }
  }
  function stop() {
    if (rafId != null) { cancelAnimationFrameFn(rafId); rafId = null; }
    if (timerId != null) { clearSchedule(timerId); timerId = null; }
    renderMeter(null, els);
  }
  return { start, stop };
}