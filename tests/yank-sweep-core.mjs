// @ts-nocheck
/* The yank sweep's shared half (ticket 100): the scene table, the
   thresholds and the arithmetic that turns sampled frames into findings,
   and the page-side sampler and proof injection as expression strings, so
   the desktop sweep (`yank-sweep.mjs`, Playwright against a preview
   server) and the device sweep (`yank-sweep-device.mjs`, CDP over the
   WebView's devtools socket on a real Android phone) run the same
   instruments rather than two copies drifting apart.

   Nothing here imports anything app-side: this module stays reachable
   from the Node tier (ADR-0016) and loadable without a build. The
   imports are node:fs/promises and plain data and plain decoding from
   the same tier (`tests/setup-flow.mjs`, `tests/png-decode.mjs`). */

import { writeFile } from 'node:fs/promises';
import { SETUP_STEPS } from './setup-flow.mjs';
import { decodePng, grayFrame } from './png-decode.mjs';

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
export const SCENE_MS = 1100;
/** The hydration sweep's own two clocks (ticket 108). Its blind spot was
 *  never the arithmetic - it was the window: the gesture sweep's settle
 *  waits 1400ms before recording, and the cold-mount pops (SQLite
 *  liveQuery resolving at 500ms-1500ms, tickets 106 and 107) happen
 *  entirely inside that wait. So the hydration window records from the
 *  navigation itself and holds for three seconds, with nothing settled
 *  on the page first. */
export const HYDRATION_MS = 3000;
/** Scenes that open a sheet after mount are the one exception: the sheet's
 *  own hydration is the question there, so the screen underneath is
 *  allowed to finish first - the same settle the gesture sweep uses, and
 *  for the same reason. */
export const HYDRATION_SETTLE_MS = 1600;
/** The ticket's own floor: a bounding box moving under this in one frame
 *  is layout breathing, not a yank. The gesture sweep's 14px floor stays
 *  what it is; this is a wider net over a calmer window, where the
 *  neighbours of a genuine hydration pop are still rather than sliding. */
