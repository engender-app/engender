// @ts-nocheck
/* The yank sweep's shared half (ticket 100): the scene table, the
   thresholds and the arithmetic that turns sampled frames into findings,
   and the page-side sampler and proof injection as expression strings, so
   the desktop sweep (`yank-sweep.mjs`, Playwright against a preview
   server) and the device sweep (`yank-sweep-device.mjs`, CDP over the
   WebView's devtools socket on a real Android phone) run the same
   instruments rather than two copies drifting apart.

   Nothing here imports anything app-side: this module stays reachable
   from the Node tier (ADR-0016) and loadable without a build. */

/** A jump under this many pixels is not a teleport however sharp it is: at
    390px wide, a mark moving 12px in a frame is still inside its own glyph. */
export const TELEPORT_PX = 14;
/** And it is only a yank if the frames either side of it are still by
    comparison. Against the whole run's median this test is useless: a mark
    is at rest for most of a scene, so the median is 0 and every frame that
    moves at all trips a ratio. What separates a teleport from a fast slide
    is what its neighbours are doing - a slide arrives at speed and leaves at
    speed, a teleport has stillness on both sides of it. */
export const TELEPORT_RATIO = 4;
/** Opacity at or above this is on screen; under GONE it is not there. */
export const VISIBLE = 0.5;
export const GONE = 0.03;
/** The blind's own defect, named by Alicja on the recording: "it first
    yanks and takes up the whole screen, then it yanks back to its target
    state". A mark rendering larger than its own resting bounds for a frame
    or two. The floor absorbs ordinary sub-pixel rounding and one-line
    reflows; the ratio keeps a small mark's growth from needing a huge pixel
    count to count as huge. */
export const BLOAT_PX = 24;
export const BLOAT_RATIO = 1.4;
/** How long to follow a gesture. The door change is 380ms and the slowest
    stagger runs a few frames past it; what is left is the stillness that
    says it landed rather than stopped. */
export const SCENE_MS = 760;

/** The names the app hands to a view transition: the blind, the field that
    contains it (ticket 99 round 2 named it so its clip survives
    promotion), the page under it, the bar, then one per mark printed on
    each side of the field and one per ring of the sun on each side. Read
    from the pseudo elements, so a name that is not participating on a
    frame simply answers nothing. */
export const VT_NAMES = [
  'blind',
  'field',
  'screen',
  'nav',
  ...Array.from({ length: 8 }, (_, i) => `fp-a-${i}`),
  ...Array.from({ length: 8 }, (_, i) => `fp-b-${i}`),
  ...Array.from({ length: 8 }, (_, i) => `sun-a-${i}`),
  ...Array.from({ length: 8 }, (_, i) => `sun-b-${i}`)
];

/** The scene --prove adds, and the three marks it expects back. Kept beside
    the injection below so the two cannot drift apart. */
export const PROOF = {
  scene: 'proof-injected-yanks',
  teleport: '.yank-proof-jump|',
  vanish: '.yank-proof-cut|',
  bloat: '.yank-proof-bloat|'
};

/* Each scene is a rest, a gesture, and what the gesture is supposed to be.
   The four door changes, then the state changes ADR-0078 flipped the default
   for: a sheet, a fold, a notice, a row leaving, a segment, a save.

   `firstRun`, where present, names the setup step the scene needs the walk
   to stop on; each transport implements its own walk (Playwright locators
   on desktop, devtools evaluates on the device). */
