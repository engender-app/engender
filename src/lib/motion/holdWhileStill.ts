/* Pause CSS glance and blink animations inside identical-keyframe holds.
   Save the start time and restore it to resume in phase. stillHolds.ts
   supplies hold timing. Once Web Animations controls playback, Chromium
   stops applying CSS animation-play-state, so this module handles gaze too.

   Gaze pauses only the glance. Home inactivity pauses both clocks. Resume
   moves the clock origins by the held duration. Reduced motion cancels the
   CSS animations, and new handles are picked up when motion returns.
   Rows attach one controller per live face, including faces added later. */

import type { Attachment } from 'svelte/attachments';
import { isDoorActive } from '../navigation/doorActivity';
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
  /** The time frozen by the row's gaze or Home's idle policy. */
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
function holdFaceWhileStill(face: SVGSVGElement, home: HTMLElement | null): () => void {
  const tracked = new Map<CSSAnimation, Tracked>();
  let stopped = false;
  let frame: number | null = null;

  const live = (animation: CSSAnimation) =>
    animation.playState !== 'idle' && face.getAnimations({ subtree: true }).includes(animation);

  const timing = (animation: CSSAnimation) => {
    const computed = animation.effect!.getComputedTiming();
    return { duration: Number(computed.duration), delay: Number(animation.effect!.getTiming().delay ?? 0) };
  };

  const isHeld = (entry: Tracked) =>
    home?.dataset.homeAmbient === 'paused' ||
    entry.animation.animationName === 'face-glance' && face.classList.contains('is-held');

  function step(entry: Tracked) {
    entry.timer = null;
    if (stopped) return;
    const { animation } = entry;
    if (!live(animation)) {
      tracked.delete(animation);
      return;
    }
    if (isHeld(entry)) {
      if (entry.heldAt === null) {
        /* Where the running glance is now, not where this controller last
           paused it: a glance already paused inside a hold has a current time
           frozen at the start of that hold, and resuming from there would
           move its phase on by the whole hold as well as by the gaze. */
        entry.heldAt = animation.playState === 'running' && typeof animation.currentTime === 'number'
          ? animation.currentTime
          : now() - entry.origin;
        animation.pause();
        animation.currentTime = entry.heldAt;
      }
      return; // released by the gaze or Home observer
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
    if (stopped || tracked.has(animation)) return;
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
    if (stopped) return;
    for (const animation of face.getAnimations({ subtree: true })) {
      if (animation instanceof CSSAnimation && NAMES.has(animation.animationName)) void track(animation);
    }
  };
  const scheduleScan = () => {
    if (stopped || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      scan();
    });
  };

  /* Gaze holds only the glance. Home's idle policy holds both clocks. */
  const onHold = () => {
    for (const entry of tracked.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      if (!isHeld(entry) && entry.heldAt !== null) {
        entry.origin = now() - entry.heldAt;
        entry.heldAt = null;
        entry.animation.startTime = entry.origin;
      }
      step(entry);
    }
    scan();
  };
  const classes = new MutationObserver(onHold);
  classes.observe(face, { attributes: true, attributeFilter: ['class'] });
  const ambient = home ? new MutationObserver(onHold) : null;
  if (home) ambient?.observe(home, { attributes: true, attributeFilter: ['data-home-ambient'] });

  /* Motion preference changes add or remove the animations themselves. */
  const motion = new MutationObserver(scheduleScan);
  motion.observe(document.documentElement, { attributes: true, attributeFilter: ['data-a11y-motion'] });
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const onMedia = scheduleScan;
  media.addEventListener('change', onMedia);

  /* The CSS animations exist once the face's style has been computed. */
  scheduleScan();

  return () => {
    stopped = true;
    if (frame !== null) cancelAnimationFrame(frame);
    classes.disconnect();
    ambient?.disconnect();
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
  const home = row.closest<HTMLElement>('[data-home-ambient]');
  const sync = () => {
    const present = new Set(isDoorActive(row) ? row.querySelectorAll<SVGSVGElement>(FACE) : []);
    for (const face of present) if (!faces.has(face)) faces.set(face, holdFaceWhileStill(face, home));
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
  const door = row.closest('[data-retained-door]');
  const activity = door ? new MutationObserver(sync) : null;
  if (door) activity?.observe(door, { attributes: true, attributeFilter: ['data-retained-active'] });
  return () => {
    children.disconnect();
    activity?.disconnect();
    for (const stop of faces.values()) stop();
    faces.clear();
  };
};
