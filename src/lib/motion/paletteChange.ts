import { tick } from 'svelte';
import { EASE_OUT_SOFT_CSS, isReducedMotion, motionDuration } from './tokens';
import { holdTaps, type TapHold } from './tapReplay';

let latestChange = 0;
/* One hold across choices that land on each other: a tap made during the
   first bloom is replayed when the last one ends, not into the next. */
let taps: TapHold | null = null;
type Appearance = 'palette' | 'theme';
const pending: Partial<Record<Appearance, () => void>> = {};

export function isAppearancePending(kind: Appearance): boolean {
  return pending[kind] !== undefined;
}

/* Expand a circle from the sun's centre at the window's top right.
   A real disc of new stripes rides the clip's edge, outer stripe
   first. Start both animations together with the same easing, using
   transform and clip-path. At full size the rim clears the farthest
   corner and can be removed. */

/** How wide the ring band is, as a share of the reach. */
const BAND = 0.25;
/** The black seam at each ring's outer edge, at full size (rule 8 draws it
    3px on the sun; the band crosses the middle of the screen at about half
    size, where this reads as the same 3px). */
const SEAM = 6;

export function bloomGeometry(centre: { x: number; y: number }, width: number, height: number) {
  const reach = Math.max(
    ...[[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => Math.hypot(x - centre.x, y - centre.y))
  );
  return { x: centre.x, y: centre.y, reach, outer: reach * (1 + BAND) };
}

/** Stripes listed outermost first, as the sun draws them. */
export function bloomGradient(stripes: string[], reach: number, outer: number, seam = SEAM): string {
  const band = (outer - reach) / stripes.length;
  const px = (n: number) => `${Math.round(n * 100) / 100}px`;
  const stops = [...stripes].reverse().map((colour, i) => {
    const from = reach + i * band;
    const to = from + band;
    return `${colour} ${px(from)} ${px(to - seam)}, #000 ${px(to - seam)} ${px(to)}`;
  });
  return `radial-gradient(circle farthest-side, transparent 0px ${px(reach)}, ${stops.join(', ')})`;
}

/** Where the bloom grows from: the window's top right corner, which is
    where the sun's centre sits on an unscrolled screen. Not the sun's
    current position - on Settings the theme row is usually scrolled to,
    which carried the sun (and the centre) off the top of the window and
    made the circle arrive as a flat edge (Alicja, after prh12). */
export function bloomOrigin(doc: Document): { x: number; y: number } {
  return { x: doc.documentElement.clientWidth, y: 0 };
}

/** The rings of the sun on screen after the change. Setup keeps the sun it
    is leaving under the new one's redraw, and Svelte makes an element inert
    while it transitions out, so a ring under `[inert]` belongs to the flag
    being left. */
export function incomingRings(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>('[data-flag-sun] > i')].filter((ring) => !ring.closest('[inert]'));
}

function reducedMotion(doc: Document): boolean {
  return isReducedMotion(doc) || !!doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

interface Bloom {
  /** After the new colours are applied, before the new side is captured. */
  addRings(): void;
  play(): void;
  remove(): void;
}

function prepareBloom(doc: Document): Bloom | null {
  const root = doc.documentElement;
  if (!doc.querySelector || !doc.defaultView || typeof root.animate !== 'function' || reducedMotion(doc)) return null;
  const { x, y, reach, outer } = bloomGeometry(bloomOrigin(doc), root.clientWidth, root.clientHeight);
  root.style.setProperty('--bloom-at', `${x}px ${y}px`);
  let rings: HTMLElement | null = null;
  return {
    addRings() {
      /* The new sun's own colours, outermost ring first. */
      const stripes = incomingRings(doc)
        .sort((a, b) => b.offsetWidth - a.offsetWidth)
        .map((ring) => getComputedStyle(ring).backgroundColor);
      if (!stripes.length) return;
      rings = doc.createElement('div');
      rings.setAttribute('aria-hidden', 'true');
      Object.assign(rings.style, {
        position: 'fixed',
        left: `${x - outer}px`,
        top: `${y - outer}px`,
        width: `${outer * 2}px`,
        height: `${outer * 2}px`,
        borderRadius: '50%',
        background: bloomGradient(stripes, reach, outer),
        transform: 'scale(0)',
        pointerEvents: 'none',
        zIndex: '2147483647'
      });
      doc.body.append(rings);
    },
    play() {
      const timing = { duration: motionDuration('--dur-bloom'), easing: EASE_OUT_SOFT_CSS, fill: 'both' as const };
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${outer}px at ${x}px ${y}px)`] },
        { ...timing, pseudoElement: '::view-transition-new(root)' }
      );
      rings?.animate({ transform: ['scale(0)', 'scale(1)'] }, timing);
    },
    remove() {
      rings?.remove();
      rings = null;
    }
  };
}

/** Capture both appearances so the new colours can bloom over the old. */
function changeAppearance(commit: () => void, kind: Appearance, doc: Document): void {
  pending[kind] = commit;
  const change = ++latestChange;
  function applyPending() {
    for (const choice of ['palette', 'theme'] as const) {
      const apply = pending[choice];
      delete pending[choice];
      apply?.();
    }
  }
  if (!doc.startViewTransition) {
    if (doc.documentElement) {
      delete doc.documentElement.dataset.appearanceTransition;
      delete doc.documentElement.dataset.paletteTransition;
    }
    applyPending();
    return;
  }

  const root = doc.documentElement;
  root.dataset.appearanceTransition = '';
  if (pending.palette) root.dataset.paletteTransition = '';
  else delete root.dataset.paletteTransition;
  const bloom = prepareBloom(doc);
  if (!taps && typeof doc.addEventListener === 'function') taps = holdTaps(doc);
  const transition = doc.startViewTransition(async () => {
    if (change !== latestChange) return;
    applyPending();
    await tick();
    bloom?.addRings();
  });
  /* A skipped transition - a second choice, a viewport resize - rejects
     `ready` as well, and nothing else reads it. */
  void transition.ready.then(() => bloom?.play(), () => {});
  void transition.finished.catch(() => {}).finally(() => {
    bloom?.remove();
    if (change === latestChange) {
      applyPending();
      delete root.dataset.appearanceTransition;
      delete root.dataset.paletteTransition;
      root.style?.removeProperty('--bloom-at');
      taps?.finish();
      taps = null;
    }
  });
}

export function changePalette(commit: () => void, doc: Document = document): void {
  changeAppearance(commit, 'palette', doc);
}

export function changeTheme(commit: () => void, doc: Document = document): void {
  changeAppearance(commit, 'theme', doc);
}
