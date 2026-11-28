/* Play the 1.3 s welcome opening once per mount. The sun draws its rings,
   then the wordmark and copy appear before the actions fade in. Actions
   are live from the first frame; step navigation does not replay it.

   Create paused animations and start them when the splash begins to
   leave. Otherwise they run unseen and hold the splash while it waits for
   finite animations to end. Reduced motion uses a 200 ms Web Animations
   crossfade because base.css clamps CSS animations to 1 ms. */

import { EASE_OUT_CSS, motionDistance } from '../motion/tokens';

/** One stripe after another, from the corner out. */
export const RING_STAGGER_MS = 90;
const RING_MS = 560;
/** The ring entrance's own curve (components.css, `ring-in`). */
const RING_EASE = 'cubic-bezier(0.2, 0.7, 0.3, 1)';
export const REDUCED_FADE_MS = 200;
/** What the opening's animations are called, so a probe can tell them
    from the step machine's own. */
const OPENING_ID = 'welcome-opening';

export interface Beat {
  delay: number;
  duration: number;
}

const MARK: Beat = { delay: 240, duration: 640 };
const SIGN: Beat = { delay: 400, duration: 480 };
/* One line under the field since the privacy promise left the welcome;
   kept a list so a second line takes the next beat. */
const LINES: Beat[] = [{ delay: 560, duration: 480 }];
const FOOT: Beat = { delay: 780, duration: 500 };

/** When the last part lands, for a flag of up to seven stripes. */
export const OPENING_TOTAL_MS = FOOT.delay + FOOT.duration;

/** The opening's timing. `rings` innermost first. */
export function openingBeats(rings: number) {
  return {
    rings: Array.from({ length: rings }, (_, k): Beat => ({ delay: k * RING_STAGGER_MS, duration: RING_MS })),
    mark: MARK,
    sign: SIGN,
    lines: LINES,
    foot: FOOT
  };
}

/** The scale a ring opens from: the edge of the ring inside it, so its band
    is uncovered from that edge outwards rather than spending most of its
    time as a disc hidden under the rings drawn before it. `diameters` is
    outermost first, the order FlagSun draws them in. */
export function ringFromScale(diameters: readonly number[], i: number): number {
  const inner = diameters[i + 1];
  return inner === undefined ? 0 : inner / diameters[i];
}

/** Runs `go` once the first frame is leaving or gone (lib/splash.ts sets
    `data-splash` to '' while it holds, 'leaving' as it fades, and removes
    it after). Returns a cancel. */
function afterSplash(doc: Document, go: () => void): () => void {
  const root = doc.documentElement;
  const holding = () => root.dataset.splash === '';
  if (!holding()) {
    go();
    return () => {};
  }
  const observer = new MutationObserver(() => {
    if (holding()) return;
    observer.disconnect();
    go();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-splash'] });
  return () => observer.disconnect();
}

/**
 * Plays the opening over the welcome inside `frame`, which marks its parts:
 * the sun to draw is `[data-opening-sun]`, and `data-opening` names the
 * rest (`mark`, `sign`, `line`, `foot`). Returns a cancel, which leaves
 * every part where it rests.
 */
export function playOpening(frame: HTMLElement, { reduced }: { reduced: boolean }): () => void {
  const animations: Animation[] = [];
  const play = (el: Element, keyframes: Keyframe[], beat: Beat, easing: string) =>
    animations.push(el.animate(keyframes, { ...beat, easing, fill: 'backwards', id: OPENING_ID }));

  if (reduced) {
    play(frame, [{ opacity: 0 }, { opacity: 1 }], { delay: 0, duration: REDUCED_FADE_MS }, 'linear');
  } else {
    const rise = (distance: number): Keyframe[] => [
      { opacity: 0, translate: `0 ${distance}px` },
      { opacity: 1, translate: '0 0' }
    ];
    const md = motionDistance('--motion-distance-md');
    const sm = motionDistance('--motion-distance-sm');
    const beats = openingBeats(0);
    for (const el of frame.querySelectorAll('[data-opening="mark"]')) play(el, rise(md), beats.mark, EASE_OUT_CSS);
    for (const el of frame.querySelectorAll('[data-opening="sign"]')) play(el, rise(sm), beats.sign, EASE_OUT_CSS);
    frame.querySelectorAll('[data-opening="line"]').forEach((el, i) =>
      play(el, rise(sm), beats.lines[Math.min(i, beats.lines.length - 1)], EASE_OUT_CSS)
    );
    /* The foot fades where it stands rather than rising. It sits on the
       frame's bottom edge, so starting it 10px lower put it past the frame
       for the first 1.3s: the frame overflowed by exactly those 10px, which
       the walkthrough's setup no-scroll flow measured as a clipped step. */
    for (const el of frame.querySelectorAll('[data-opening="foot"]'))
      play(el, [{ opacity: 0 }, { opacity: 1 }], beats.foot, EASE_OUT_CSS);
  }

  /* The rings are read when the opening starts rather than here: the flag's
     stripes reach FlagSun after the page has mounted, so on mount the sun
     can still have no rings to draw. Under the first frame nothing they do
     is seen. */
  const drawRings = () => {
    if (reduced) return;
    const outerFirst = [...frame.querySelectorAll<HTMLElement>('[data-opening-sun] .sun-ring')];
    const diameters = outerFirst.map((ring) => parseFloat(ring.style.getPropertyValue('--d')) || ring.offsetWidth);
    const beats = openingBeats(outerFirst.length);
    outerFirst.forEach((ring, i) => {
      const k = outerFirst.length - 1 - i;
      play(ring, [{ scale: String(ringFromScale(diameters, i)) }, { scale: '1' }], beats.rings[k], RING_EASE);
    });
  };

  for (const animation of animations) animation.pause();
  const stop = afterSplash(frame.ownerDocument, () => {
    for (const animation of animations) animation.play();
    drawRings();
  });
  return () => {
    stop();
    for (const animation of animations) animation.cancel();
  };
}
