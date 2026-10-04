import { NOTICE_APPEAR_MS, NOTICE_OBSERVE_MS, NOTICE_KEY } from './measurement-notice-observation.mjs';

export const COLD_SAMPLE_MS = 1600;

export const COLD_SCREEN_SAMPLER = `(() => {
  if (navigator.storage) navigator.storage.persist = () => Promise.resolve(true);
  const ids = new WeakMap();
  let next = 0;
  const name = (el) => {
    let id = ids.get(el);
    if (id == null) {
      const cls = [...el.classList].filter((c) => !c.startsWith('s-') && !c.startsWith('svelte-')).slice(0, 2).join('.');
      const data = el.hasAttribute('data-protocol')
        ? 'data-protocol'
        : [...el.attributes].map((a) => a.name).find((a) => a.startsWith('data-') && a !== 'data-kit-surface');
      id = (next++) + ':' + el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (data ? '[' + data + ']' : '');
      ids.set(el, id);
    }
    return id;
  };
  const out = [];
  window.__coldSamples = out;
  let vt = false;
  const start = document.startViewTransition?.bind(document);
  if (start)
    document.startViewTransition = (...a) => {
      const running = start(...a);
      running.ready.catch(() => {}).then(() => (vt = true));
      running.finished.catch(() => {}).then(() => (vt = false));
      return running;
    };
  const t0 = performance.now();
  const measuring = location.pathname === '/body/measurements';
  let firstNoticeAt = null;
  const tick = () => {
    const at = performance.now() - t0;
    const row = { at, vt, boxes: {}, ops: {} };
    const opacity = new Map();
    for (const el of document.querySelectorAll('.screen > *, .screen > .screen-part > *, .read-reserve-body > *, .read-reserve-body > .screen-part > [data-protocol]')) {
      if (el.hasAttribute('data-gate-skeleton') || el.hasAttribute('data-read-reserve-hold')) continue;
      const box = el.getBoundingClientRect();
      /* Kept below the fold too, so a travel that leaves the viewport
         still reads as the run of frames it is; only steps seen on
         screen are reported (analyse). */
      if (box.height === 0) continue;
      row.boxes[name(el)] = Math.round(box.top * 10) / 10;
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        if (!opacity.has(n)) opacity.set(n, Number(getComputedStyle(n).opacity));
        o *= opacity.get(n);
      }
      row.ops[name(el)] = Math.round(o * 100) / 100;
    }
    out.push(row);
    if (measuring && firstNoticeAt == null && Object.keys(row.boxes).some((key) => key.includes('${NOTICE_KEY}') && row.ops[key] >= 0.1)) firstNoticeAt = at;
    const until = measuring ? (firstNoticeAt == null ? ${NOTICE_APPEAR_MS} : firstNoticeAt + ${NOTICE_OBSERVE_MS}) : ${COLD_SAMPLE_MS};
    if (at < until) requestAnimationFrame(later);
    else window.__coldSamplesComplete = true;
  };
  /* After the frame's paint rather than inside its rAF: a rAF read lands
     before that frame's ResizeObserver callbacks (home-fold-reserve.mjs). */
  const later = () => setTimeout(tick, 0);
  requestAnimationFrame(later);
})()`;