export const HYDRATION_PX = 24;

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
  { name: 'sheet-quick-add', at: '/', act: '[data-rail-add], [data-nav-fab]', is: 'the sheet rising' },
  { name: 'segment-lookback', at: '/stats', act: '[data-segment]:not([aria-selected="true"])', is: 'the segmented pill sliding' },
  { name: 'mood-pick', at: '/', act: '[data-mood="4"]', is: 'a mood picked, the row looking at it' },
  { name: 'notice-dismiss', at: '/', act: '.kit-notice-x', is: 'a notice dismissed, its height closing' },

  /* Transition screens (ticket 108): buttons, switchers and modals */
  { name: 'milestones-picker', at: '/transition/milestones', act: '[data-add]', is: 'the milestone template picker sheet rising' },
  { name: 'milestones-edit', at: '/transition/milestones', act: '[data-milestone]', when: 'persona', is: 'an existing milestone edit sheet opening' },
  { name: 'milestones-rail-edit', at: '/transition/milestones', act: '[data-tl-open]', when: 'persona', is: 'a mark on the rail opening the same editor (redesign 43)' },
  { name: 'roadmap-goal-tick', at: '/transition/roadmap', act: '.kit-row.is-split .kit-row-main', when: 'persona', is: 'a goal check state cycled' },
  { name: 'roadmap-open-goal', at: '/transition/roadmap', act: '[data-open-goal]', when: 'persona', is: 'a goal details sheet opening' },
  { name: 'roadmap-add-goal', at: '/transition/roadmap', act: '[data-add-goal]', is: 'the add custom goal sheet opening' },
  { name: 'letters-compose', at: '/transition/letters', act: '[data-add]', is: 'the compose letter sheet opening' },
  /* `[data-letter-open]` rather than `[data-letter]` since redesign ticket
     45: a sealed letter's card answers no press at all now, and it is the
     first card on the screen, so the old selector picked the one letter that
     cannot open. This handle is on the two states that can. */
  { name: 'letters-read', at: '/transition/letters', act: '[data-letter-open]', when: 'persona', is: 'a letter unfolded to read' },
  { name: 'tryouts-open', at: '/transition/tryouts', act: '[data-tryout]', when: 'persona', nav: true, is: 'navigating to tryout detail' },
  { name: 'presentations-add', at: '/transition/presentations', act: '[data-add]', is: 'the add presentation sheet opening' },
  { name: 'eras-add', at: '/transition/eras', act: '[data-add]', is: 'the add era sheet opening' },

  /* Settings screens (ticket 108): swatches, switchers, switches and modals */
  { name: 'settings-palette', at: '/settings', act: '[data-palette-pick="nonbinary"]', is: 'picking a palette swatch' },
  { name: 'settings-mood-preset', at: '/settings', act: '[data-mood-preset-pick="teal"]', is: 'picking a mood preset swatch' },
  { name: 'settings-theme-switcher', at: '/settings', act: '.pref-row [data-segment="dark"]', is: 'switching theme segmented control' },
  { name: 'settings-switch', at: '/settings', act: '[data-cycle-tracking-toggle] button.switch', is: 'toggling a settings switch' },
  { name: 'settings-unit-switcher', at: '/settings', act: '[data-segmented="measurement-unit"] [data-segment="in"]', is: 'switching measurement unit segmented control' },
  { name: 'settings-scales', at: '/settings', act: '[data-list-row="scales"]', is: 'the gender scales checklist sheet opening' },
  { name: 'settings-metric', at: '/settings', act: '[data-list-row="metric"]', is: 'the calendar colour metric sheet opening' },
  { name: 'settings-disguise', at: '/settings', act: '[data-list-row="disguise"]', is: 'the disguise preview sheet opening' },
  { name: 'settings-about', at: '/settings', act: '[data-list-row="about"]', is: 'the about sheet opening' },
  { name: 'tags-hide', at: '/settings/tags', act: '[data-tag-hide]', when: 'persona', is: 'hiding a tag in settings' },
  { name: 'reminders-open', at: '/settings/reminders', act: '[data-list-row]', when: 'persona', is: 'opening a reminder for editing' },
  { name: 'regimen-add', at: '/settings/regimen', act: '[data-add]', is: 'opening regimen template picker sheet' },
  { name: 'regimen-edit', at: '/settings/regimen', act: '[data-episode]', when: 'persona', is: 'opening regimen episode editor' },
  { name: 'stock-add', at: '/settings/stock', act: '[data-add]', is: 'opening stock editor sheet' },
  { name: 'stock-edit', at: '/settings/stock', act: '[data-stock]', when: 'persona', is: 'opening existing stock row for editing' },
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
    const STATE_CLS = /^(is-active|is-selected|is-open|is-checked|roadmap-ticked|roadmap-skip|roadmap-done|roadmap-skip-text)$/;
    const key = (el) => {
      const clsList = [...el.classList].filter((c) => !STATE_CLS.test(c));
      const cls = clsList.length ? `.${clsList.join('.')}` : el.tagName.toLowerCase();
      const scope =
        el.getAttribute?.('data-tile') ??
        el.getAttribute?.('data-segment') ??
        el.getAttribute?.('data-goal') ??
        el.getAttribute?.('data-list-row') ??
        el.closest?.('[data-tile]')?.getAttribute('data-tile') ??
        el.closest?.('[data-segmented]')?.getAttribute('data-segmented') ??
        el.closest?.('[data-goal]')?.getAttribute('data-goal') ??
        el.closest?.('[data-track]')?.getAttribute('data-track') ??
        el.closest?.('[data-list-row]')?.getAttribute('data-list-row') ??
        '';
      /* The text is what tells one row of a list from the next, trimmed
         so a count ticking up does not make a mark into a new mark. */
      const text = (el.textContent ?? '').trim().replace(/\d+/g, '#').slice(0, 24);
      return `${scope ? `[${scope}]` : ''}${cls}|${text}`;
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
      if (act === 'none') return;
      if (act === 'inject') window.__yankProof();
      else if (act.startsWith('goto:')) location.assign(act.slice(5));
      else if (act === 'back') {
        const btn = document.querySelector('[data-screen-back]');
        if (btn) btn.click();
        else history.back();
      }
      else {
        const hits = document.querySelectorAll(act);
        const hit = [...hits].find((el) => el.offsetParent !== null) || hits[0];
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
export function findYanks(frames, instrument, settles = frames.length - 1, teleportPx = TELEPORT_PX) {
  const keys = new Set();
  for (const f of frames) for (const k of Object.keys(f[instrument])) keys.add(k);
  const yanks = [];

  for (const k of keys) {
    const run = frames.map((f, i) => ({ i, at: f.at, row: f[instrument][k] ?? null }));
    const present = run.filter((r) => r.row);
    if (present.length < 2) continue;

    /* The per-frame movement of this mark, over the frames where it is in
       the tree on both sides. Normalized to nominal 16ms frames so a dropped
       frame on hardware does not inflate apparent velocity. */
    const deltas = [];
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1].row;
      const b = run[i].row;
      if (!a || !b) continue;
      const dt = Math.max(1, (run[i].at ?? (i * 16)) - (run[i - 1].at ?? ((i - 1) * 16)));
      const steps = Math.max(1, dt / 16);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      deltas.push({ i, d, dNorm: d / steps, steps, at: run[i].at });
    }

    for (let n = 0; deltas.length && n < deltas.length; n++) {
      const { i, d, dNorm, steps, at } = deltas[n];
      if (d < teleportPx * steps) continue;
      /* The fastest of the frames either side, normalized to 16ms steps.
         A slide's neighbours are moving too; a teleport's are not.
         Across dropped frames on hardware, scale the ratio by the square root
         of steps to absorb normal ease-out deceleration across the multi-frame
         window while catching true teleport spikes. */
      const around = Math.max(deltas[n - 1]?.dNorm ?? 0, deltas[n + 1]?.dNorm ?? 0);
      const ratio = TELEPORT_RATIO * Math.max(1, Math.sqrt(steps));
      if (dNorm < Math.max(around, 0.25) * ratio) continue;
      yanks.push({
        kind: 'teleport',
        mark: k,
        frames: [i - 1, i],
        at,
        detail: `${Math.round(d)}px in one frame, ${Math.round(around * 10) / 10}px in the frames either side`
      });
    }

    /* Vanishing: full opacity to nothing, or out of the tree from full
       opacity, with no frame in between. Normalized by time delta so a
       smooth fade across a dropped frame (peak slope ~0.27/frame on a
       150ms ease-out) is not flagged as an instantaneous cut (>= 0.35/frame). */
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1].row;
      const b = run[i].row;
      if (!a || a.o < VISIBLE) continue;
      const dt = Math.max(1, (run[i].at ?? (i * 16)) - (run[i - 1].at ?? ((i - 1) * 16)));
      const steps = Math.max(1, dt / 16);
      const dropPerFrame = (a.o - (b ? b.o : 0)) / steps;
      if (b && b.o <= GONE && dropPerFrame >= 0.35)
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

/* ---------- the render detector (ticket 100's camera half) ----------
 *
 * Moved here from yank-sweep-device.mjs when the hydration sweep (ticket
 * 108) needed the same instrument on the desktop: a cold mount is the one
 * moment the DOM sampler cannot watch, because the navigation destroys the
 * page that was sampling - but a CDP screencast keeps arriving from the
 * compositor across the load, on the desktop exactly as on the phone. The
 * thresholds and the arithmetic are shared so the two cameras cannot drift;
 * what each transport does with a finding (evidence triples, the report)
 * stays with the transport. */

/** Two renders of the same pixel differing by less than this are the same
 *  render: PNG is lossless, so what moves under this is jpeg-less dither
 *  and text antialiasing settling. */
export const DIFF_EPS = 12;
/** A transient has to cover this share of the frame before it is a yank
 *  and not a highlight blinking. */
export const TRANSIENT_MIN = 0.03;
/** And the neighbours have to agree with each other this much better than
 *  either agrees with the finding, or the frame is just motion - a slide
 *  changes every frame, a flash changes one. */
export const OUTLIER_MIN = 0.03;
/** A screencast frame arriving much later than its neighbours saw a
 *  different slice of time than the styles did; motion aliased across a
 *  gap reads as a teleport. Guard rather than chase. */
export const GAP_RATIO = 2.5;

const round4 = (n) => Math.round(n * 10000) / 10000;

const diffMask = (a, b) => {
  const mask = new Uint8Array(a.length);
  let changed = 0;
  for (let i = 0; i < a.length; i++)
    if (Math.abs(a[i] - b[i]) > DIFF_EPS) {
      mask[i] = 1;
      changed++;
    }
  return { mask, frac: changed / a.length };
};

/** Connected regions of a mask, 4-neighbour flood fill. Returned largest
 *  first, regions under `minArea` px dropped. */
export function regions(mask, w, h, minArea) {
  const seen = new Uint8Array(mask.length);
  const out = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let stack = [i];
    seen[i] = 1;
    let area = 0;
    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p / w) | 0;
      area++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= mask.length || Math.abs((q % w) - x) > 1) continue;
        if (mask[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (area >= minArea)
      out.push({ area, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } });
  }
  return out.sort((a, b) => b.area - a.area);
}

