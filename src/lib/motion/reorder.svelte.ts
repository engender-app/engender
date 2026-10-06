/* Reordering a list by hand: the drag a row's handle runs, and the FLIP
   that carries every row to its new place once an order is written.

   Two lists use it, the Today editor (TodayEditor.svelte) and Things that
   help (doubt/comfort), and they had grown two copies of the same ~150
   lines (phase 14 ticket 18's review). What differs between them stays
   with them: where an order is written (a preference, a journal write)
   and which rows the list holds. What is the same is here:

   - **The drag.** Pointer events on a handle rather than HTML5
     drag-and-drop, which has no touch story, and rather than the whole row,
     which would make a list a thumb cannot scroll. The gesture is measured
     against the rows' own boxes, taken once at the grab: the rows move
     under the pointer as it travels, and measuring again mid-gesture would
     compare the pointer against boxes the gesture had already displaced.
   - **The travel.** Measure where every row is painted, write, then start
     each row at the difference and release it on the next frame. Every row,
     a zero difference included, with its transition off and its translate
     cleared before it is measured: a row that stood aside during a drag
     loses its translate in the same update the order is written, and with
     its transition left on it was measured mid-flight and then played that
     loss as a 48px trip the wrong way (sampled on the comfort list).

   Node-tier safe apart from the rune: no clock, no driver, no paraglide. */

import { isReducedMotion } from './tokens';

export type RowTop = { key: string; top: number; left: number };

/** Where each row is painted, keyed. Both axes, so a grid that reflows
    sideways travels as well as a list that reflows down (the clinician
    summary's profile card, after-release 22); a list's rows only ever
    differ in `top`. */
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

/** The same travel for a list that changes under a read rather than under
    a drag: a dose saved to another day, a procedure that moved to the
    archive (after-release 05). Measured before the DOM updates, released
    after it, every time `track` changes. Call it while the component
    initialises; the rows need the list's own CSS translate transition.

    Hand-written rather than Svelte's `animate:` directive on purpose: the
    first `animate:` in the app pulls the keyed-each animation runtime into
    the shared chunk every screen loads first, about 400 bytes gzip of a
    first-load budget that has none to spare. */
export function travelOnChange(rows: () => HTMLElement[], keyOf: (el: HTMLElement) => string, track: () => unknown): void {
  let before: RowTop[] = [];
  $effect.pre(() => {
    track();
    before = measureTops(rows(), keyOf);
  });
  $effect(() => {
    track();
    travelFrom(rows(), keyOf, before);
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
