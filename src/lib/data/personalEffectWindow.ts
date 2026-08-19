/* The literature's onset/completion windows for the personal effects
   timeline's eight markers, and the pure arithmetic that turns them into
   epoch-day bands against a given anchor. No journal, no clock, no
   paraglide (ADR-0016): a window is a fixed fact about the literature, the
   same way MEASUREMENT_TYPES is a fixed fact about what a measurement can
   be, and converting one to a concrete band needs only the anchor day it
   is asked about - not a live read of anything.

   The four feminizing markers (phase 4 ticket 07) come from the
   feminizing time-course table in Hembree WC et al., "Endocrine Treatment
   of Gender-Dysphoric/Gender-Incongruent Persons: An Endocrine Society
   Clinical Practice Guideline," J Clin Endocrinol Metab.
   2017;102(11):3869-3903 - the table reproduced across major
   gender-affirming care programs (UCSF, University of Michigan, University
   of Minnesota Boynton Health, Rainbow Health Ontario) for feminizing
   hormone therapy's expected timing, and the source m.effect_source() names
   on screen.

   The four masculinizing markers added by phase 5 ticket 02 - voice_drop,
   facial_body_hair, masculinizing_fat_redistribution, cycle_cessation -
   come from the same paper's separate masculinizing time-course table
   (Table 12, p. 3888): deepening of voice, facial/body hair growth, fat
   redistribution, and cessation of menses respectively. Cross-checked
   against Rainbow Health Ontario's "Masculinizing Hormone Therapy"
   reproduction of that table: fat redistribution and cycle cessation match
   exactly; facial/body hair's completion window (4-5 years) also matches,
   though Rainbow Health Ontario gives its onset as 3-6 months against
   Hembree's own 6-12 - this file follows Hembree's primary figure, the
   same source the feminizing four are drawn from, over the reproduction
   where the two disagree. Cycle cessation's literature completion window
   is genuinely unbounded - Hembree gives no ceiling at all, and Rainbow
   Health Ontario's "n/a" reads the same way - so it is modelled exactly
   like skin_softening's null completion, not an open-ended band like
   hair_changes': there is no reported minimum-months-until-typically-done
   to even start an open band from.

   Every window here is a claim about the literature, never a target for
   anyone's own experience - the acceptance criterion this file exists to
   keep honest. */

import { epochDayMonthsAgo } from './epochDay';
import type { PersonalEffectType } from './types';

export const PERSONAL_EFFECT_TYPES: readonly PersonalEffectType[] = [
  'breast_development',
  'fat_redistribution',
  'skin_softening',
  'hair_changes',
  'voice_drop',
  'facial_body_hair',
  'masculinizing_fat_redistribution',
  'cycle_cessation'
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
  hair_changes: { onsetMonths: { min: 6, max: 12 }, completionMonths: { min: 36, max: null } },
  voice_drop: { onsetMonths: { min: 6, max: 12 }, completionMonths: { min: 12, max: 24 } },
  facial_body_hair: { onsetMonths: { min: 6, max: 12 }, completionMonths: { min: 48, max: 60 } },
  masculinizing_fat_redistribution: { onsetMonths: { min: 1, max: 6 }, completionMonths: { min: 24, max: 60 } },
  cycle_cessation: { onsetMonths: { min: 1, max: 6 }, completionMonths: null }
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
