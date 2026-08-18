/* The literature's onset/completion windows for ticket 07's four personal
   effect markers, and the pure arithmetic that turns them into epoch-day
   bands against a given anchor. No journal, no clock, no paraglide
   (ADR-0016): a window is a fixed fact about the literature, the same way
   MEASUREMENT_TYPES is a fixed fact about what a measurement can be, and
   converting one to a concrete band needs only the anchor day it is asked
   about - not a live read of anything.

   Figures are the time-course table from Hembree WC et al., "Endocrine
   Treatment of Gender-Dysphoric/Gender-Incongruent Persons: An Endocrine
   Society Clinical Practice Guideline," J Clin Endocrinol Metab.
   2017;102(11):3869-3903 - the table reproduced across major
   gender-affirming care programs (UCSF, University of Michigan, University
   of Minnesota Boynton Health, Rainbow Health Ontario) for feminizing
   hormone therapy's expected timing, and the source m.effect_source() names
   on screen. Every window here is a claim about the literature, never a
   target for anyone's own experience - the acceptance criterion this file
   exists to keep honest. */

import { epochDayMonthsAgo } from './epochDay';
import type { PersonalEffectType } from './types';

export const PERSONAL_EFFECT_TYPES: readonly PersonalEffectType[] = [
  'breast_development',
  'fat_redistribution',
  'skin_softening',
  'hair_changes'
];

interface MonthRange {
  min: number;
  max: number;
}

export interface EffectLiteratureWindow {
  onsetMonths: MonthRange;
  /** Null when the literature reports no defined ceiling at all (skin).
      `max: null` means an open lower bound instead - "more than N months",
      still ongoing past it (hair). */
  completionMonths: { min: number; max: number | null } | null;
}

const EFFECT_LITERATURE_WINDOW: Record<PersonalEffectType, EffectLiteratureWindow> = {
  breast_development: { onsetMonths: { min: 3, max: 6 }, completionMonths: { min: 24, max: 36 } },
  fat_redistribution: { onsetMonths: { min: 3, max: 6 }, completionMonths: { min: 24, max: 36 } },
  skin_softening: { onsetMonths: { min: 3, max: 6 }, completionMonths: null },
  hair_changes: { onsetMonths: { min: 6, max: 12 }, completionMonths: { min: 36, max: null } }
};

export function literatureWindow(effect: PersonalEffectType): EffectLiteratureWindow {
  return EFFECT_LITERATURE_WINDOW[effect];
}

/** Onset always has a definite end - only a completion window can be
    open-ended (hair_changes' ">3 years"), so the two get their own types
    rather than one sharing a nullable `end` neither caller actually wants. */
export interface OnsetDayRange {
  start: number;
  end: number;
}

export interface CompletionDayRange {
  start: number;
  end: number | null;
}

export interface EffectWindowDays {
  onset: OnsetDayRange;
  completion: CompletionDayRange | null;
}

/** `window` in calendar months after `anchorEpochDay`, per calendar-month
    arithmetic (epochDay.ts) rather than a flat 30-day multiply - the same
    reasoning `epochDayMonthsAgo` exists for, applied forward. Negating the
    month count is what "after" means to a function named for "ago". */
function afterAnchor(anchorEpochDay: number, months: number): number {
  return epochDayMonthsAgo(anchorEpochDay, -months);
}

/** `window`'s onset and completion, as concrete epoch-day ranges counted
    forward from `anchorEpochDay` (the earliest regimen episode's start
    day, regimenEpisode.ts) - what a screen draws its background bands
    from. */
export function literatureWindowDays(effect: PersonalEffectType, anchorEpochDay: number): EffectWindowDays {
  const window = EFFECT_LITERATURE_WINDOW[effect];
  const completion = window.completionMonths
    ? {
        start: afterAnchor(anchorEpochDay, window.completionMonths.min),
        end: window.completionMonths.max == null ? null : afterAnchor(anchorEpochDay, window.completionMonths.max)
      }
    : null;
  return {
    onset: { start: afterAnchor(anchorEpochDay, window.onsetMonths.min), end: afterAnchor(anchorEpochDay, window.onsetMonths.max) },
    completion
  };
}
