/* Tier 2 navigation uses fade-through between peer tabs, horizontal
   shared axis between list and detail, and container transform into
   the entry editor when the source card becomes the content.

   Share --dur-* and --motion-distance-* with CSS. In reduced motion,
   crossfade in place. CSS's 1 ms clamp does not apply to these Svelte
   transitions, so give each an explicit substitute. */

import { crossfade } from 'svelte/transition';
import type { TransitionConfig } from 'svelte/transition';

import { isAndroid } from '../platform';
import { travelSettle } from './blindSettle';
import { PART_TRAVEL } from './fieldBlind';
import {
  crossfadeDuration,
  EASE_OUT,
  fadeOnly,
  isReducedMotion,
  motionDistance,
  motionDuration
} from './tokens';
import type { DurationToken } from './tokens';

/* Svelte reports 'both' for a bare `transition:`, which cannot tell an
   entrance from an exit. Each primitive below reads it as an entrance,
   which is why they are documented as `in:`/`out:` pairs. */
type Direction = 'in' | 'out' | 'both';

/** No curve at all, for the one primitive that shapes its own values. */
const LINEAR = (t: number) => t;

/** The substitute every tier-2 primitive falls back to under reduced
    motion: the same crossfade, none of the movement. */
const crossfadeOnly = (): TransitionConfig => fadeOnly(crossfadeDuration());

/** Use shared easing with --dur-fast for exit and --dur-med for entrance.
    A shorter exit makes room for the response. A caller such as a sheet can
    override timing for distance-based travel while keeping the same reduced
    motion substitute. */
function tier2(
  css: (t: number, u: number) => string,
  direction?: Direction,
  timing?: { duration: DurationToken; easing: (t: number) => number }
): TransitionConfig {
  if (isReducedMotion()) return crossfadeOnly();
  const token = timing?.duration ?? (direction === 'out' ? '--dur-fast' : '--dur-med');
  return { duration: motionDuration(token), easing: timing?.easing ?? EASE_OUT, css };
}

/**
 * Tier 2, between the four tabs: fade-through. The outgoing screen fades
 * out and settles to 0.97, the incoming one fades in from 1.03. No
 * horizontal slide, because sliding implies an order the four tabs do not
 * have.
 *
 * Use as `in:fadeThrough` and `out:fadeThrough`; a bare `transition:`
 * cannot tell the two apart and gets the incoming shape both ways.
 */
/* fadeThrough stays exported only for its own test. */
export function fadeThrough(
  _node: Element,
  _params: Record<string, never> = {},
  options: { direction?: Direction } = {}
): TransitionConfig {
  /* Outgoing shrinks past its resting size, incoming settles down onto it,
     so the two never read as the same screen scaling twice. */
  const travel = options.direction === 'out' ? -0.03 : 0.03;
  return tier2((t, u) => `opacity: ${t}; transform: scale(${1 + travel * u})`, options.direction);
}

/**
 * Tier 2, into a detail from a list: shared-axis-X. The incoming screen
 * enters from `--motion-distance-md` away and the outgoing one leaves by
 * the same distance, so the pair reads as one axis rather than two
 * independent moves. `back: true` reverses the axis for the return trip.
 */
export function sharedAxisX(
  _node: Element,
  params: { back?: boolean } = {},
  options: { direction?: Direction } = {}
): TransitionConfig {
  const distance = motionDistance('--motion-distance-md');
  const away = params.back ? -1 : 1;
  const sign = options.direction === 'out' ? -away : away;
  return tier2(
    (t, u) => `opacity: ${t}; transform: translateX(${sign * distance * u}px)`,
    options.direction
  );
}

/**
 * Tier 2 step changes animate live DOM field parts. Fade the outgoing part
 * over --dur-fast, then start the incoming one. The shared box follows the
 * field edge once for both.
 *
 * A printed part moves 12px relative to that box. An item under the field
 * rides with the box and only fades. Resolve --part-travel per frame, since
 * the sign depends on the measured edge movement and the next step may be
 * shorter. The initial frame multiplies travel by zero.
 */
