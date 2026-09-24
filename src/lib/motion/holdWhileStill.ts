/* Pauses a face's glance and blink while they hold still, and lets them run
   across the stretches where they move (ux-carpet 228; stillHolds.ts has why
   and the arithmetic).

   The animations stay the stylesheet's own CSS animations - face-glance and
   face-blink, on their own periods and delays from moodGlance.ts - so what
   they show is decided in one place, exactly as before. This only switches
   each one between paused and running through its Web Animations handle:

   - Paused anywhere inside a hold, an animation shows the value the running
     one would, because a hold is a stretch of identical keyframes.
   - Resumed by putting its start time back, it carries on in phase, as if it
     had never stopped. A running CSS animation's start time never moves, so
     that is the clock the face always keeps.
   - The row's gaze (`is-held` on the face) used to pause the glance through
     `animation-play-state`. Once a script has paused or played an animation,
     Chromium stops reading that property for it, so the pause is done here,
     with the same meaning: the glance stops where it is and resumes from
     there when the row lets go, which moves its phase on by the held time.
     The blink was never paused by the gaze and still is not.
   - Reduced motion removes the animations in the stylesheet, which cancels
     them; a cancelled animation is never touched again, and new ones are
     picked up when motion comes back.

   Attached to the rows that draw alive faces (MoodChips, MoodPicker, QuickAdd)
   rather than to MoodFace itself, because MoodFace.svelte is pinned byte for
   byte to ticket 27's drawing (tests/mood-faces.test.ts): this is motion
   built around the face, and redesign ticket 19 set the precedent that such
   work leaves the drawing's file alone. The row finds its alive faces, and
   any that appear later, and runs one of these per face. */

import type { Attachment } from 'svelte/attachments';
import { isMoving, movingWindows, untilNextWindow, untilWindowEnds, type MovingWindow } from './stillHolds';

const NAMES = new Set(['face-glance', 'face-blink']);

/* Resume this long before a window and pause this long after it: the value is
   flat there, so the cost is a frame, and it absorbs a timer that fires late. */
const MARGIN_MS = 40;

type Tracked = {
  animation: CSSAnimation;
  windows: MovingWindow[];
  /** The timeline time the animation's iteration clock counts from. */
  origin: number;
  /** Set while the row's gaze holds the glance: its current time then. */
  heldAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
};

const KEYFRAME_META = new Set(['offset', 'computedOffset', 'easing', 'composite']);

function windowsOf(animation: CSSAnimation): MovingWindow[] {
  const keyframes = (animation.effect as KeyframeEffect).getKeyframes();
  return movingWindows(
    keyframes.map((keyframe) => ({
      offset: (keyframe.computedOffset ?? keyframe.offset ?? 0) as number,
      value: JSON.stringify(Object.entries(keyframe).filter(([key]) => !KEYFRAME_META.has(key)))
    }))
  );
}

/* The document timeline's clock, read now rather than at the last frame:
   `document.timeline.currentTime` is the last frame's time, stale by up to
   a frame inside a timer, while performance.now() counts from the same
   origin and is current. */
const now = () => performance.now();

/** Runs the pause-while-still controller for one alive face; returns its
    teardown. */