/** A frame whose content differs from both its neighbours while the
 *  neighbours agree with each other: something painted that was never
 *  meant to be on screen. The style trace can be right and the render
 *  wrong - this reads the render. */
export function findPixelYanks(grays, w, h, ats) {
  const dts = [];
  for (let i = 1; i < grays.length; i++) dts.push(ats[i] - ats[i - 1]);
  const median = Math.max(16, dts.slice().sort((a, b) => a - b)[Math.floor(dts.length / 2)] || 16);
  const findings = [];
  const motion = [];
  for (let i = 1; i < grays.length - 1; i++) {
    const prev = diffMask(grays[i - 1], grays[i]);
    const next = diffMask(grays[i + 1], grays[i]);
    const skip = diffMask(grays[i + 1], grays[i - 1]);
    motion.push({ at: ats[i], prev: round4(prev.frac), next: round4(next.frac), skip: round4(skip.frac) });
    if (
      dts[i - 1] > median * GAP_RATIO ||
      dts[i] > median * GAP_RATIO
    )
      continue;
    /* Transient: changed against both neighbours, stable across them. */
    let transient = 0;
    const tmask = new Uint8Array(prev.mask.length);
    for (let p = 0; p < tmask.length; p++)
      if (prev.mask[p] && next.mask[p] && !skip.mask[p]) {
        tmask[p] = 1;
        transient++;
      }
    const frac = transient / tmask.length;
    const outlier = (prev.frac + next.frac) / 2 - 2 * skip.frac;
    if (frac < TRANSIENT_MIN || outlier < OUTLIER_MIN) continue;
    const found = regions(tmask, w, h, Math.round(0.002 * w * h));
    if (!found.length) continue;
    const top = found[0];
    const wide = top.box.w >= 0.5 * w && top.box.h >= 0.4 * h;
    findings.push({
      kind: wide || top.area >= 0.12 * w * h ? 'bloat' : 'flash',
      frame: i,
      at: Math.round(ats[i]),
      box: top.box,
      areaPct: round4(top.area / (w * h)),
      outlier: round4(outlier),
      regions: found.slice(0, 5).map((r) => ({ box: r.box, areaPct: round4(r.area / (w * h)) }))
    });
  }

  /* Multi-frame dropouts (ticket 117): a cohesive region visible before and after
   * that vanishes or blacks out across 2 or more consecutive frames (e.g. the
   * header dropping out during a view transition). Single-frame spikes are caught
   * above; this catches sustained dropouts. */
  for (let start = 1; start < grays.length - 2; start++) {
    const startDiff = diffMask(grays[start - 1], grays[start]);
    if (startDiff.frac < TRANSIENT_MIN) continue;

    for (let end = start + 2; end < Math.min(grays.length, start + 30); end++) {
      const endDiff = diffMask(grays[end - 1], grays[end]);
      if (endDiff.frac < TRANSIENT_MIN) continue;

      const skip = diffMask(grays[start - 1], grays[end]);
      let transient = 0;
      const tmask = new Uint8Array(startDiff.mask.length);
      for (let p = 0; p < tmask.length; p++) {
        if (startDiff.mask[p] && endDiff.mask[p] && !skip.mask[p]) {
          tmask[p] = 1;
          transient++;
        }
      }
      const frac = transient / tmask.length;
      if (frac < TRANSIENT_MIN) continue;

      // Verify region stayed changed on intermediate frames
      const mid = Math.floor((start + end) / 2);
      const midDiff = diffMask(grays[start - 1], grays[mid]);
      let midTransient = 0;
      for (let p = 0; p < tmask.length; p++) {
        if (tmask[p] && midDiff.mask[p]) midTransient++;
      }
      if (midTransient / tmask.length < TRANSIENT_MIN) continue;

      const found = regions(tmask, w, h, Math.round(0.002 * w * h));
      if (!found.length) continue;
      const top = found[0];

      // Avoid duplicate reports overlapping an already recorded dropout
      const already = findings.some(
        (f) => f.kind === 'dropout' && f.toFrame >= start && f.frame <= end
      );
      if (already) continue;

      findings.push({
        kind: 'dropout',
        frame: start,
        toFrame: end - 1,
        span: end - start,
        at: Math.round(ats[start]),
        duration: Math.round(ats[end] - ats[start]),
        box: top.box,
        areaPct: round4(top.area / (w * h)),
        regions: found.slice(0, 5).map((r) => ({ box: r.box, areaPct: round4(r.area / (w * h)) }))
      });
      break;
    }
  }

  return { findings, motion };
}

