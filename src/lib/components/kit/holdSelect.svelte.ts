/* Attach `cell` to a tile in either photo grid. Hold, right-click
   or press the context menu key to select. The accessible Select
   button starts the same mode with no picks. Tap toggles a tile
   until Cancel, Back or dropping the last selection leaves the mode.

   A moving press remains a scroll. This module never cancels touchmove.
   HoldSelectBar handles deletion. */
import { tick } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { scale, type TransitionConfig } from 'svelte/transition';
import { crossfadeDuration, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
import { startHold, type HoldPress } from './holdSelect';

export interface HoldSelection {
  readonly ids: string[];
  readonly active: boolean;
  has(id: string): boolean;
  toggle(id: string): void;
  /** Picking with nothing picked: the Select button's way in. Select
      fades out and goes inert as picking starts, so focus moves on to the
      first tile in `grid` rather than being dropped. */
  start(grid?: HTMLElement): void;
  clear(): void;
  /** On a tile: the hold that starts picking, and while picking, the tap
      that picks. `selectable` false leaves the tile out of both. */
  cell(id: string, selectable?: boolean): Attachment<HTMLElement>;
}

/* The click that ends a hold is the hold's, whatever is under the finger
   by then. Picking raises the foot, and on a tile low on the screen the
   foot rises under the held finger, so a click left to land would press
   Delete or Cancel. Swallowed window-wide, once, and forgotten at the next
   press in case the lift fired no click at all. */
function swallowNextClick(): void {
  const window_ = globalThis.window;
  if (!window_) return;
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    forget();
  };
  const forget = () => {
    window_.removeEventListener('click', swallow, true);
    window_.removeEventListener('pointerdown', forget, true);
  };
  window_.addEventListener('click', swallow, true);
  window_.addEventListener('pointerdown', forget, true);
}

export function holdSelection(): HoldSelection {
  let ids = $state<string[]>([]);
  /* Entered by Select rather than by a hold. */
  let picking = $state(false);
  const active = () => picking || ids.length > 0;

  const toggle = (id: string) => {
    ids = ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
  };

  function cell(id: string, selectable = true): Attachment<HTMLElement> {
    return (node) => {
      let press: HoldPress | null = null;

      const down = (event: PointerEvent) => {
        if (!selectable || active() || !event.isPrimary || event.button !== 0) return;
        press?.end();
        press = startHold(event.clientX, event.clientY, () => {
          swallowNextClick();
          ids = [id];
        });
      };
      const move = (event: PointerEvent) => {
        if (press && !press.move(event.clientX, event.clientY)) press = null;
      };
      const up = () => {
        press?.end();
        press = null;
      };
      /* While picking, a tap is a pick and never reaches the tile's own
         handler (which opens the photograph). */
      const click = (event: MouseEvent) => {
        if (!active()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (selectable) toggle(id);
      };
      /* A held finger raises the system's own menu on Android; the hold is
         this. A mouse's right click and the context-menu key arrive here
         with no hold before them, and start picking the same way. */
      const menu = (event: MouseEvent) => {
        if (!selectable) return;
        event.preventDefault();
        if (press?.held) return;
        press?.end();
        press = null;
        if (active()) return;
        swallowNextClick();
        ids = [id];
      };

      node.addEventListener('pointerdown', down);
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
      node.addEventListener('pointerleave', up);
      node.addEventListener('click', click, true);
      node.addEventListener('contextmenu', menu);
      return () => {
        press?.end();
        node.removeEventListener('pointerdown', down);
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
        node.removeEventListener('pointerleave', up);
        node.removeEventListener('click', click, true);
        node.removeEventListener('contextmenu', menu);
      };
    };
  }

  return {
    get ids() {
      return ids;
    },
    get active() {
      return picking || ids.length > 0;
    },
    has: (id) => ids.includes(id),
    toggle,
    start(grid) {
      picking = true;
      void tick().then(() => grid?.querySelector<HTMLElement>('[data-photo-cell]')?.focus({ preventScroll: true }));
    },
    clear: () => {
      ids = [];
      picking = false;
    },
    cell
  };
}

/** A picked tile's check: it grows in from 60% as it fades, and under
    reduced motion only fades, so the pick still reads as a change rather
    than a cut. Both grids use it, for the hold and for compare's picks. */
export function checkIn(node: Element): TransitionConfig {
  if (isReducedMotion()) return fadeOnly(crossfadeDuration());
  return scale(node, { start: 0.6, duration: motionDuration('--dur-fast') });
}
