/* Chromium sends taps to the root during the appearance transition. Keep
   the last pointer tap and replay it once at its release point after the
   transition. Drop it after navigation, outside the viewport, or if it moved
   past TAP_SLOP. Keyboard events are unaffected. */

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