/* ---------- the hydration sweep's shared half (ticket 108) ---------- */

/** Every screen the app has, as one cold mount each - the full inventory
 *  the gesture sweep never aimed at. `at` is a route (with `{yesterday}`
 *  and `{<needs>}` tokens the transports fill in: the epoch day of
 *  yesterday, and the href of a record the profile's journal actually
 *  holds); `act`, where present, is a control whose sheet is the surface
 *  under test, opened after the screen has settled; `when` names the one
 *  profile a scene can exist in (`persona` needs data the empty journal
 *  does not have, `empty` the other way round); `setup` names a
 *  transport-side prologue no plain route visit can produce. */
const HYDRATION_SCENES = [
  /* Home tab */
  { name: 'home', at: '/', is: 'the whole of Home landing cold' },
  { name: 'home-celebrate', at: '/?celebrate=1', when: 'persona', is: 'the celebration card variant of Home' },
  { name: 'coming-back', at: '/coming-back', is: 'the return surface, reached by hand' },
  { name: 'doubt', at: '/doubt', is: 'the counterevidence check' },
  { name: 'on-this-day', at: '/on-this-day', is: 'on this day and its lookbacks' },
  /* Calendar tab */
  { name: 'calendar', at: '/calendar', is: 'the heat map month' },
  { name: 'day-today', at: '/day/today', is: "today's day view" },
  { name: 'day-yesterday', at: '/day/{yesterday}', when: 'persona', is: "a full day view from the journal's past" },
  /* The editor's scale, text and tag surfaces are one EntryEditor
     component; a blank editor, a mood-seeded one and an existing entry
     opened for editing are the three mount paths it has. */
  { name: 'entry-new', at: '/entry/new/today', is: 'a fresh entry editor' },
  { name: 'entry-new-seeded', at: '/entry/new/today?seedMood=3', is: 'the editor with a mood already seeded' },
  { name: 'entry-edit', at: '/entry/{entry}', needs: 'entry', when: 'persona', is: 'an existing entry opened for editing' },
  { name: 'search', at: '/search', is: 'search and its filter sheet' },
  { name: 'search-starred', at: '/search/starred', is: 'the starred shelf' },
  { name: 'search-questions', at: '/search/questions', is: 'the saved-question shelf' },
  { name: 'search-question', at: '/search/questions/{question}', needs: 'question', when: 'persona', is: 'one saved question answered' },
  /* Stats tab */
  { name: 'stats', at: '/stats', is: 'the look-back index, charts and all' },
  { name: 'body-map', at: '/body-map', is: 'the body map over its range' },
  { name: 'tally', at: '/tally', is: 'the tally chart' },
  { name: 'compare', at: '/compare', is: 'then versus now' },
  { name: 'wrapped-week', at: '/wrapped/week', when: 'persona', is: 'a wrapped week' },
  { name: 'wrapped-month', at: '/wrapped/month', when: 'persona', is: 'a wrapped month' },
  { name: 'wrapped-year', at: '/wrapped/year', when: 'persona', is: 'a wrapped year' },
  { name: 'wrapped-range', at: '/wrapped/range', is: 'the wrapped range picker' },
  { name: 'wrapped-share', at: '/wrapped/month/share', needs: 'entry', when: 'persona', is: 'the share card builder' },
  /* More hub and the Body group */
  { name: 'more', at: '/more', is: 'the hub itself' },
  { name: 'hair-progress', at: '/body/hair-progress', is: 'hair staged against the published scale' },
  { name: 'hair-removal', at: '/body/hair-removal', is: 'electrolysis and laser sessions' },
  { name: 'measurements', at: '/body/measurements', is: 'measurements over time' },
  { name: 'sizes', at: '/body/sizes', is: 'sizes and how they fit' },
  /* Health group */
  { name: 'care', at: '/care', is: 'the care dashboard' },
  { name: 'appointment-prep', at: '/health/appointment-prep', is: 'appointment prep questions' },
  { name: 'appointments', at: '/health/appointments', is: 'the appointment list' },
  { name: 'in-the-room', at: '/health/appointments/in-the-room', is: 'the in-the-room card' },
  { name: 'clinician-summary', at: '/health/clinician-summary', is: 'the printable summary' },
  { name: 'cycle-events', at: '/health/cycle-events', is: 'cycle events' },
  { name: 'dilation', at: '/health/dilation', is: 'the dilation taper' },
  { name: 'side-effects', at: '/health/side-effects', is: 'side effects logged plainly' },
  { name: 'surgery', at: '/health/surgery', is: 'the surgery journal' },
  { name: 'hormone-curve', at: '/settings/hormone-curve', is: 'the hormone curve' },
  { name: 'doses', at: '/doses', is: 'the dose log' },
  { name: 'labs', at: '/settings/labs', is: 'lab results' },
  { name: 'regimen', at: '/settings/regimen', is: 'the regimen editor' },
  { name: 'stock', at: '/settings/stock', is: 'stock and the run-out day' },
  { name: 'exposure', at: '/settings/exposure', is: 'cumulative exposure' },
  /* Transition group */
  { name: 'milestones', at: '/transition/milestones', is: 'the milestone rail over its list' },
  { name: 'roadmap', at: '/transition/roadmap', is: 'the roadmap checklist' },
  { name: 'letters', at: '/transition/letters', is: 'letters written to be read later' },
  { name: 'letter-detail', at: '/transition/letters/{letter}', needs: 'letter', when: 'persona', is: 'one letter, read' },
  { name: 'tryouts', at: '/transition/tryouts', is: 'presentation tryouts' },
  { name: 'tryout-detail', at: '/transition/tryouts/{tryout}', needs: 'tryout', when: 'persona', is: 'one tryout over time' },
  { name: 'presentations', at: '/transition/presentations', is: 'the presentation catalogue' },
  { name: 'eras', at: '/transition/eras', is: 'named spans of a life' },
  { name: 'words', at: '/transition/words', is: "the notes' own words" },
  /* Practice group */
  { name: 'entry-templates', at: '/practice/entry-templates', is: 'editable entry templates' },
  { name: 'personal-effects', at: '/practice/personal-effects', is: 'the changes-first-noticed timeline' },
  { name: 'resources', at: '/practice/resources', is: 'organisations and helplines' },
  { name: 'voice', at: '/practice/voice', is: 'the voice benchmark' },
  { name: 'voice-record', at: '/practice/voice?tab=record', is: 'the benchmark record tab' },
  { name: 'voice-metrics', at: '/practice/voice/metrics', is: 'the metric reference' },
  { name: 'voice-memos', at: '/media/voice/memos', is: 'the memo browser' },
  { name: 'wear', at: '/practice/wear', is: 'wear time tracked plainly' },
  /* Media */
  { name: 'photos', at: '/media/photos', is: 'progress photos, then and now' },
  { name: 'photos-export', at: '/media/photos/export', is: 'the photo journey export' },
  { name: 'documents', at: '/media/documents', is: 'documents held by the journal' },
  { name: 'document-detail', at: '/media/documents/{document}', needs: 'document', when: 'persona', is: 'one document' },
  /* Settings */
  { name: 'settings', at: '/settings', is: 'preferences, three sections of them' },
  { name: 'tags', at: '/settings/tags', is: 'the tag manager' },
  { name: 'reminders', at: '/settings/reminders', is: 'the reminder list' },
  { name: 'reminders-new', at: '/settings/reminders/new', is: 'a reminder being written' },
  { name: 'reminder-detail', at: '/settings/reminders/{reminder}', needs: 'reminder', when: 'persona', is: 'one reminder, open for editing' },
  { name: 'access-mode', at: '/settings/access-mode', is: 'the access-mode chooser' },
  { name: 'passphrase', at: '/settings/passphrase', is: 'the passphrase change screen' },
  { name: 'recovery-key', at: '/settings/recovery-key', is: 'the recovery key mint and revoke' },
  { name: 'security', at: '/settings/security', is: 'the security module' },
  { name: 'affirmations', at: '/settings/affirmations', is: 'affirmations' },
  { name: 'body-regions', at: '/settings/body-regions', is: 'the body-region editor' },
  { name: 'dimension', at: '/settings/dimension', is: 'a custom dimension' },
  { name: 'export', at: '/settings/export', is: 'backup, restore and import' },
  { name: 'journal-book', at: '/settings/journal-book', is: 'the print of a chosen range' },
  { name: 'journaling-pause', at: '/settings/journaling-pause', is: 'a pause over the journal' },
  /* No live-tiles scene: deepening ticket 09 merged that screen into
     /settings/notifications, and the route now client-replaces to it, so
     a scene pinned to the old path can only ever time out - the
     notifications scene below already covers the merged surface. */
  { name: 'notifications', at: '/settings/notifications', is: 'the notifications half of the registry' },
  { name: 'permissions', at: '/settings/permissions', is: 'what the app asks the device for' },
  { name: 'trash', at: '/settings/trash', is: 'the 30-day window' },
  /* Sheets over settled screens: the sheet's own hydration is the question,
     so these wait the screen out first and then record the opening. The
     palette chooser is not among them because it is not a sheet any more:
     the eight swatches render inline on the settings screen itself, so
     that scene's cold mount is the whole of the surface, and picking one
     re-themes in place with no layout consequence, which both detectors
     are right to ignore. The quick-log dims sheet is a query param, so it
     opens over Home's own cold mount - the after-save state a real quick
     log lands in. */
  { name: 'quick-log-dims', at: '/?quickLogDims={entry}', needs: 'entry', when: 'persona', is: 'the after-save dims sheet opening over Home' },
  { name: 'quick-add-fan', at: '/', act: '[data-rail-add], [data-nav-fab]', is: 'the quick add fan opening' },
  { name: 'doses-sheet', at: '/doses', act: '[data-add]', is: 'the dose editor sheet' },
  { name: 'surgery-sheet', at: '/health/surgery', act: '[data-add]', is: 'the procedure sheet' },
  /* The two prologue scenes. Onboarding only exists before the profile
     finishes it, so the empty profile records its cold mount between the
     jump and the walk. The lock gate is a boot state no route produces:
     the persona epilogue wraps a PIN around the journal and cold-loads
     into the gate, then unwraps it again so the phone is left usable. */
  { name: 'onboarding-mount', at: '/onboarding', when: 'empty', setup: 'first-run', is: 'the first run opening over an empty journal' },
  { name: 'lock-gate', at: '/', when: 'persona', setup: 'pin', is: 'the PIN gate drawn on a cold load' }
];

