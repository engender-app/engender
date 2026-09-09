/* The field's edge on a step machine (redesign ticket 33).

   Ticket 28 made the field a blind over the content and moved its bottom
   edge on every navigation: the paint is split from the box that measures
   it, so the edge is a clip rather than a box being resized, and everything
   printed on the field rides down with it. That mechanism is a view
   transition, because a navigation has two screens in the DOM at once and
   the only thing that can animate between them is a photograph of each.

   Setup has one screen and ten states of it. Nothing is being replaced, so
   there is nothing to photograph: the question, the line and the answers
   are real elements the whole way through, and what has to move is the
   field's own height. So the edge is driven from the field itself here.

   **Every change of the field's height moves, not every step change.** That
   is the whole reason this is a ResizeObserver and not a call at the bottom
   of `go()`. The height changes on a step change, and it also changes when
   the access-mode step walks from its list to its pad, when a question
   re-wraps because the text size grew, and when a raised keyboard drops the
   flow into its short form. A mechanism wired to the step counter would let
   the other three jump the edge in a single frame, which is the one defect
   this ticket is not allowed to ship ("no yanks anywhere", Alicja,
   2026-09-09: a yank is a thing teleporting or disappearing in one frame).

   How the frame is kept honest. A ResizeObserver's callback runs after
   layout and before the frame is painted, so what it writes lands in the
   same frame the height changed in. What it writes is the *old* geometry -
   the riders translated back by what the edge gained, the clip still at the
   height it had - with transitions off, which is a frame identical to the
   one before it. The rAF after it takes the hold off, and the transitions
   run from there. Nothing is ever painted at its destination before it has
   travelled to it.

   The numbers come from $lib/motion/fieldBlind's `blindVariables`, which is
   the same arithmetic a navigation publishes on the root, so a step change
   and a door change cannot disagree about how far an edge settles past its
   mark or which way a thing painted on it travels. */

import type { Action } from 'svelte/action';

import { blindVariables } from './fieldBlind';

/** What the hold is stamped on while the old geometry is being painted. */
const HOLD = 'blindHold';

/**
 * Moves one field's bottom edge whenever the field's height changes, and
 * hands the stylesheet what everything riding that edge needs.
 *
 * Put it on the box that measures the field. The properties are published
 * on that box's parent, so the paint inside the field, the question printed
 * on it and the content under it all read one set of numbers.
 */
export const blindEdge: Action<HTMLElement> = (node) => {
  const host = node.parentElement ?? node;
  let edge = 0;
  let frame = 0;

  const publish = (from: number, to: number) => {
    for (const [property, value] of Object.entries(blindVariables({ from, to }))) {
      host.style.setProperty(property, value);
    }
  };

  const observer = new ResizeObserver((entries) => {
    const box = entries[0]?.borderBoxSize?.[0];
    const to = Math.round(box ? box.blockSize : node.getBoundingClientRect().height);
    if (to === edge) return;
    const from = edge;
    edge = to;

    /* The first measurement is where the field starts, not a move: there is
       no earlier frame for the edge to have travelled from. */
    if (from === 0) {
      publish(to, to);
      host.style.setProperty('--blind-edge', `${to}px`);
      return;
    }

    publish(from, to);
    /* Painted this frame: the edge where it was, everything that rides it
       back where it was, and no transitions to interrupt. */
    host.style.setProperty('--blind-edge', `${from}px`);
    host.dataset[HOLD] = '';
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      delete host.dataset[HOLD];
      host.style.setProperty('--blind-edge', `${to}px`);
    });
  });

  observer.observe(node);

  return {
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      delete host.dataset[HOLD];
    }
  };
};
