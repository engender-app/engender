/* Tier 2 inside one screen: a new entry walking between its steps (tester
   report 02, tickets 03 and 04).

   A step change here is not a navigation. The editor is one screen holding
   one draft, and the header's field, the date line under it and the foot all
   stay where they are; what changes is the step's own heading on the field
   and the answers under it. Both sides of the change are real elements in
   one grid cell for the length of it (EntryEditor's `.entry-stage`), so
   nothing under them moves while they swap.

   The swap is Material's shared axis on X, which the app already runs from a
   list into its detail (Alicja chose it over a field-edge crossfade and a
   page turn on ticket 03's sign-off page, 2026-11-11). The leaving step
   slides the way the person is going and fades on --dur-fast; the arriving
   one comes from the other side on --dur-med. A sequence reads as a
   sequence, and the step a person came from is always on the side Back
   points to. `back` reverses the direction for a step back. Under reduced
   motion it is the tier-2 crossfade.

   The foot is the one thing every step shares: the finish control stays
   where it is, and only the way on (`footContinue`) opens and closes beside
   it, on the first step that has one and the last that has none. */

import type { TransitionConfig } from 'svelte/transition';

import { sharedAxisX } from './navigation';
import { crossfadeDuration, EASE_OUT, fadeOnly, isReducedMotion, motionDuration, NIL_OPACITY } from './tokens';

type Direction = 'in' | 'out' | 'both';

export type StepTravelParams = {
  /** A step back: the axis runs the other way. */
  back?: boolean;
  /** The change was already drawn, by a back gesture scrubbing it
      (`stepScrub` below), so the swap itself has nothing left to move. */
  instant?: boolean;
};

const NOTHING_LEFT: TransitionConfig = { duration: 0 };

/** One side of a step change. Use as `in:stepTravel={...}` and
    `out:stepTravel={...}`; a bare `transition:` cannot tell them apart. */
export function stepTravel(
  node: Element,
  params: StepTravelParams = {},
  options: { direction?: Direction } = {}
): TransitionConfig {
  if (params.instant) return NOTHING_LEFT;
  if (isReducedMotion()) return fadeOnly(crossfadeDuration());
  return sharedAxisX(node, { back: !!params.back }, options);
}

/** The way on under the finish control, opening on the first step and
    closing on the second. Opens along the foot's own direction: its height
    where the foot is a column, its width where the two controls stand side
    by side (a wide window), so the finish control above or beside it is
    never moved by more than the room the way on gives up, and never in one
    frame. The wrapper carries the gap, as padding on its leading edge, so
    the gap travels with it instead of staying behind for a frame. */
export function footContinue(node: Element, params: { instant?: boolean } = {}): TransitionConfig {
  if (params.instant) return NOTHING_LEFT;
  if (isReducedMotion()) return fadeOnly(crossfadeDuration());
  const box = node.getBoundingClientRect();
  const parent = node.parentElement;
  const row = !!parent && getComputedStyle(parent).flexDirection === 'row';
  const size = row ? box.width : box.height;
  const gap = row && parent ? parseFloat(getComputedStyle(parent).columnGap) || 0 : 0;
  /* The gap is on the side the finish control is on: after the way on where
     it leads the row, before it where it follows (a new entry's steps since
     bug session 18, item 84). Read off the sibling before it, because the
     foot's live region comes after the way on and is no control. */
  const side = node.previousElementSibling ? 'start' : 'end';
  return {
    duration: motionDuration('--dur-med'),
    easing: EASE_OUT,
    css: (t, u) =>
      row
        ? `overflow: hidden; flex: none; opacity: ${t}; width: ${t * size}px; margin-inline-${side}: ${-u * gap}px;`
        : `overflow: hidden; opacity: ${t}; height: ${t * size}px;`
  };
}

/* A step back scrubbed by Android's back gesture (ticket 04, box 5).

   From the second step, a back swipe draws the step change under the
   finger: the second step moves off and the first comes up beneath it, the
   same movement a tap on Back plays, with the gesture's progress standing
   in for time. Every part of the change is a part here - the step, the
   heading on the field, the way on under the finish control, the scroll
   back to the top - and each carries the very TransitionConfig the timed
   change runs on it, so the two cannot drift apart.

   Releasing settles forward from where the finger left it and cancelling
   settles back, each part from its own current t over its own duration
   scaled by the distance left, on its own curve. So a leaving part still
   finishes before an arriving one, as in the timed change, and nothing
   restarts from an end. Progress arrives from the bridge as fast as the
   system sends it; it is drawn once per animation frame, the latest value
   only. */