/** Where each `needs` token is scraped from: the list screen that links
 *  the detail records, and the href prefix that identifies them. One
 *  place, so the desktop and device crawlers resolve the same ids. */
export const HYDRATION_NEEDS = {
  entry: { list: '/day/today', prefix: '/entry/' },
  letter: { list: '/transition/letters', prefix: '/transition/letters/' },
  tryout: { list: '/transition/tryouts', prefix: '/transition/tryouts/' },
  question: { list: '/search/questions', prefix: '/search/questions/' },
  reminder: { list: '/settings/reminders', prefix: '/settings/reminders/' },
  document: { list: '/media/documents', prefix: '/media/documents/' }
};

/** The hydration scenes a run covers: the table above, with the proof
 *  scene prepended when the run is out to show the sweep can fail,
 *  narrowed to `only`. */
export function hydrationScreensFor({ prove = false, only = [] } = {}) {
  const scenes = prove
    ? [{ name: PROOF.scene, at: '/', is: 'three marks built to be wrong, so the arithmetic can be seen to catch them' }, ...HYDRATION_SCENES]
    : HYDRATION_SCENES;
  return only.length ? scenes.filter((s) => only.includes(s.name)) : scenes;
}

/** The first href into a detail route on the page the transport has
 *  already settled: exactly one segment beyond the prefix, and not the
 *  "new" editor, so a list's own add-controls cannot pose as a record. */