export function fieldPart(
  node: Element,
  params: { printed?: boolean } = {},
  options: { direction?: Direction } = {}
): TransitionConfig {
  if (isReducedMotion()) return crossfadeOnly();
  /* Leaving goes with the edge and arriving comes from the far side of it,
     which is what stops the two reading as one element sliding through. */
  const sign = options.direction === 'out' ? 1 : -1;
  /* Where the element is when this starts. A second change landing while a question is
     still arriving turns its arrival into a departure, and one landing while it is leaving
     brings it back: the transitions are separate and each began from its own idea of where
     it started, so a question 30% in and 3px off its place was 100% in and on its place in
     one frame and popped back off it as it left, and one 67% out started again from nothing
     (-9px and a full-opacity flash on the flipbook). Each starts from what is drawn. A
     fresh element is not being animated, and gets the curves this always had. */
  const leaving = options.direction === 'out';
  let shown = leaving ? 1 : 0;
  let offset = 0;
  let resumed = false;
  if (typeof getComputedStyle === 'function') {
    const running = typeof node.getAnimations === 'function' && node.getAnimations().length > 0;
    if (leaving || running) {
      const style = getComputedStyle(node);
      const opacity = Number(style.opacity);
      if (Number.isFinite(opacity)) shown = opacity;
      if (params.printed) {
        const matrix = /matrix\(([^)]+)\)/.exec(style.transform)?.[1].split(',');
        offset = matrix ? Number(matrix[5]) || 0 : 0;
      }
      resumed = running;
    }
  }
  const opacityAt = (t: number) => {
    const ramp = Math.min(1, t * 2);
    return leaving ? ramp * shown : resumed ? shown + (1 - shown) * ramp : ramp;
  };
  const move = (u: number) => {
    if (!params.printed) return '';
    if (!leaving && resumed) return `transform: translateY(${offset * u}px)`;
    return offset
      ? `transform: translateY(calc(${offset}px + (var(--part-travel, ${PART_TRAVEL}px) * ${sign} - ${offset}px) * ${u}))`
      : `transform: translateY(calc(var(--part-travel, ${PART_TRAVEL}px) * ${sign * u}))`;
  };
  const fast = motionDuration('--dur-fast');
  return {
    duration: fast,
    /* Half a --dur-fast, and the arithmetic below is why. The incoming half
       used to wait a whole one, which is the sequence app.css runs on the
       field's own pseudo elements - and measured on this ticket's flipbooks
       it left five frames, about 85ms, with no question on the field at
       all. A photograph of a screen can afford that; a real element cannot,
       and "no frame shows an element in neither place" is this ticket's
       own acceptance.

       So the two halves are a crossfade whose opacities sum to one at every
       moment: each runs at twice its own rate and holds at full, so the
       outgoing one is solid for the first half of its length, the incoming
       one is solid for the last half of its, and the crossover is the 75ms
       between. No frame is empty and no frame carries two solid ones. */
    delay: leaving || resumed ? 0 : Math.round(fast / 2),
    /* Linear, because the shape is in the css below rather than in the
       curve: an eased opacity and a doubled rate would compound into a
       crossover neither of them describes. */
    easing: LINEAR,
    css: (t, u) => `opacity: ${opacityAt(t)}; ${move(u)}`
  };
}

/**
 * Move a sheet by the greater of its own height and the distance from
 * its top to the scrim floor. The scrim is fixed to the transformed
 * .app frame, which can end above the window bottom. A centered sheet
 * needs extra distance to clear that floor. Read the live rect so a
 * dragged sheet continues from its current position.
 */
