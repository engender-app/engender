/* A tap made while the appearance bloom runs, replayed when it ends (prh12;
   Alicja chose "replay the tap after").

   While a view transition runs, Chromium hit-tests every point to the root,
   so a tap during the bloom reaches nothing: a Continue pressed straight
   after a flag on setup's flag step, or a row tapped straight after Dark in
   Settings, was simply lost. `pointer-events: none` on the overlay does not
   change that (tried and measured). So the tap is remembered instead - the
   last one, where the finger lifted - and when the bloom finishes it is
   delivered to whatever is under that point then, once, the way the tap
   would have landed.

   Pointer events only, so a keyboard is untouched. A finger that moved
   further than TAP_SLOP is a drag or a scroll and replays nothing. A tap is
   dropped if the page navigated in the meantime or the point is no longer
   inside the window. */

/** How far a finger may travel between down and up and still be a tap. */
/** How far a finger may travel and still count as a tap rather than a drag
    or a scroll. The hold-to-select press uses the same distance. */
export const TAP_SLOP = 10;

/** What a replayed tap activates directly, with the focus a tap gives it. */
const CONTROL = 'button, a[href], input, select, textarea, summary, label, [role="button"], [role="radio"], [role="switch"], [role="tab"], [role="checkbox"], [role="menuitem"], [role="option"]';

interface Point { x: number; y: number }
interface PointerLike { clientX: number; clientY: number; pointerId?: number; isPrimary?: boolean }

export interface TapHold {
  /** The bloom has ended: replay the tap, now or when its finger lifts. */
  finish(): void;
}

type MakeClick = (init: MouseEventInit) => MouseEvent;

const realClick: MakeClick = (init) => new MouseEvent('click', init);

export function holdTaps(doc: Document, makeClick: MakeClick = realClick): TapHold {
  const href = () => doc.defaultView?.location.href;
  const startedAt = href();
  let down: (Point & { id?: number }) | null = null;
  let tap: Point | null = null;
  let finished = false;

  const onDown = (e: Event) => {
    const p = e as unknown as PointerLike;
    if (p.isPrimary === false) return;
    down = { x: p.clientX, y: p.clientY, id: p.pointerId };
  };
  const onMove = (e: Event) => {
    const p = e as unknown as PointerLike;
    if (!down || p.pointerId !== down.id) return;
    if (Math.hypot(p.clientX - down.x, p.clientY - down.y) > TAP_SLOP) down = null;
  };
  const onUp = (e: Event) => {
    const p = e as unknown as PointerLike;
    if (!down || p.pointerId !== down.id) return;
    const moved = Math.hypot(p.clientX - down.x, p.clientY - down.y) > TAP_SLOP;
    down = null;
    if (!moved) tap = { x: p.clientX, y: p.clientY };
    if (finished) settle();
  };
  const onCancel = () => {
    down = null;
    if (finished) settle();
  };
  const listeners: [string, (e: Event) => void][] = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onCancel]
  ];
  for (const [type, fn] of listeners) doc.addEventListener(type, fn, true);

  function settle() {
    for (const [type, fn] of listeners) doc.removeEventListener(type, fn, true);
    const point = tap;
    tap = null;
    if (point) replay(point);
  }

  function replay({ x, y }: Point) {
    if (href() !== startedAt) return;
    const { clientWidth, clientHeight } = doc.documentElement;
    if (x < 0 || y < 0 || x >= clientWidth || y >= clientHeight) return;
    const under = doc.elementFromPoint(x, y);
    if (!under) return;
    const control = under.closest<HTMLElement>(CONTROL);
    if (control) {
      control.focus({ preventScroll: true });
      control.click();
      return;
    }
    under.dispatchEvent(makeClick({ bubbles: true, cancelable: true, clientX: x, clientY: y, view: doc.defaultView }));
  }

  return {
    finish() {
      if (finished) return;
      finished = true;
      /* A finger still down waits for its lift; anything else settles now. */
      if (!down) settle();
    }
  };
}