function holdFaceWhileStill(face: SVGSVGElement): () => void {
  const tracked = new Map<CSSAnimation, Tracked>();
  let stopped = false;

  const live = (animation: CSSAnimation) =>
    animation.playState !== 'idle' && face.getAnimations({ subtree: true }).includes(animation);

  const timing = (animation: CSSAnimation) => {
    const computed = animation.effect!.getComputedTiming();
    return { duration: Number(computed.duration), delay: Number(animation.effect!.getTiming().delay ?? 0) };
  };

  const isGlanceHeld = (entry: Tracked) =>
    entry.animation.animationName === 'face-glance' && face.classList.contains('is-held');

  function step(entry: Tracked) {
    entry.timer = null;
    if (stopped) return;
    const { animation } = entry;
    if (!live(animation)) {
      tracked.delete(animation);
      return;
    }
    if (isGlanceHeld(entry)) {
      if (entry.heldAt === null) {
        /* Where the running glance is now, not where this controller last
           paused it: a glance already paused inside a hold has a current time
           frozen at the start of that hold, and resuming from there would
           move its phase on by the whole hold as well as by the gaze. */
        entry.heldAt = now() - entry.origin;
        animation.pause();
        animation.currentTime = entry.heldAt;
      }
      return; // released by the class observer
    }
    const { duration, delay } = timing(animation);
    if (!(duration > 0)) return;
    const elapsed = now() - entry.origin;
    if (isMoving(elapsed, duration, delay, entry.windows, MARGIN_MS)) {
      if (animation.playState === 'paused') animation.startTime = entry.origin;
      entry.timer = setTimeout(() => step(entry), untilWindowEnds(elapsed, duration, delay, entry.windows, MARGIN_MS) + 1);
    } else {
      if (animation.playState !== 'paused') {
        animation.pause();
        /* Paused at the exact time it would show now, inside the hold. */
        animation.currentTime = elapsed;
      }
      entry.timer = setTimeout(() => step(entry), untilNextWindow(elapsed, duration, delay, entry.windows, MARGIN_MS));
    }
  }

  async function track(animation: CSSAnimation) {
    if (tracked.has(animation)) return;
    await animation.ready.catch(() => undefined);
    if (stopped || tracked.has(animation) || !live(animation) || animation.startTime === null) return;
    const entry: Tracked = {
      animation,
      windows: windowsOf(animation),
      origin: animation.startTime as number,
      heldAt: null,
      timer: null
    };
    tracked.set(animation, entry);
    step(entry);
  }

  const scan = () => {
    for (const animation of face.getAnimations({ subtree: true })) {
      if (animation instanceof CSSAnimation && NAMES.has(animation.animationName)) void track(animation);
    }
  };

  /* The gaze: `is-held` comes and goes with the row. */
  const onClass = () => {
    for (const entry of tracked.values()) {
      if (entry.animation.animationName !== 'face-glance') continue;
      if (face.classList.contains('is-held')) {
        if (entry.timer) clearTimeout(entry.timer);
        step(entry);
      } else if (entry.heldAt !== null) {
        entry.origin = now() - entry.heldAt;
        entry.heldAt = null;
        entry.animation.startTime = entry.origin;
        if (entry.timer) clearTimeout(entry.timer);
        step(entry);
      }
    }
    scan();
  };
  const classes = new MutationObserver(onClass);
  classes.observe(face, { attributes: true, attributeFilter: ['class'] });

  /* Motion preference changes add or remove the animations themselves. */
  const motion = new MutationObserver(() => requestAnimationFrame(scan));
  motion.observe(document.documentElement, { attributes: true, attributeFilter: ['data-a11y-motion'] });
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const onMedia = () => requestAnimationFrame(scan);
  media.addEventListener('change', onMedia);

  /* The CSS animations exist once the face's style has been computed. */
  requestAnimationFrame(scan);

  return () => {
    stopped = true;
    classes.disconnect();
    motion.disconnect();
    media.removeEventListener('change', onMedia);
    for (const entry of tracked.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    tracked.clear();
  };
}

const FACE = 'svg.mood-face.is-alive';

/** Every alive face inside the row this is attached to, including faces that
    appear in it later. */
export const holdFacesWhileStill: Attachment<HTMLElement> = (row) => {
  const faces = new Map<SVGSVGElement, () => void>();
  const sync = () => {
    const present = new Set(row.querySelectorAll<SVGSVGElement>(FACE));
    for (const face of present) if (!faces.has(face)) faces.set(face, holdFaceWhileStill(face));
    for (const [face, stop] of faces) {
      if (!present.has(face)) {
        stop();
        faces.delete(face);
      }
    }
  };
  sync();
  const children = new MutationObserver(sync);
  children.observe(row, { childList: true, subtree: true });
  return () => {
    children.disconnect();
    for (const stop of faces.values()) stop();
    faces.clear();
  };
};
