/* TodayEditor and Things that help share drag and FLIP. Each caller
   defines rows and how to persist order. Pointer events on a handle
   support touch and keep the rest of the row scrollable. Measure boxes
   once on grab so dragged rows do not move their own thresholds.

   Measure every row's painted position before writing, then start with
   the offset from its new position and release on the next frame.
   Clear transitions and translates on every row, even a zero offset.
   Leaving a transition enabled previously sent a row 48px the wrong way. */

import { isReducedMotion } from './tokens';

export type RowTop = { key: string; top: number; left: number };

/** Where each row is painted, keyed. Both axes, so a grid that reflows sideways travels as
    well as a list that reflows down (the clinician summary's profile card); a list's rows
    only ever differ in `top`. */
export function measureTops(rows: HTMLElement[], keyOf: (el: HTMLElement) => string): RowTop[] {
  return rows.map((el) => {
    const box = el.getBoundingClientRect();
    return { key: keyOf(el), top: box.top, left: box.left };
  });
}

/** After a write has re-rendered the rows: start each at the top `before`
    painted it at, and let the list's own CSS translate transition carry it
    to its place from the next frame. A row `before` does not name (one
    that just arrived) is left where it lands. */
export function travelFrom(rows: HTMLElement[], keyOf: (el: HTMLElement) => string, before: RowTop[]): void {
  if (isReducedMotion()) return;
  for (const el of rows) {
    el.style.transition = 'none';
    el.style.translate = '';
  }
  const from = new Map(before.map((row) => [row.key, row]));
  for (const el of rows) {
    const was = from.get(keyOf(el));
    if (!was) continue;
    const box = el.getBoundingClientRect();
    el.style.translate = `${was.left - box.left}px ${was.top - box.top}px`;
  }
  requestAnimationFrame(() => {
    for (const el of rows) {
      el.style.transition = '';
      el.style.translate = '';
    }
  });
}

/** The same travel for a list that changes under a read rather than under a drag: a dose
    saved to another day, a procedure that moved to the archive. Measured before the DOM
    updates, released after it, every time `track` changes. Call it while the component
    initialises; the rows need the list's own CSS translate transition.

    Hand-written rather than Svelte's `animate:` directive on purpose: the first `animate:`
    in the app pulls the keyed-each animation runtime into the shared chunk every screen
    loads first, about 400 bytes gzip of a first-load budget that has none to spare. */
export function travelOnChange(rows: () => HTMLElement[], keyOf: (el: HTMLElement) => string, track: () => unknown): void {
  let before: RowTop[] = [];
  $effect.pre(() => {
    track();
    before = measureTops(rows(), keyOf);
  });
  $effect(() => {
    track();
    /* A microtask later, not now: Svelte applies an arriving row's intro styles in a
       microtask of its own, queued while the DOM updated, so measuring here saw that row at
       full height. The rows below it were then started a whole row too high and travelled
       down while the row also opened under them, crossing the day heading for a frame.
       Measured after the intro, an arriving row is at its first-frame height and the rows
       below move only as it opens. Still before the next paint. */
    const measured = before;
    queueMicrotask(() => travelFrom(rows(), keyOf, measured));
  });
}

/** One handle-drag over a list of rows. The list draws each row at
    `offset(key)` while `drag` is set, and asks `release()` on pointer up. */
export class ListDrag {
  /** The row being dragged, how far the pointer has taken it, and the row
      it is over. Null the rest of the time. */
  drag = $state<{ key: string; dy: number; overKey: string } | null>(null);

  #rows: () => HTMLElement[];
  #keyOf: (el: HTMLElement) => string;
  #boxes: { key: string; top: number; height: number }[] = [];
  #grabbedAt = 0;

  constructor(rows: () => HTMLElement[], keyOf: (el: HTMLElement) => string) {
    this.#rows = rows;
    this.#keyOf = keyOf;
  }

  grab = (event: PointerEvent, key: string) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.#boxes = this.#rows().map((el) => {
      const box = el.getBoundingClientRect();
      return { key: this.#keyOf(el), top: box.top, height: box.height };
    });
    this.#grabbedAt = event.clientY;
    this.drag = { key, dy: 0, overKey: key };
  };

  travel = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag) return;
    const from = this.#boxes.find((box) => box.key === drag.key);
    if (!from) return;
    const dy = event.clientY - this.#grabbedAt;
    /* The row under the dragged row's middle; off either end, the first or
       the last, so an overshoot still lands rather than stalling. */
    const middle = from.top + from.height / 2 + dy;
    const boxes = this.#boxes;
    const over =
      boxes.find((box) => middle >= box.top && middle <= box.top + box.height) ??
      (middle < boxes[0].top ? boxes[0] : boxes[boxes.length - 1]);
    this.drag = { key: drag.key, dy, overKey: over.key };
  };

  /** Ends the gesture. The move it asks for, or null when the row was put
      back where it was picked up (it then travels home on the list's own
      translate transition). Read the painted tops before calling this if
      the move is going to be written: clearing the drag takes the rows'
      translates with it. */
  release = (): { key: string; overKey: string } | null => {
    const drag = this.drag;
    this.drag = null;
    return drag && drag.overKey !== drag.key ? { key: drag.key, overKey: drag.overKey } : null;
  };

  /** Where a row is drawn while a drag is on: the dragged one under the
      pointer, the ones it has passed stood aside by its height. */
  offset = (key: string): number => {
    const drag = this.drag;
    if (!drag) return 0;
    if (key === drag.key) return drag.dy;
    const from = this.#boxes.findIndex((box) => box.key === drag.key);
    const to = this.#boxes.findIndex((box) => box.key === drag.overKey);
    const at = this.#boxes.findIndex((box) => box.key === key);
    if (from === -1 || to === -1 || at === -1) return 0;
    const height = this.#boxes[from].height;
    if (at > from && at <= to) return -height;
    if (at < from && at >= to) return height;
    return 0;
  };
}