const SCENES = [
  { name: 'door-today-journal', at: '/', act: '[data-nav-item="calendar"]', nav: true, is: 'the blind pulled up to Journal' },
  { name: 'door-journal-lookback', at: '/calendar', act: '[data-nav-item="stats"]', nav: true, is: 'the blind between two doors' },
  { name: 'door-lookback-transition', at: '/stats', act: '[data-nav-item="settings"]', nav: true, is: 'the blind down to Transition' },
  { name: 'door-transition-today', at: '/more', act: '[data-nav-item="home"]', nav: true, is: 'the blind back to the tallest field' },
  { name: 'deep-settings-tags', at: '/settings', act: 'a[href="/settings/tags"]', nav: true, is: 'a door into a deep screen' },
  { name: 'deep-back', at: '/settings/tags', act: 'back', nav: true, is: 'a deep screen back to its door' },
  { name: 'sheet-quick-add', at: '/', act: '[data-rail-add], [data-nav-add]', is: 'the sheet rising' },
  { name: 'segment-lookback', at: '/stats', act: '[data-segment]:not([aria-selected="true"])', is: 'the segmented pill sliding' },
  { name: 'mood-pick', at: '/', act: '[data-mood="4"]', is: 'a mood picked, the row looking at it' },
  { name: 'notice-dismiss', at: '/', act: '.kit-notice-x', is: 'a notice dismissed, its height closing' },
  /* Setup's four movements (redesign ticket 33). `firstRun` is what these
     need that no other scene does: the flow is reached through the demo's
     first-run control and then walked, and the settle deliberately leaves
     setup when it finds it. Every step change moves the field's own edge
     rather than running a view transition, so three of these read as state
     changes and the handover reads as a transition - which is the sweep
     deciding, not the scene declaring. */
  {
    name: 'setup-step-forward',
    at: '/',
    firstRun: 'flag',
    act: '[data-next]',
    is: "the field's edge pulled down to the next step, with the question riding it"
  },
  {
    name: 'setup-step-back',
    at: '/',
    firstRun: 'scales',
    act: '[data-back]',
    is: 'the same edge pulled up, which is the direction that must not overshoot'
  },
  {
    name: 'setup-flag-pick',
    at: '/',
    firstRun: 'flag',
    act: '[data-palette-pick="agender"]',
    is: 'a flag picked: the frame landing, the field wiping, the sun redrawing over the old one'
  },
  {
    name: 'setup-handover',
    at: '/',
    firstRun: 'done',
    act: '[data-finish]',
    nav: true,
    is: "setup's field closing to Home's, as one object"
  }
];

/** The scenes a run covers: the table above, with the proof scene prepended
 *  when the run is out to show the sweep can fail, narrowed to `only`. */
export function scenesFor({ prove = false, only = [] } = {}) {
  const scenes = prove
    ? [{ name: PROOF.scene, at: '/', act: 'inject', is: 'three marks built to be wrong, so the arithmetic can be seen to catch them' }, ...SCENES]
    : SCENES;
  return only.length ? scenes.filter((s) => only.includes(s.name)) : scenes;
}

/** Furniture rather than the app: the demo bar and a toast are injected over
    whatever is being looked at. A navigation needs no exemption at all now
    that it is read off the pseudos rather than off the tree. */
export const EXEMPT = /^\.demo-bar|\[data-toast\]|^\.toast/;

/** The three deliberately wrong marks. All sit among real neighbours: the
    jump slides smoothly before it teleports, the cut fades part of the way
    before it is taken off screen, and the bloat rests at its own size while
    everything around it is still. Driven from a rAF loop of their own,
    started by the gesture the scene names.

    An expression string, not a function value, so the devtools socket on
    the device can run the same injection the desktop sweep does. */
