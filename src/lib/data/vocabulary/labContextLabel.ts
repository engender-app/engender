/* Display wording for a lab draw's dosing context (phase 4 ticket 03), here
   beside doseLabels.ts for the reason that file gives: the wording speaks
   paraglide, and nothing the Node tier touches may import that (ADR-0016).
   labTiming.ts derives the figures and stays free of it; this is where they
   get their words.

   Descriptive only. Every string here says where a draw fell and stops: no
   phrasing names one draw time as better than another, and the
   comparability flag says the points differ without saying which is right.
   That is the whole difference between this and the draw-timing helper
   rejected at the phase 4 grilling session (Q15). */

import { m } from '$lib/paraglide/messages';
import { intlLocale } from '$lib/data/dates';
import { routeLabel } from './doseLabels';
import type { ComparabilityAxis } from '$lib/data/labTiming';
import type { LabTiming } from '$lib/data/types';

/** The stored figure keeps its fraction (a sublingual peak is inside two
    hours), so it is rounded for display and localized: a Polish reader
    expects "1,5", not "1.5". */
const fmtHours = (hours: number): string =>
  new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 }).format(hours);

/** Where the draw fell, in words, with the route it was measured against.
    The route is a segment of its own rather than a slot inside the sentence:
    the route labels are capitalized for the pickers they were written for,
    and "the Intramuscular interval" reads like a proper noun in English and
    forces a case agreement in Polish that a parenthetical does not. */
export const labTimingLabel = (timing: LabTiming): string => {
  const figure =
    'dayOfInterval' in timing
      ? m.labs_timing_day({ day: String(timing.dayOfInterval) })
      : m.labs_timing_hours({ hours: fmtHours(timing.hoursSinceDose) });
  return `${figure} · ${routeLabel(timing.route)}`;
};

const AXIS_LABELS: Record<ComparabilityAxis, () => string> = {
  position: m.labs_mixed_position,
  route: m.labs_mixed_route,
  provider: m.labs_mixed_provider
};

/** One phrase per axis the series disagrees on, listed rather than joined
    into a sentence: a comma-spliced list of fragments is the kind of thing
    that only reads well in the language it was written in. */
export const comparabilityLabels = (axes: readonly ComparabilityAxis[]): string[] =>
  axes.map((axis) => AXIS_LABELS[axis]());