export const scrapeHrefExpression = (prefix) => `(async () => {
  for (const a of document.querySelectorAll('a[href^=${JSON.stringify(prefix)}]')) {
    const href = a.getAttribute('href');
    if (href.split('/').length !== ${JSON.stringify(prefix)}.split('/').length + 1) continue;
    if (href.split('/').pop() === 'new') continue;
    return href;
  }
  return null;
})()`;

/** Waiting for a demo-bar state jump to be *finished* (ticket 135).
 *
 *  Both expressions below used to wait for a screen: the reset for
 *  `[data-home-hello]`, the fill for `/more`. Neither means finished. Home
 *  is already on screen when the reset is clicked from Home, so that wait
 *  returned on its first read, the harness clicked the next jump, and the
 *  second jump's journal clear landed between the first seed's
 *  presentations and the entries that name them - `unknown presentation`
 *  in the page, and a persona missing its later days in every scene the
 *  sweep then photographed.
 *
 *  `data-demo-busy` (DemoBar.svelte) is on the bar for the length of a
 *  jump and gone when it is over, navigation included, which is the only
 *  thing here that means what the wait wants. The bar also disables its own
 *  controls for that length and drops a click that arrives anyway, so a
 *  click is refused rather than queued - which is why these wait for an
 *  idle bar before clicking as well as after. The 50ms is the state flush
 *  after the click, not the jump: the jump is a worker round trip and
 *  cannot finish inside it. */
const DEMO_BAR_IDLE = `for (let i = 0; i < 120 && document.querySelector('[data-demo-busy]'); i++) await sleep(500);`;
const AWAIT_DEMO_JUMP = `
  await sleep(50);
  ${DEMO_BAR_IDLE}
  if (document.querySelector('[data-demo-busy]')) throw new Error('the demo jump never finished');`;

/** The demo bar's persona reset, as an expression so the desktop crawler
 *  and the device crawler drive the same control. Seeding 150 days is a
 *  second or more of writes. */
export const RESET_PERSONA_EXPRESSION = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  ${DEMO_BAR_IDLE}
  const btn = document.querySelector('[data-reset-demo]');
  if (!btn) throw new Error('no Reset demo state button on the demo bar');
  btn.click();
  ${AWAIT_DEMO_JUMP}
  return !!document.querySelector('[data-home-hello]');
})()`;

export const FILL_EVERY_FEATURE_EXPRESSION = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  ${DEMO_BAR_IDLE}
  const btn = document.querySelector('[data-fill-every-feature]');
  if (!btn) return false;
  btn.click();
  ${AWAIT_DEMO_JUMP}
  return location.pathname.includes('/more');
})()`;

/** The empty profile, split where the onboarding-mount scene needs the
 *  seam: the jump itself (after which the first-run gate owns the page),
 *  and the walk that finishes the flow and leaves an onboarded journal
 *  with nothing in it. */