export const INJECT_PROOF_EXPRESSION =
  (() => {
    const root = document.querySelector('[data-app-root]');
    const make = (cls) => {
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = cls;
      el.style.cssText =
        'position:absolute;left:20px;top:200px;width:120px;height:24px;background:#888;z-index:99';
      root.append(el);
      return el;
    };
    const jump = make('yank-proof-jump');
    const cut = make('yank-proof-cut');
    cut.style.top = '240px';
    const bloat = make('yank-proof-bloat');
    bloat.style.top = '280px';
    window.__yankProof = () => {
      let frame = 0;
      const tick = () => {
        frame++;
        /* Eight frames of a smooth 6px slide, then 200px in one. */
        jump.style.translate = `0 ${frame <= 8 ? frame * 6 : 8 * 6 + 200}px`;
        /* Four frames fading to 0.6, then straight to nothing. */
        cut.style.opacity = frame <= 4 ? String(1 - frame * 0.1) : frame === 5 ? '0' : '0';
        /* Eight frames at the resting 24px, one frame a window-tall 520 -
           the field-blind's own shape, on a mark built to have it. */
        bloat.style.height = frame === 9 ? '520px' : '24px';
        if (frame < 14) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
  }).toString();

export const HIDE_DEMO_BAR_CSS = '.demo-bar { display: none !important; }';

export const INIT_HIDE_DEMO_SCRIPT = `(() => {
  const inject = () => {
    const parent = document.head || document.documentElement;
    if (parent && !document.getElementById('yank-sweep-hide-demo')) {
      const style = document.createElement('style');
      style.id = 'yank-sweep-hide-demo';
      style.textContent = ${JSON.stringify(HIDE_DEMO_BAR_CSS)};
      parent.appendChild(style);
    }
  };
  inject();
  document.addEventListener('DOMContentLoaded', inject);
})()`;

/** The page-side half of settling a scene: toasts gone, demo bar hidden
    (kept in the tree for the setup scenes' first-run control, but out of
    the frame and out of the flow), and the theme stamped on <html> the way
    +layout.svelte stamps it. An expression string for the same reason as
    above. */
export const SETTLE_PAGE_EXPRESSION = (theme) =>
  `(() => {
    let hide = document.getElementById('yank-sweep-hide-demo');
    if (!hide) {
      hide = document.createElement('style');
      hide.id = 'yank-sweep-hide-demo';
      hide.textContent = ${JSON.stringify(HIDE_DEMO_BAR_CSS)};
      (document.head || document.documentElement).appendChild(hide);
    }
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.style.display = 'none';
    document.body.classList.remove('has-demo-bar');
    document.documentElement.dataset.theme = ${JSON.stringify(theme)};
    return true;
  })()`;

/** The sampler. One rAF loop, reading both instruments into a keyed row per
    frame; the arithmetic happens afterwards in node, so the page does as
    little as possible between frames.

    Returned as an expression string rather than a function value so the
    same code runs through Playwright's evaluate and through the WebView's
    devtools socket on a device. */
export function samplerExpression(act, ms, names) {
  const fn = async (act, ms, names) => {
    const root = document.querySelector('[data-app-root]');
    const readPseudo = (pseudo, prop) =>
      getComputedStyle(document.documentElement, pseudo)?.getPropertyValue(prop) ?? '';
    /* A name that is not in this transition answers nothing, which is how
       the set of participants is discovered rather than declared. */
    const vtRow = (side, name) => {
      const transform = readPseudo(`::view-transition-${side}(${name})`, 'transform');
      const opacity = readPseudo(`::view-transition-${side}(${name})`, 'opacity');
      if (!opacity && (!transform || transform === 'none')) return null;
      const m = /matrix\(([^)]+)\)/.exec(transform)?.[1].split(',').map(Number);
      const ride = /(-?[\d.]+)px/.exec(
        readPseudo(`::view-transition-${side}(${name})`, 'translate').split(/\s+/)[1] ?? ''
      )?.[1];
      /* The painted extent of the group's box, straight from the used
         width/height the browser answers for the pseudo - the number the
         bloat test reads, and the one thing the field-blind defect moved
         without its transform ever saying so. `auto` and 0 both fall back
         to the viewport, which for a box that should be clipped is itself
         the unbounded case the View Transitions spec names. */
      const px = (prop, fallback) => {
        const v = parseFloat(readPseudo(`::view-transition-${side}(${name})`, prop));
        return Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : fallback;
      };
      const cut = /inset\(0px 0px (-?[\d.]+)px/.exec(
        readPseudo(`::view-transition-${side}(${name})`, 'clip-path')
      )?.[1];
      return {
        x: Math.round((m ? m[4] : 0) * 10) / 10,
        /* The mark's own travel plus the ride it takes with the blind: the
           two together are where it is on the frame. */
        y: Math.round(((m ? m[5] : 0) + Number(ride ?? 0)) * 10) / 10,
        w: px('width', innerWidth),
        h: px('height', innerHeight),
        o: opacity === '' ? 1 : Math.round(Number(opacity) * 1000) / 1000,
        ...(cut === undefined ? {} : { edge: Math.round((innerHeight - Number(cut)) * 10) / 10 })
      };
    };
    const key = (el) => {
      const cls = el.classList.length ? `.${[...el.classList].join('.')}` : el.tagName.toLowerCase();
      /* The text is what tells one row of a list from the next, trimmed
         so a count ticking up does not make a mark into a new mark. */
      const text = (el.textContent ?? '').trim().slice(0, 24).replace(/\d+/g, '#');
      return `${cls}|${text}`;
    };
    /* The browser's own answer to "is a transition running", for the
       length of this sample only; restored before the promise resolves. */
    let active = false;
    const startViewTransition = document.startViewTransition?.bind(document);
    if (startViewTransition)
      document.startViewTransition = (...a) => {
        const running = startViewTransition(...a);
        /* `ready`, not the call. Between calling and ready the browser is
           still taking its snapshot and has applied no animation, so those
           frames paint the outgoing page as it was and the pseudos answer
           with their identity defaults - which reads as the destination
           sitting there at full opacity for a frame and then snapping to
           the start of its animation. It is not painted, and counting it
           put a teleport and two vanishes on every navigation in the app. */
        running.ready.catch(() => {}).then(() => {
          active = true;
        });
        running.finished.catch(() => {}).then(() => {
          active = false;
        });
        return running;
      };
    const restore = () => {
      if (startViewTransition) document.startViewTransition = startViewTransition;
    };

    const frames = [];
    const t0 = performance.now();
    /* The gesture starts on the second frame, not before the first. A
       resting frame is what "it was there and then it was not" is measured
       against, and without one the sweep cannot see a cut that finishes
       inside 16ms: with the notice's transition removed it was already
       gone by the first sample, no frame held it, and the injected cut in
       --prove went unreported. It also gives the teleport test real
       neighbours at the start of a run instead of a missing one. */
    const go = () => {
      if (act === 'inject') window.__yankProof();
      else if (act.startsWith('goto:')) location.assign(act.slice(5));
      else if (act === 'back') {
        const btn = document.querySelector('[data-screen-back]');
        if (btn) btn.click();
        else history.back();
      }
      else {
        const hit = document.querySelector(act);
        if (hit) hit.click();
      }
    };
    let started = false;
    return await new Promise((done) => {
      const tick = () => {
        const now = performance.now() - t0;
        const live = document.querySelector('[data-app-root]') ?? root;
        const rows = {};
        if (live) {
          for (const el of live.querySelectorAll('*')) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none') continue;
            const box = el.getBoundingClientRect();
            if (!box.width && !box.height) continue;
            /* A box that draws nothing of its own is not something a
               person can see teleport or vanish - what they see are the
               painted things inside it - and it is keyed by the text of
               its descendants, which makes it worse than useless: change
               the words inside a wrapper and the wrapper's key changes,
               so one mark vanishes and another arrives at the same
               position with no pixel having moved. Setup's step change
               does exactly that (redesign ticket 33) and reported 16 of
               these across two scenes - `.app-main`, `.screen-setup`,
               `.setup`, `.setup-field`, `.setup-ask`, `.setup-below` and
               `.setup-stage`, every one of them a transparent box that
               sat still at opacity 1 the whole time. The painted marks
               inside them were clean, and the recording agrees.

               So an element earns a mark by painting something of its own
               or by holding its own words. The proof scene's marks
               have a background and their own text, which is what keeps
               this from being a way to make the sweep quiet. */
            const paints =
              cs.backgroundImage !== 'none' ||
              cs.borderTopWidth !== '0px' ||
              cs.borderBottomWidth !== '0px' ||
              cs.borderLeftWidth !== '0px' ||
              cs.borderRightWidth !== '0px' ||
              cs.boxShadow !== 'none' ||
              cs.outlineStyle !== 'none' ||
              !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(cs.backgroundColor);
            const ownWords = [...el.childNodes].some(
              (n) => n.nodeType === 3 && n.textContent.trim().length > 0
            );
            if (!paints && !ownWords) continue;
            const k = key(el);
            /* First one wins: a repeated key inside one frame is a list of
               identical marks, and following the first is enough to see a
               jump the whole list makes. */
            if (rows[k]) continue;
            /* Effective opacity, not the element's own: opacity composes
               down the tree, so a title at 1 inside a notice at 0 is not
               on screen and its removal is not a disappearance. Reading
               the own value reported all six of a dismissed notice's
               marks as vanishing, when what had happened is that their
               box faded first and took them with it. */
            let o = Number(cs.opacity);
            for (let up = el.parentElement; up && up !== live; up = up.parentElement)
              o *= Number(getComputedStyle(up).opacity);
            rows[k] = {
              x: Math.round(box.x * 10) / 10,
              y: Math.round(box.y * 10) / 10,
              w: Math.round(box.width * 10) / 10,
              h: Math.round(box.height * 10) / 10,
              o: Math.round(o * 1000) / 1000
            };
          }
        }
        const vt = {};
        for (const name of names)
          for (const side of ['old', 'new']) {
            const row = vtRow(side, name);
            if (row) vt[`${side}(${name})`] = row;
          }
        frames.push({ at: Math.round(now), active, rows, vt });
        if (!started) {
          started = true;
          go();
        }
        if (now < ms) requestAnimationFrame(tick);
        else {
          restore();
          done(frames);
        }
      };
      requestAnimationFrame(tick);
    });
  };
  return `(${fn})(${JSON.stringify(act)}, ${JSON.stringify(ms)}, ${JSON.stringify(names)})`;
}

/** The arithmetic, in node: per mark, per consecutive frame pair.
 *
 * `settles` is the frame the gesture is over on. Everything a view
 * transition publishes stops existing on that frame at once - the browser
 * tearing its pseudo elements down, not an element being yanked - so a
 * departure there is the end of the run rather than a defect. Left at the
 * last frame for a DOM run, where a mark still on screen at the end is
 * exactly what should be there.
 */
export function findYanks(frames, instrument, settles = frames.length - 1) {
  const keys = new Set();
  for (const f of frames) for (const k of Object.keys(f[instrument])) keys.add(k);
  const yanks = [];

  for (const k of keys) {
    const run = frames.map((f, i) => ({ i, at: f.at, row: f[instrument][k] ?? null }));
    const present = run.filter((r) => r.row);
    if (present.length < 2) continue;

    /* The per-frame movement of this mark, over the frames where it is in
       the tree on both sides. The median is what "the rest of the run" is. */
    const deltas = [];
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1].row;
      const b = run[i].row;
      if (!a || !b) continue;
      deltas.push({ i, d: Math.hypot(b.x - a.x, b.y - a.y), at: run[i].at });
    }

    for (let n = 0; deltas.length && n < deltas.length; n++) {
      const { i, d, at } = deltas[n];
      if (d < TELEPORT_PX) continue;
      /* The fastest of the frames either side. A slide's neighbours are
         moving too; a teleport's are not. */
      const around = Math.max(deltas[n - 1]?.d ?? 0, deltas[n + 1]?.d ?? 0);
      if (d < Math.max(around, 0.25) * TELEPORT_RATIO) continue;
      yanks.push({
        kind: 'teleport',
        mark: k,
        frames: [i - 1, i],
        at,
        detail: `${Math.round(d)}px in one frame, ${Math.round(around * 10) / 10}px in the frames either side`
      });
    }

    /* Vanishing: full opacity to nothing, or out of the tree from full
       opacity, with no frame in between. */
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1].row;
      const b = run[i].row;
      if (!a || a.o < VISIBLE) continue;
      if (b && b.o <= GONE)
        yanks.push({
          kind: 'vanish',
          mark: k,
          frames: [i - 1, i],
          at: run[i].at,
          detail: `opacity ${a.o} to ${b.o} in one frame`
        });
      /* A departure on or after the frame the gesture settles on is the run
         ending. One before it, from full opacity, is a mark being taken
         off screen with no frame in between. */
      if (!b && i < settles)
        yanks.push({
          kind: 'vanish',
          mark: k,
          frames: [i - 1, i],
          at: run[i].at,
          detail: `left at opacity ${a.o}, ${settles - i} frame(s) before the gesture settled`
        });
    }

    /* Limbo: gone for two or more frames in the middle of the gesture and
       back afterwards - in neither place. */
    let gapStart = null;
    for (let i = 0; i < run.length; i++) {
      if (!run[i].row && gapStart === null) gapStart = i;
      if (run[i].row && gapStart !== null) {
        const length = i - gapStart;
        if (gapStart > 0 && length >= 2)
          yanks.push({
            kind: 'limbo',
            mark: k,
            frames: [gapStart - 1, i],
            at: run[i].at,
            detail: `absent for ${length} frames (${run[gapStart].at}ms to ${run[i - 1].at}ms)`
          });
        gapStart = null;
      }
    }

    yanks.push(...findBloat(run, k));
  }
  return yanks;
}