function sheetTravel(node: Element): number {
  const rect = node.getBoundingClientRect();
  const frame = node.closest('[data-sheet-scrim]')?.getBoundingClientRect();
  /* The viewport's own bottom as well: on a screen whose scrim ends above it, travelling to
     the scrim's edge left the top 12px of the sheet on screen at the end of the exit, where
     it vanished in one frame. */
  const viewportBottom = typeof window === 'undefined' ? 0 : window.innerHeight;
  return Math.max(rect.height, (frame?.bottom ?? rect.bottom) - rect.top, viewportBottom - rect.top);
}

/** Let Android prepare the scrim and sheet layer before panel travel. */
export function sheetEntranceDelay(): number {
  return isAndroid() ? Math.round(motionDuration('--dur-fast') / 2) : 0;
}

/**
 * Tier 2 sheets travel their full height with no opacity change.
 * The scrim fades separately. The entrance overshoots and settles, the exit
 * eases down without overshooting, and the skirt keeps the bottom covered.
 *
 * Both directions use --dur-slow to avoid large gaps between frames.
 * Use in:sheetRise and out:sheetRise separately, since transition: reports
 * 'both' and would give the exit its own entrance overshoot.
 */
export function sheetRise(
  node: Element,
  _params: Record<string, never> = {},
  options: { direction?: Direction } = {}
): TransitionConfig {
  const travel = sheetTravel(node);
  const transition = tier2((_t, u) => `transform: translateY(${travel * u}px)`, undefined, {
    duration: '--dur-slow',
    easing: travelSettle(travel, { closes: options.direction === 'out' })
  });
  /* The Android WebView needs a few painted frames to prepare the full-screen
     withdrawal blur and the sheet layer. Starting their animations together
     skipped most of the first rise on a fresh route. Svelte holds the sheet
     at its off-screen keyframe during this delay. */
  const delay = options.direction === 'in' ? sheetEntranceDelay() : 0;
  if (delay) transition.delay = delay;
  return transition;
}

/**
 * Tier 2, sheet backdrop scrim: fade over `--dur-slow` matching sheet entrance/exit.
 *
 * Svelte's built-in `fade` reads `getComputedStyle(node).opacity`, which locks the
 * transition ceiling to intermediate values if triggered while layout or classes are in flux.
 * Using an explicit `opacity: ${t}` curve guarantees a smooth 0-to-1 / 1-to-0 transition.
 */
export function scrimFade(
  _node: Element,
  _params: Record<string, never> = {},
  _options: { direction?: Direction } = {}
): TransitionConfig {
  return tier2((t) => `opacity: ${t}`, undefined, {
    duration: '--dur-slow',
    easing: EASE_OUT
  });
}

/* svelte/transition's crossfade already is a container transform: it
   measures both boxes and tweens position and size between them. Handing
   it the token duration is all this needs to speak the same language as
   everything above. */
const [send, receive] = crossfade({
  /* --dur-slow rather than --dur-med, which is what the other three tier-2
     patterns run on: this is the only one that carries a box across the
     screen and resizes it on the way, and Material gives a container
     transform its longest standard duration for exactly that reason. At
     240ms the card arrives before the eye has followed it, which loses the
     one thing the pattern exists to show. */
  duration: () => motionDuration('--dur-slow'),
  easing: EASE_OUT
});

/**
 * Tier 2, into the entry editor: container transform, the one screen where
 * the source really does become the destination. Put `containerSend` on
 * the card and `containerReceive` on the editor, keyed by the entry id.
 *
 * Under reduced motion both halves stop deferring to each other and just
 * crossfade, because a FLIP between two boxes is nothing but movement.
 */
/* containerSend stays exported only for its own test. */
export function containerSend(node: Element, params: { key: unknown }) {
  return isReducedMotion() ? crossfadeOnly() : send(node, params);
}

/* containerReceive stays exported only for its own test. */
export function containerReceive(node: Element, params: { key: unknown }) {
  return isReducedMotion() ? crossfadeOnly() : receive(node, params);
}