export type ScrubClock = {
  frame(run: () => void): number;
  cancel(handle: number): void;
  now(): number;
};

const browserClock: ScrubClock = {
  frame: (run) => requestAnimationFrame(run),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now()
};

export type ScrubPart = {
  /** Arriving parts run t from 0 to 1 as the gesture goes on, leaving
      parts from 1 to 0, the way Svelte runs an intro and an outro. */
  arriving: boolean;
  duration: number;
  easing: (t: number) => number;
  draw(t: number): void;
  clear?(): void;
};

/** A part drawn from a transition's own `css`, written as inline styles on
    the element and taken off again by `clear`. An arriving part never
    starts below NIL_OPACITY, for the reason tokens.ts gives: the Pixel
    stalls on the first frame of a layer it has not rastered. */
export function cssPart(
  el: HTMLElement,
  config: TransitionConfig,
  arriving: boolean
): ScrubPart {
  const written = new Set<string>();
  const css = config.css;
  return {
    arriving,
    duration: config.duration ?? 0,
    easing: config.easing ?? ((t) => t),
    draw(t) {
      if (!css) return;
      for (const declaration of css(t, 1 - t).split(';')) {
        const colon = declaration.indexOf(':');
        if (colon < 0) continue;
        const property = declaration.slice(0, colon).trim();
        let value = declaration.slice(colon + 1).trim();
        if (property === 'opacity' && arriving) value = String(Math.max(Number(value), NIL_OPACITY));
        el.style.setProperty(property, value);
        written.add(property);
      }
    },
    clear() {
      for (const property of written) el.style.removeProperty(property);
      written.clear();
    }
  };
}

export type StepScrub = {
  /** 0 is the second step at rest, 1 the first step arrived. */
  readonly position: number;
  progress(p: number): void;
  /** Settles to 1 (the step back happens) or 0 (it does not). */
  settle(to: 0 | 1): Promise<void>;
  clear(): void;
};

export function stepScrub(parts: ScrubPart[], clock: ScrubClock = browserClock): StepScrub {
  const tOf = (part: ScrubPart, position: number) => (part.arriving ? position : 1 - position);
  const current = parts.map((part) => tOf(part, 0));
  let position = 0;
  let wanted = 0;
  let pending: number | undefined;
  let settleRun = 0;

  const drawAt = (p: number) => {
    position = p;
    parts.forEach((part, i) => {
      current[i] = tOf(part, p);
      part.draw(current[i]);
    });
  };
  drawAt(0);

  return {
    get position() {
      return position;
    },
    progress(p) {
      if (settleRun) return;
      wanted = Math.min(1, Math.max(0, p));
      pending ??= clock.frame(() => {
        pending = undefined;
        drawAt(wanted);
      });
    },
    settle(to) {
      if (pending !== undefined) {
        clock.cancel(pending);
        pending = undefined;
        drawAt(wanted);
      }
      const run = ++settleRun;
      const from = [...current];
      const goal = parts.map((part) => tOf(part, to));
      const spans = parts.map((part, i) => part.duration * Math.abs(goal[i] - from[i]));
      const started = clock.now();
      return new Promise<void>((done) => {
        const step = () => {
          if (run !== settleRun) return done();
          const elapsed = clock.now() - started;
          let finished = true;
          parts.forEach((part, i) => {
            const k = spans[i] > 0 ? Math.min(1, elapsed / spans[i]) : 1;
            if (k < 1) finished = false;
            current[i] = from[i] + (goal[i] - from[i]) * part.easing(k);
            part.draw(current[i]);
          });
          if (finished) {
            position = to;
            settleRun = 0;
            done();
          } else {
            clock.frame(step);
          }
        };
        step();
      });
    },
    clear() {
      if (pending !== undefined) clock.cancel(pending);
      pending = undefined;
      settleRun = 0;
      for (const part of parts) part.clear?.();
    }
  };
}
