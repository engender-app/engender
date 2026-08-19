/* The literature's onset/completion windows for the personal effects
   timeline's eight markers, and the pure arithmetic that turns them into
   epoch-day bands against a given anchor. No journal, no clock, no
   paraglide (ADR-0016): a window is a fixed fact about the literature,
   and converting one to a concrete band needs only the anchor day it is
   asked about - not a live read of anything.

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

   Which of the two tables a window came from is recorded per effect and
   gates the band (phase 5 ticket 27). Both tables are keyed to a drug -
   the feminizing one describes estradiol therapy and the masculinizing one
   testosterone therapy - so a band only means anything when the anchoring
   regimen episode names that drug. Until this gate existed the screen drew
   all eight for everyone, which told someone on testosterone alone when to
   expect their breast development to be complete, and cited the Endocrine
   Society underneath it.

   Phase 5 ticket 41 widens tier 1 from these eight to roughly twenty,
   adding figures read out of GenderGP's HRT timeline tables
   (gendergp.com/blog/hrt-timelines-hormones-effects/, fetched
   2026-08-19), which cite WPATH Standards of Care v7 - the same guideline
   lineage as Hembree's tables, reproduced by a private provider rather
   than a second, independent source. Where the two disagree this file
   keeps following the primary guideline figure, per the facial/body hair
   resolution above; no new disagreement surfaced in the entries GenderGP
   adds. One guideline entry GenderGP tables - masculinising scalp hair
   loss - gives no usable completion figure ("variable", no range), so
   per this ticket's own tier rule it is catalogued at tier 2 (named,
   no band) rather than added here; every other new entry below carries a
   real bounded range and sits at tier 1 alongside the original eight.

   Every window here is a claim about the literature, never a target for
   anyone's own experience - the acceptance criterion this file exists to
   keep honest. Tier 2 and tier 3 effects (personalEffectCatalog.ts) carry
   no entry here at all: `literatureCovers`/`literatureWindow` answer
   "no band" for any key this record does not list, which is the ordinary
   case once the catalogue is open past twenty. */

import { epochDayMonthsAgo } from './epochDay';
import { resolveCurveDrug, type CurveDrug } from './hormoneDrug';
import type { EffectDirection, PersonalEffectType, RegimenEpisode } from './types';

export type { EffectDirection };

interface MonthRange {
  min: number;
  max: number;
}

export interface EffectLiteratureWindow {
  direction: EffectDirection;
  onsetMonths: MonthRange;
  /** Null when the literature reports no defined ceiling at all (skin).
      `max: null` means an open lower bound instead - "more than N months",
      still ongoing past it (hair). */
  completionMonths: { min: number; max: number | null } | null;
}

/** Tier 1 only (personalEffectCatalog.ts's `tier` field) - a partial map,
    not exhaustive over every catalogue key, because tier 2 and tier 3
    effects have no literature window by definition. */
