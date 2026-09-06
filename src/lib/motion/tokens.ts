/* Ticket 09 (MO-003): Svelte's JS-driven transitions (Sheet, Toasts) sit
   outside CSS's reach, so neither reduced-motion selector in theme/base.css
   can clamp their durations the way it clamps every CSS animation and
   transition. These mirror the same --dur-* and --motion-distance- tokens
   and the same html[data-a11y-motion] signal +layout.svelte already stamps, so
   a Svelte transition and its CSS neighbours never drift apart.

   It also carries the two pieces every JS-driven transition here shares: the
   easing, and opacity-alone, which is what both tier 2's reduced-motion
   substitute and tier 3's no-clip-path fallback come down to. */

import { quintOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

/** --ease-out, for the transitions that cannot read a CSS token.

    --ease-out is cubic-bezier(0.22, 1, 0.36, 1). quintOut tracks it to within
    0.011 across the whole curve, which is under a tenth of a pixel over a 24px
    travel, so the two really are one easing rather than two that happen to
    look alike. */
export const EASE_OUT = quintOut;

/** The same --ease-out curve as EASE_OUT, as the string form WAAPI's own
    `animate()` takes - `Animation` has no `css(t)` to hand a JS function to,
    so the two constants exist for the two APIs and must be kept to the one
    curve by hand (phase 5 ticket 32.17's `resize`, the first primitive that
    animates via WAAPI rather than a Svelte transition). */
export const EASE_OUT_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Opacity alone over `duration`, which two different jobs both need: tier
    2's reduced-motion substitute, and tier 3's fallback where the runtime has
    no clip-path. Shared from here rather than written out in both, since the
    shape is identical and only the duration differs. */
export function fadeOnly(duration: number): TransitionConfig {
  return { duration, easing: EASE_OUT, css: (t) => `opacity: ${t}` };
}

interface MotionDocument {
  documentElement: { dataset: Record<string, string | undefined> };
}

function currentDocument(): MotionDocument | undefined {
  return typeof document === 'undefined' ? undefined : document;
}

export function isReducedMotion(doc: MotionDocument | undefined = currentDocument()): boolean {
  return doc?.documentElement.dataset.a11yMotion === 'reduce';
}

function readCssNumber(token: string, fallback: number): number {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type DurationToken = '--dur-fast' | '--dur-med' | '--dur-slow' | '--dur-press' | '--dur-authored';
type DistanceToken = '--motion-distance-sm' | '--motion-distance-md';

/** The values base.css authors each token at, for the no-DOM path -
    exported so tokens.test.ts can hold this table against base.css itself
    rather than trusting it not to drift. Ticket 15 (MO-004): 27 call sites
    used to restate one of these by hand, and --dur-fast (150ms) had
    already drifted to 160 at two of them. One table, read once. */
export const DURATION_FALLBACK: Record<DurationToken, number> = {
  '--dur-fast': 150,
  '--dur-med': 240,
  '--dur-slow': 380,
  '--dur-press': 260,
  '--dur-authored': 700
};

/* DISTANCE_FALLBACK stays exported only for its own test (AU-09 test-only
   review). */
export const DISTANCE_FALLBACK: Record<DistanceToken, number> = {
  '--motion-distance-sm': 10,
  '--motion-distance-md': 24
};

/** A duration token in milliseconds, whatever unit it is written in.

    The unit has to be read rather than assumed, and this cost the app every
    JS-driven animation it has - in production only, which is why it survived
    from ticket 09 to phase 5 ticket 31 without anyone seeing it. The tokens
    are authored as `240ms`, and `npm run dev` serves exactly that, so
    parseFloat gives 240 and every sheet, toast, fan and crossfade runs at its
    real duration. A production build minifies the stylesheet, and a CSS
    minifier is free to rewrite `240ms` as `.24s` because to CSS those are the
    same value. To parseFloat they are 240 and 0.24. So every transition that
    reads its duration through here has been running in about a quarter of a
    millisecond in every build anyone could install, while looking correct on
    the machine it was written on.

    Found because the calendar's new month label would not animate on a phone
    (phase 5 ticket 31) and animated perfectly in dev. */
function readCssMs(token: string, fallback: number): number {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed)) return fallback;
  /* `ms` first: `.endsWith('s')` is true of both units, and that ordering is
     the whole bug in miniature. */
  if (/ms$/i.test(raw)) return parsed;
  if (/s$/i.test(raw)) return parsed * 1000;
  /* Unitless is not a valid <time> in CSS, so treat it as the ms the tokens
     are authored in rather than inventing a unit for it. */
  return parsed;
}

/** A duration that reduced motion is allowed to take to zero.

    --dur-crossfade is deliberately absent from the union: it exists because
    this function returns 0 under reduced motion, so routing it through here
    would reintroduce the instant cut it was added to prevent. Read it with
    crossfadeDuration() instead. */
export function motionDuration(token: DurationToken): number {
  return isReducedMotion() ? 0 : readCssMs(token, DURATION_FALLBACK[token]);
}

export function motionDistance(token: DistanceToken): number {
  return readCssNumber(token, DISTANCE_FALLBACK[token]);
}

/** How long a reduced-motion substitute crossfades for.

    Deliberately not motionDuration(): that returns 0 under reduced motion,
    which is the right answer for a movement and the wrong one here.
    The reduced-motion contract substitutes rather than deletes - tier 2 becomes
    a crossfade, and a crossfade with no duration is an instant cut.
    prefers-reduced-motion is about movement; opacity does not move
    anything. --dur-crossfade sits outside base.css's clamp blocks for the
    same reason. */
export function crossfadeDuration(): number {
  return readCssMs('--dur-crossfade', 120);
}