export const JUMP_FIRST_RUN_EXPRESSION = `(() => {
  const jump = document.querySelector('#demo-jump');
  if (!jump) throw new Error('no demo jump control');
  jump.value = 'first-run';
  jump.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

export const WALK_FIRST_RUN_FINISH_EXPRESSION = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /* Generous, because the jump that opens this walks markFirstRun first:
     emptying the demo journal's 150 days of deletes runs through the
     worker, which a phone serves an order of magnitude slower than the
     desktop the 15 s this used to be was tuned on. */
  for (let i = 0; i < 180 && !document.querySelector('[data-next]'); i++) await sleep(250);
  if (!document.querySelector('[data-next]')) throw new Error('the first run did not open');
  for (const step of ${JSON.stringify(SETUP_STEPS)}) {
    await sleep(500);
    if (step === 'name') {
      const name = document.querySelector('#ob-name');
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(name), 'value').set.call(name, 'Ola');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    }
    /* The lock step has no foot of its own on an install that has not
       chosen an access mode yet: the AccessModeSetup module replaces
       [data-next] with its own two screens, so the walk picks the
       unlocked mode (the one with no secret to type) and confirms it,
       which is the choice a sweep journal wants anyway - nothing it
       later does should sit behind a keystore. */
    if (step === 'lock' && !document.querySelector('[data-next]') && document.querySelector('[data-access-modes]')) {
      document.querySelector('[data-list-row="unlocked"]').click();
      for (let i = 0; i < 40 && !document.querySelector('[data-access-submit]'); i++) await sleep(250);
      const submit = document.querySelector('[data-access-submit]');
      if (!submit) throw new Error('the access-mode module never offered its confirm');
      submit.click();
      for (let i = 0; i < 80 && !document.querySelector('[data-next]'); i++) await sleep(250);
    }
    if (step === 'done') break;
    document.querySelector('[data-next]').click();
    await sleep(350);
  }
  const finish = document.querySelector('[data-finish]');
  if (!finish) throw new Error('no finish control on the done step');
  finish.click();
  for (let i = 0; i < 60 && !document.querySelector('[data-home-hello]'); i++) await sleep(500);
  return !!document.querySelector('[data-home-hello]');
})()`;

/** The demo bar's theme buttons, so a cold load reads the run's theme out
 *  of the preferences the boot stamps rather than out of a stylesheet
 *  patched after the fact. */
export const DEMO_THEME_EXPRESSION = (theme) => `(() => {
  const btn = [...document.querySelectorAll('.demo-bar button')].find((b) =>
    (b.textContent ?? '').trim() === ${JSON.stringify(theme === 'dark' ? 'Dark' : 'Light')}
  );
  if (!btn) throw new Error('no ${theme} button on the demo bar');
  btn.click();
  return true;
})()`;

/** The lock-gate epilogue: walk the access-mode screen into a PIN, so the
 *  next cold load has a gate to draw. The pad completes and submits itself
 *  at four digits (PinPad.svelte), so the digits are clicked and the
 *  navigation away is waited for; a mismatch surfaces as the final wait
 *  failing rather than as a silent skip. */
export const LOCK_SETUP_EXPRESSION = (pin) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  const wait = async (s, ms = 10000) => {
    for (let i = 0; i < ms / 200 && !q(s); i++) await sleep(200);
    if (!q(s)) throw new Error('never appeared: ' + s);
  };
  const row = q('[data-list-row="pin"]');
  if (!row) throw new Error('no pin row on the access-mode screen');
  row.click();
  await wait('[data-access-continue]');
  q('[data-access-continue]').click();
  await wait('[data-pin-pad]');
  for (let entry = 0; entry < 2; entry++) {
    for (const digit of ${JSON.stringify(pin)}) {
      const key = q('[data-pin-pad] [data-key="' + digit + '"]');
      if (!key) throw new Error('no ' + digit + ' key on the pad');
      key.click();
      await sleep(140);
    }
    await sleep(800);
  }
  /* Settled is either control the settings screen offers, or the
     confirmation's own navigation: after the second PIN entry the module
     can land on /settings/security itself, where the link this used to
     wait for is not on the page - the page IS it. */
  let settled = false;
  for (let i = 0; i < 50; i++) {
    if (q('a[href="/settings/security"], [data-screen-back]') || location.pathname === '/settings/security') {
      settled = true;
      break;
    }
    await sleep(200);
  }
  if (!settled) throw new Error('the PIN setup never settled on security or a way back');
  return true;
})()`;

/** And out again, so the epilogue leaves the phone or profile usable. */
export const UNLOCK_PIN_EXPRESSION = (pin) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const digit of ${JSON.stringify(pin)}) {
    const key = document.querySelector('[data-pin-pad] [data-key="' + digit + '"]');
    if (!key) throw new Error('no pad to unlock with');
    key.click();
    await sleep(140);
  }
  for (let i = 0; i < 40 && !document.querySelector('[data-home-hello]'); i++) await sleep(250);
  return !!document.querySelector('[data-home-hello]');
})()`;

/* ---------- the hydration sweep's node-side helpers ----------
 *
 * The analysis over a recorded scene is transport-independent - frames
 * are frames whether Playwright or the devtools socket gathered them -
 * so it lives here once rather than as a near-verbatim twin in each
 * crawler. What each transport keeps for itself is the driving: how a
 * navigation happens, how a sampler is started, what settling means. */

/** How many evidence triples a single run will write before the disk
 *  comes before the report. */
export const EVIDENCE_CAP = 60;

/** The style half over a hydration window: the DOM sampler's frames,
 *  read with the ticket's 24px floor rather than the gesture floor. A
 *  stray view transition (none of these scenes gesture, but a route may)
 *  is sliced off the front exactly as the gesture sweep slices its runs,
 *  so what is read is the tree that was painted. */
export function findHydrationYanks(frames) {
  const active = frames.map((f, i) => (f.active ? i : -1)).filter((i) => i >= 0);
  const sliced = active.length ? frames.slice(active.at(-1) + 1) : frames;
  if (sliced.length < 2) return { yanks: [], frames: sliced.length, sampled: frames.length };
  const all = findYanks(sliced, 'rows', sliced.length - 1, HYDRATION_PX);
  return {
    yanks: all.filter((y) => !EXEMPT.test(y.mark)),
    frames: sliced.length,
    sampled: frames.length
  };
}

/** The render half over the same scene's cast, with the timestamped
 *  evidence triples its findings name. The timestamp in the filename is
 *  the cast's own clock, so a PNG and the finding it belongs to cannot
 *  come apart - and both transports name them identically. */