const EFFECT_LITERATURE_WINDOW: Partial<Record<PersonalEffectType, EffectLiteratureWindow>> = {
  breast_development: { direction: 'feminizing', onsetMonths: { min: 3, max: 6 }, completionMonths: { min: 24, max: 36 } },
  fat_redistribution: { direction: 'feminizing', onsetMonths: { min: 3, max: 6 }, completionMonths: { min: 24, max: 36 } },
  skin_softening: { direction: 'feminizing', onsetMonths: { min: 3, max: 6 }, completionMonths: null },
  hair_changes: { direction: 'feminizing', onsetMonths: { min: 6, max: 12 }, completionMonths: { min: 36, max: null } },
  voice_drop: { direction: 'masculinizing', onsetMonths: { min: 6, max: 12 }, completionMonths: { min: 12, max: 24 } },
  facial_body_hair: { direction: 'masculinizing', onsetMonths: { min: 6, max: 12 }, completionMonths: { min: 48, max: 60 } },
  masculinizing_fat_redistribution: {
    direction: 'masculinizing',
    onsetMonths: { min: 1, max: 6 },
    completionMonths: { min: 24, max: 60 }
  },
  cycle_cessation: { direction: 'masculinizing', onsetMonths: { min: 1, max: 6 }, completionMonths: null },

  // Ticket 41's tier-1 widening, from GenderGP's WPATH-sourced tables.
  decreased_muscle_mass_strength: {
    direction: 'feminizing',
    onsetMonths: { min: 3, max: 6 },
    completionMonths: { min: 12, max: 24 }
  },
  decreased_libido: { direction: 'feminizing', onsetMonths: { min: 1, max: 3 }, completionMonths: { min: 12, max: 24 } },
  decreased_spontaneous_erections: {
    direction: 'feminizing',
    onsetMonths: { min: 1, max: 3 },
    completionMonths: { min: 3, max: 6 }
  },
  decreased_testicular_volume: {
    direction: 'feminizing',
    onsetMonths: { min: 3, max: 6 },
    completionMonths: { min: 24, max: 36 }
  },
  male_pattern_baldness_ceasing: {
    direction: 'feminizing',
    onsetMonths: { min: 1, max: 3 },
    completionMonths: { min: 12, max: 24 }
  },
  skin_oiliness_acne_masculinizing: {
    direction: 'masculinizing',
    onsetMonths: { min: 1, max: 6 },
    completionMonths: { min: 12, max: 24 }
  },
  increased_muscle_mass_strength_masculinizing: {
    direction: 'masculinizing',
    onsetMonths: { min: 6, max: 12 },
    completionMonths: { min: 24, max: 60 }
  },
  clitoral_enlargement_masculinizing: {
    direction: 'masculinizing',
    onsetMonths: { min: 3, max: 6 },
    completionMonths: { min: 12, max: 24 }
  },
  vaginal_atrophy_masculinizing: {
    direction: 'masculinizing',
    onsetMonths: { min: 3, max: 6 },
    completionMonths: { min: 12, max: 24 }
  }
};

/** The drug each table's timings are timings of. Hembree's feminizing table
    is a description of estradiol therapy and the masculinizing one of
    testosterone therapy, so this is the tables' own claim rather than a
    mapping chosen here. */
const DIRECTION_DRUG: Record<EffectDirection, CurveDrug> = {
  feminizing: 'estradiol',
  masculinizing: 'testosterone'
};

/** Whether the literature's window for `effect` is a claim about someone on
    `drug` at all - the gate on every band this file produces.

    Fails closed, the way the hormone curve does. `resolveCurveDrug` answers
    null for a free-text drug this app cannot classify, for an antiandrogen
    and for progesterone alone, and null matches neither direction, so those
    episodes get no band rather than a hedged one. That is the whole point:
    without this gate someone whose only episode is testosterone was told,
    sourced on screen to the Endocrine Society, when to expect their breast
    development to be complete.

    Built on hormoneDrug.ts rather than on a second list of drug names, for
    the reason hormoneEster.ts gives about sharing a matcher: one place
    deciding what "E2-val" or "testosteron" names means the effects timeline
    and the curve cannot disagree about the same typed text.

    Also answers false for any key with no tier-1 window at all - a tier 2
    or tier 3 effect, or a custom one - which is the ordinary case once
    the catalogue is open past twenty (ticket 41). */
export function literatureCovers(effect: PersonalEffectType, drug: string): boolean {
  const window = EFFECT_LITERATURE_WINDOW[effect];
  return window !== undefined && resolveCurveDrug(drug) === DIRECTION_DRUG[window.direction];
}

/** Undefined for any key with no tier-1 window - see `literatureCovers`. */
export function literatureWindow(effect: PersonalEffectType): EffectLiteratureWindow | undefined {
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

/** `effect`'s onset and completion as concrete epoch-day ranges counted
    forward from `anchor`, the earliest regimen episode overall
    (regimenEpisode.ts) - what a screen draws its background bands from -
    or null when `anchor`'s drug is not the one this effect's table
    describes and there is no band to draw.

    The anchor is the whole episode because both halves of the answer come
    from it: its start day is where the bands are counted from and its drug
    is what decides whether they exist. Which episode anchors is unchanged
    (ticket 02) - it is still the earliest overall, not the active one. */
export function literatureWindowDays(
  effect: PersonalEffectType,
  anchor: Pick<RegimenEpisode, 'drug' | 'startEpochDay'>
): EffectWindowDays | null {
  if (!literatureCovers(effect, anchor.drug)) return null;

  const anchorEpochDay = anchor.startEpochDay;
  const window = EFFECT_LITERATURE_WINDOW[effect]!;
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