/** A mark rendering larger than its own resting bounds for a frame or two -
 *  the third failure shape, the field-blind's own.
 *
 *  Resting is the run's most common size per axis, ties broken towards the
 *  final frame, because a mark is at its resting size for most of any
 *  scene. What separates a bloat from an animating box is the same thing
 *  that separates a teleport from a slide: the frames either side are at
 *  rest, and the run comes back. A box growing to stay grown is a layout
 *  change, not a yank; a box growing over twenty frames is an animation
 *  the scene already knows about, and either way the still-neighbour or
 *  missing-return guard suppresses it. */
function findBloat(run, k) {
  const rows = run.map((r) => r.row);
  const presentRows = rows.filter(Boolean);
  const restingW = resting(presentRows.map((r) => r.w));
  const restingH = resting(presentRows.map((r) => r.h));
  const grew = (row) =>
    (row.h - restingH > BLOAT_PX && row.h > restingH * BLOAT_RATIO) ||
    (row.w - restingW > BLOAT_PX && row.w > restingW * BLOAT_RATIO);
  /** Deviation of the nearest present row before/after `from`, or 0 when
   *  the run ends first - an absent mark cannot be bloated. */
  const neighbourDev = (from, dir) => {
    for (let i = from + dir; i >= 0 && i < rows.length; i += dir) {
      const row = rows[i];
      if (row) return Math.max(row.w - restingW, row.h - restingH);
    }
    return 0;
  };

  const yanks = [];
  let i = 1;
  while (i < rows.length - 1) {
    const row = rows[i];
    if (!row || !grew(row) || neighbourDev(i, -1) >= BLOAT_PX || neighbourDev(i, 1) >= BLOAT_PX) {
      i++;
      continue;
    }
    /* And it comes back: the run holds a present row at rest again within
       the sample, which is what makes the spike transient rather than the
       mark's new size. */
    let end = i;
    while (end < rows.length && rows[end] && (rows[end].h - restingH > BLOAT_PX || rows[end].w - restingW > BLOAT_PX))
      end++;
    if (end >= rows.length) {
      i++;
      continue;
    }
    const length = rows.slice(i, end).filter(Boolean).length;
    yanks.push({
      kind: 'bloat',
      mark: k,
      frames: [i, end],
      at: run[i].at,
      detail:
        `${restingW}x${restingH} resting, rendered ` +
        `${Math.round(rows[i].w)}x${Math.round(rows[i].h)} for ${length} frame(s)`
    });
    i = end;
  }
  return yanks;
}

/** The most common value, rounded to whole pixels so sub-pixel jitter does
 *  not split one resting size into several. Ties go to whichever candidate
 *  the run reached last, which leans the answer towards the settled end. */
function resting(values) {
  const counts = new Map();
  const lastIndex = new Map();
  values.forEach((v, i) => {
    const r = Math.round(v);
    counts.set(r, (counts.get(r) ?? 0) + 1);
    lastIndex.set(r, i);
  });
  let best = Math.round(values.at(-1) ?? 0);
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && lastIndex.get(v) > lastIndex.get(best))) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}
