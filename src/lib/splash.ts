/* The handover from the first frame to the app (phase 14 pre-release
   ticket 13, after-release ticket 31). app.html paints a ground and the
   mark before any script has run; this is what takes them away.

   How the first frame leaves is app.html's CSS: a crossfade, the first
   frame fading out while the app's root fades in on the same curve. The
   mark does not move on the way out, and the ground is the app's own --bg
   on the body, which neither side fades, so no frame of the handover has
   either of them somewhere new.

   When it leaves is `splashMayLeave`: once boot has answered, and once the
   screen it answered with is the one the layout is drawing. Ticket 13 had
   it start leaving when the layout mounted, so that a screen's own
   entrances would not finish unseen underneath. But the layout mounts while
   boot is still working, and on a first visit boot then answers "set up":
   the layout drops the screen it had started and draws nothing while it
   navigates to onboarding. Measured at 4x CPU in after-release 31, the
   first frame had faded onto an empty ground by +420 ms and onboarding
   arrived whole, in one frame, at +687 ms. Waiting for the answer means
   the first frame dissolves into a screen that is there.

   `answerSplash` ends the handover and takes the element out when it has
   run, on a timer rather than on `transitionend`, which never fires for a
   tab that is hidden or a person who asked the system to remove
   animations. */

/** Longer than the slowest handover in app.html. */
const REMOVE_AFTER_MS = 800;

/* Ticket 08 experiment, removed once a variant is chosen. The screen under
   the first frame stays unpainted until the crossfade begins, so on the
   Pixel 10a the WebView compiled every GPU pipeline the screen needs inside
   the fade: 48 Vulkan pipeline creations and stalls of 192 and 175 ms in a
   280 ms fade. With html[data-splash-warm] set (app.html stamps it from a
   storage key), the screen paints beneath the still mark at a nil opacity
   and the fade waits for frames to come back quick. Variant "a" waits for
   that alone; "b" also waits for the screen's held reads to answer and for
   the arrivals they start to finish, since a body fading in from 0 first
   reaches the GPU when its fade starts. The cap covers a device that never
   settles and a hidden tab with no frames. */
const WARM_QUICK_FRAME_MS = 25;
const WARM_QUICK_FRAMES = 3;
const WARM_CAP_MS: Record<string, number> = { a: 1000, b: 2500 };
const HELD_READS = '[data-app-root] [data-read-reserve-hold], [data-app-root] [data-gate-skeleton]';

/** Whether the first frame may hand over: boot has answered, and the
    layout is not between screens on the way to onboarding. */
export function splashMayLeave(bootStatus: string, redirecting: boolean): boolean {
  return bootStatus !== 'booting' && !redirecting;
}

export function answerSplash(doc: Document = document): void {
  const splash = doc.getElementById('splash');
  /* No first frame to cross with: the screen must not stay held at 0. */
  if (!splash) {
    delete doc.documentElement.dataset.splash;
    return;
  }
  if (splash.classList.contains('is-answered')) return;
  splash.classList.add('is-answered');
  const warm = doc.documentElement.dataset.splashWarm;
  if (warm && doc.defaultView) whenWarm(doc, doc.defaultView, warm, () => leave(doc, splash));
  else leave(doc, splash);
}

function leave(doc: Document, splash: HTMLElement): void {
  splash.classList.add('is-leaving');
  doc.documentElement.dataset.splash = 'leaving';
  setTimeout(() => {
    splash.remove();
    delete doc.documentElement.dataset.splash;
  }, REMOVE_AFTER_MS);
}

function whenWarm(doc: Document, view: Window, variant: string, go: () => void): void {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    go();
  };
  setTimeout(finish, WARM_CAP_MS[variant] ?? WARM_CAP_MS.a);
  let last: number | undefined;
  let quick = 0;
  /* A frame callback runs before that frame paints, so the frame after the
     reads answered is the first that can show their cost. */
  let wasHeld = false;
  const frame = (now: number) => {
    if (done) return;
    const held = variant === 'b' && stillArriving(doc);
    quick = !held && !wasHeld && last !== undefined && now - last < WARM_QUICK_FRAME_MS ? quick + 1 : 0;
    wasHeld = held;
    last = now;
    if (quick >= WARM_QUICK_FRAMES) finish();
    else view.requestAnimationFrame(frame);
  };
  view.requestAnimationFrame(frame);
}

/** A held read, or a finite animation still running on the screen; loops
    such as a skeleton's sweep never end, so they do not count. */
function stillArriving(doc: Document): boolean {
  if (doc.querySelector(HELD_READS)) return true;
  const root = doc.querySelector('[data-app-root]');
  return !!root
    ?.getAnimations({ subtree: true })
    .some((animation) => animation.playState === 'running' && animation.effect?.getComputedTiming().endTime !== Infinity);
}
