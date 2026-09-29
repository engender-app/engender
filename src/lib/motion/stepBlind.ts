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

import { blindVariables, VARIABLES } from './fieldBlind';
import { motionDuration } from './tokens';

/** What the hold is stamped on while the old geometry is being painted. */
const HOLD = 'blindHold';

/** What is printed on the field and has to ride with its edge. The shared
    class, not a per-surface one: setup and the gates wear the same field
    (components.css, redesign ticket 34) and this action is the only thing
    that measures where the words sit inside it. */
const ASK = '.step-field-ask';
/** Everything under the edge, which rides it as one sheet. */
const BELOW = '.step-field-below';

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
  let ask = 0;
  let frame = 0;
  let paintedFrame = 0;
  /* When the last change began, for the direction rule below. */
  let lastChange = -Infinity;

  /* Where the question's own box sits inside the field, in layout terms.
     `offsetTop` rather than a client rect, because the ride is a translate
     and a rect would read the ride back in: two changes in quick
     succession would then measure a box that had not finished moving.
     Relative to the field, whose own top never moves. */
  const askTop = () => (node.querySelector<HTMLElement>(ASK)?.offsetTop ?? 0);

  /* Where things are drawn right now, not where they were headed. A second
     change that lands while the first is still travelling has to start from
     what is on screen: the edge's registered property and the two riders'
     `translate` are all mid-transition, and the computed style is the one
     place that says how far. Written back as the "old geometry" of the
     hold, they make the interrupting change a continuation. Written as the
     previous change's target instead, they teleport whatever had not
     arrived yet to where it was going - 7.7px, in one frame, on the
     incoming question when the outgoing one left the grid at 150ms and
     the field's height changed a second time (ticket 285). */
  const shownEdge = () => {
    const value = parseFloat(getComputedStyle(host).getPropertyValue('--blind-edge'));
    return Number.isFinite(value) ? value : edge;
  };
  const shownRide = (selector: string, within: ParentNode) => {
    const el = within.querySelector<HTMLElement>(selector);
    if (!el) return 0;
    const value = getComputedStyle(el).translate;
    if (!value || value === 'none') return 0;
    return parseFloat(value.split(/\s+/)[1] ?? '0') || 0;
  };

  const observer = new ResizeObserver((entries) => {
    const box = entries[0]?.borderBoxSize?.[0];
    const to = Math.round(box ? box.blockSize : node.getBoundingClientRect().height);
    if (to === edge) return;
    const boxFrom = edge;
    const from = edge === 0 ? 0 : shownEdge();
    const askFrom = ask;
    const askRide = from === 0 ? 0 : shownRide(ASK, node);
    const belowRide = from === 0 ? 0 : shownRide(BELOW, host);
    edge = to;
    ask = askTop();

    const vars = blindVariables({ from, to });
    /* Which way the printed words travel is one fact for the length of a
       burst of changes, not one per change. A keyed question is in the grid
       beside its successor for 150ms, so the field grows to the taller of
       the two on the first frame and shrinks to the successor's when the
       outgoing one leaves: two changes in opposite directions for one step
       change. Each republished the sign, and the arriving question reads it
       every frame of its own 150ms fade, so at the second one it flipped
       from -12px of travel to +12 and the question stepped 6 to 9px in one
       frame (ticket 285). The first change's direction is kept until its
       edge has landed. */
    const now = performance.now();
    if (now - lastChange < motionDuration('--dur-slow')) delete vars['--part-travel'];
    lastChange = now;
    for (const [property, value] of Object.entries(vars)) {
      host.style.setProperty(property, value);
    }
    /* What the question rides, which is not what the page under the field
       rides. The page moves by the whole of what the field gained; the
       question moves by the part of it that is above the question - the
       sun's reserve growing - because the rest of the gain is the question
       itself getting taller, and a box does not move because it grew
       downwards. Measured on the flipbook: riding the field's own delta
       sent the question 91px past where it had been, which is a teleport
       in one frame and the one thing this ticket is not allowed to ship.
       Each is added to what the rider is already carrying, so a change
       that interrupts another continues it. */
    host.style.setProperty('--part-delta', `${askRide + (askFrom - ask)}px`);
    host.style.setProperty('--blind-delta', `${belowRide - (to - boxFrom)}px`);

    /* The first measurement is where the field starts, not a move: there is
       no earlier frame for the edge to have travelled from. */
    if (boxFrom === 0) {
      host.style.setProperty('--blind-edge', `${to}px`);
      host.style.setProperty('--part-delta', '0px');
      return;
    }

    /* Painted this frame: the edge where it is, everything that rides it
       back where it is, and no transitions to interrupt. */
    host.style.setProperty('--blind-edge', `${from}px`);
    host.dataset[HOLD] = '';
    cancelAnimationFrame(frame);
    cancelAnimationFrame(paintedFrame);
    frame = requestAnimationFrame(() => {
      /* A callback queued from ResizeObserver can run before the hold has
         painted. Keep it through that frame, then release it for the edge's
         transition. */
      paintedFrame = requestAnimationFrame(() => {
        delete host.dataset[HOLD];
        host.style.setProperty('--blind-edge', `${to}px`);
      });
    });
  });

  observer.observe(node, { box: 'border-box' });

  return {
    destroy() {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(paintedFrame);
      observer.disconnect();
      delete host.dataset[HOLD];
      /* Everything this published, given back. Setup mounts once per
         session, so nothing has been seen to depend on it - but a
         mechanism that leaves five custom properties and an edge on an
         element it no longer watches is one an unrelated screen can
         inherit, and the two properties this file writes itself are not
         in `blindVariables`'s list. */
      for (const property of [...VARIABLES, '--blind-edge', '--part-delta']) {
        host.style.removeProperty(property);
      }
    }
  };
};