export async function readRenderYanks(cast, outDir, name, label, cap = EVIDENCE_CAP) {
  /* A screencast emits only on a new compositor frame, so a cold load that
     paints once and then holds still produces very few: the outgoing page,
     sometimes the new document's blank, the screen, and then nothing at all
     for the rest of the window. Measured on the lock gate across ten runs
     once ticket 127 stopped it mounting a splash first - three frames seven
     times, four twice, two once - against a floor of four, which failed
     three runs out of four as `only 3 screencast frames` (ticket 134).

     A thin cast is not a recording nobody looked at. A dropout is a frame
     showing the gap, so a load with no frames between the old screen and
     the new one is positive evidence that there was none, not a failure to
     check - and whether the screen arrived at all is already proved by the
     selector each scene waits for before any of this runs. What is left to
     refuse is a camera that recorded nothing of the change: one frame, or
     none. */
  if (cast.length < 2) throw new Error(`only ${cast.length} screencast frames`);
  const decoded = cast.map((f) => {
    const png = decodePng(Buffer.from(f.data, 'base64'));
    return { png, gray: grayFrame(png), at: f.at };
  });
  const sizes = new Map();
  for (const d of decoded) {
    const k = `${d.png.width}x${d.png.height}`;
    sizes.set(k, (sizes.get(k) || 0) + 1);
  }
  let dominantKey = '';
  let maxCount = -1;
  for (const [k, count] of sizes) {
    if (count > maxCount) {
      maxCount = count;
      dominantKey = k;
    }
  }
  const [width, height] = dominantKey.split('x').map(Number);
  const uniform = decoded.filter((d) => d.png.width === width && d.png.height === height);
  if (uniform.length < 3) return { findings: [], cast: cast.length };

  const { findings } = findPixelYanks(
    uniform.map((d) => d.gray),
    width,
    height,
    uniform.map((d) => d.at)
  );
  let written = 0;
  for (const finding of findings) {
    if (written >= cap) break;
    const i = finding.frame;
    const endI = finding.toFrame !== undefined ? finding.toFrame + 1 : i + 1;
    for (const [suffix, index] of [
      ['a', i - 1],
      ['b', i],
      ['c', endI]
    ])
      if (cast[index])
        await writeFile(`${outDir}/${name}-${label}-${Math.round(finding.at)}ms${suffix}.png`, Buffer.from(cast[index].data, 'base64'));
    written++;
  }
  return { findings, cast: cast.length };
}

/** The tokens a scene's route may carry, filled in from the calendar and
 *  the profile's journal. An unresolved token stays visible as itself so
 *  a skip reads as a skip in the report, not as a wrong route. */
export const fillTokens = (at, tokens) =>
  at.replace(/\{(\w+)\}/g, (_, key) => tokens[key] ?? `{${key}:unresolved}`);

/** The day the journal's "yesterday" is, in the app's own units. */
export const yesterdayEpochDay = () => Math.floor(Date.now() / 86400000) - 1;

/** One scene's console line, shaped the same on both transports so a
 *  desktop log and a device log can be read side by side. */
export function describeHydrationRun(name, dom, render) {
  return `${name}: ${dom.frames} style / ${render.cast} render frames, ${dom.yanks.length} style / ${render.findings.length} render yank(s)` +
    (dom.yanks.length || render.findings.length
      ? `\n  ${[
          ...dom.yanks.map((y) => `style ${y.kind} ${y.mark} @${y.at}ms - ${y.detail}`),
          ...render.findings.map(
            (f) => `render ${f.kind} @${f.at}ms box ${f.box.w}x${f.box.h} area ${(f.areaPct * 100).toFixed(1)}%`
          )
        ].join('\n  ')}`
      : '');
}

/** A recorded scene, analysed and reported: both detectors, the frames
 *  written whenever there is a style finding to read them against, one
 *  report entry, one console line. `result` is whatever the transport's
 *  recorder gathered - `{ cast, frames }` on both ends, by construction
 *  rather than by type. */
export async function pushHydrationRun(report, outDir, { name, is, profile, theme, result, href = null, dump = false }) {
  const dom = findHydrationYanks(result.frames);
  const render = await readRenderYanks(result.cast, outDir, name, `${profile}-${theme}`);
  if (dump || dom.yanks.length)
    await writeFile(`${outDir}/${name}-${profile}-${theme}.frames.json`, JSON.stringify(result.frames, null, 1));
  const entry = {
    scene: name,
    profile,
    theme,
    is,
    instrument: 'rows',
    styleFrames: dom.frames,
    sampled: dom.sampled,
    cast: render.cast,
    styleYanks: dom.yanks,
    pixelFindings: render.findings
  };
  if (href) entry.href = href;
  report.push(entry);
  console.log(`[${profile}-${theme}] ${describeHydrationRun(name, dom, render)}`);
  return entry;
}

/** What the proof scene owes but did not deliver, read off whichever
 *  yank field the calling report shape carries (`styleYanks` for the
 *  device and hydration reports, `yanks` for the gesture desktop). */
export function missingProofYanks(report) {
  const scene = report.find((r) => r.scene === PROOF.scene);
  const yanks = scene?.styleYanks ?? scene?.yanks ?? [];
  const got = (mark, kind) => yanks.some((y) => y.mark.startsWith(mark) && y.kind === kind);
  return [
    got(PROOF.teleport, 'teleport') ? null : `a 200px jump on ${PROOF.teleport}`,
    got(PROOF.vanish, 'vanish') ? null : `a one-frame cut on ${PROOF.vanish}`,
    got(PROOF.bloat, 'bloat') ? null : `a one-frame bloat on ${PROOF.bloat}`
  ].filter(Boolean);
}
