/* Turn WPATH SOC8 Appendix C, Table 1 (p. S254) into dated onset and
   completion bands. Convert years to months and leave an open upper
   bound for "more than five years." ADR-0096 records SOC8's departures
   from Hembree 2017 and the shared guideline lineage.

   Each window carries its source and review date for the 24-month
   freshness check. Draw a band only when the anchoring regimen matches
   the source table's drug, estradiol or testosterone. The figures
   describe the literature. An effect without a source-backed window
   gets no band, and effectTier derives its tier from this registry.
   The arithmetic takes an anchor day and needs no journal or clock. */

import { epochDayMonthsAgo } from './epochDay';
import { resolveHormoneDrug, type HormoneDrug } from './hormoneDrug';
import type { EffectDirection, PersonalEffectType, RegimenEpisode } from './types';


interface MonthRange {
  min: number;
  max: number;
}

/** Where a band's figures were read. One source today; a band read from a
    second one (a primary study for a single effect, say) adds a key here. */
export const LITERATURE_SOURCES = {
  'soc8-appendix-c-table-1': {
    citation:
      'Coleman E, Radix AE, Bouman WP, et al. Standards of Care for the Health of Transgender and Gender Diverse People, Version 8. Int J Transgend Health. 2022;23(sup1):S1-S259. Appendix C, Table 1, p. S254. doi:10.1080/26895269.2022.2100644',
    /** The edition's publication day, so a stale guard can say what to re-check. */
    published: '2022-09-15'
  }
} as const;

export type LiteratureSourceKey = keyof typeof LITERATURE_SOURCES;

/** What every window below shares: one table, read on one day. */
const SOC8 = { source: 'soc8-appendix-c-table-1', reviewedOn: '2026-10-21' } as const;

interface EffectLiteratureWindow {
  source: LiteratureSourceKey;
  /** The ISO day these figures were last read against `source`. */
  reviewedOn: string;
  direction: EffectDirection;
  onsetMonths: MonthRange;
  /** Null when the literature reports no defined ceiling at all (skin).
      `max: null` means an open lower bound instead - "more than N months",
      still ongoing past it (hair). */
  completionMonths: { min: number; max: number | null } | null;
}

/** Tier 1 only - a partial map, not exhaustive over every catalogue key
    (vocabulary/builtins.ts's BUILT_IN_PERSONAL_EFFECT_TYPES), because tier
    2 and tier 3 effects have no literature window by definition. Listing a
    key here is what makes it tier 1; see `effectTier`. */
const EFFECT_LITERATURE_WINDOW: Partial<Record<PersonalEffectType, EffectLiteratureWindow>> = {
  // Feminizing (estradiol)
  breast_development: { ...SOC8, direction: 'feminizing', onsetMonths: { min: 3, max: 6 }, completionMonths: { min: 24, max: 60 } },
  fat_redistribution: { ...SOC8, direction: 'feminizing', onsetMonths: { min: 3, max: 6 }, completionMonths: { min: 24, max: 60 } },
  skin_softening: { ...SOC8, direction: 'feminizing', onsetMonths: { min: 3, max: 6 }, completionMonths: null },
  hair_changes: { ...SOC8, direction: 'feminizing', onsetMonths: { min: 6, max: 12 }, completionMonths: { min: 36, max: null } },
  decreased_muscle_mass_strength: {
    ...SOC8,
    direction: 'feminizing',
    onsetMonths: { min: 3, max: 6 },
    completionMonths: { min: 12, max: 24 }
  },
  decreased_libido: { ...SOC8, direction: 'feminizing', onsetMonths: { min: 1, max: 3 }, completionMonths: null },
  decreased_spontaneous_erections: {
    ...SOC8,
    direction: 'feminizing',
    onsetMonths: { min: 1, max: 3 },
    completionMonths: { min: 3, max: 6 }
  },
  decreased_testicular_volume: { ...SOC8, direction: 'feminizing', onsetMonths: { min: 3, max: 6 }, completionMonths: null },

  // Masculinizing (testosterone)
  voice_drop: { ...SOC8, direction: 'masculinizing', onsetMonths: { min: 1, max: 6 }, completionMonths: { min: 12, max: 24 } },
  facial_body_hair: { ...SOC8, direction: 'masculinizing', onsetMonths: { min: 6, max: 12 }, completionMonths: { min: 60, max: null } },
  scalp_hair_loss_masculinizing: {
    ...SOC8,
    direction: 'masculinizing',
    onsetMonths: { min: 6, max: 12 },
    completionMonths: { min: 60, max: null }
  },
  masculinizing_fat_redistribution: {
    ...SOC8,
    direction: 'masculinizing',
    onsetMonths: { min: 1, max: 6 },
    completionMonths: { min: 24, max: 60 }
  },
  cycle_cessation: { ...SOC8, direction: 'masculinizing', onsetMonths: { min: 1, max: 6 }, completionMonths: { min: 12, max: 24 } },
  skin_oiliness_acne_masculinizing: {
    ...SOC8,
    direction: 'masculinizing',
    onsetMonths: { min: 1, max: 6 },
    completionMonths: { min: 12, max: 24 }
  },
  increased_muscle_mass_strength_masculinizing: {
    ...SOC8,
    direction: 'masculinizing',
    onsetMonths: { min: 6, max: 12 },
    completionMonths: { min: 24, max: 60 }
  },
  clitoral_enlargement_masculinizing: {
    ...SOC8,
    direction: 'masculinizing',
    onsetMonths: { min: 1, max: 6 },
    completionMonths: { min: 12, max: 24 }
  },
  vaginal_atrophy_masculinizing: {
    ...SOC8,
    direction: 'masculinizing',
    onsetMonths: { min: 1, max: 6 },
    completionMonths: { min: 12, max: 24 }
  }
};

/** Every band's source and reviewed-on day, one row per tier-1 effect: what
    the release-time staleness guard reads. */
export function literatureReviews(): { effect: PersonalEffectType; source: LiteratureSourceKey; reviewedOn: string }[] {
  return (Object.entries(EFFECT_LITERATURE_WINDOW) as [PersonalEffectType, EffectLiteratureWindow][]).map(
    ([effect, window]) => ({ effect, source: window.source, reviewedOn: window.reviewedOn })
  );
}

/** The drug each table's timings are timings of. SOC8's feminizing column
    is a description of estradiol therapy and the masculinizing one of
    testosterone therapy, so this is the tables' own claim rather than a
    mapping chosen here. */
const DIRECTION_DRUG: Record<EffectDirection, HormoneDrug> = {
  feminizing: 'estradiol',
  masculinizing: 'testosterone'
};

/** Show a band only when resolveHormoneDrug classifies the drug and the
    literature supplies a tier-1 window for that direction. Unknown names,
    antiandrogens and progesterone alone match neither direction. Custom and
    later-tier effects without a window get no band. */
/* literatureCovers stays exported only for its own test (AU-09 test-only
   review). */
export function literatureCovers(effect: PersonalEffectType, drug: string): boolean {
  const window = EFFECT_LITERATURE_WINDOW[effect];
  return window !== undefined && resolveHormoneDrug(drug) === DIRECTION_DRUG[window.direction];
}

/** Undefined for any key with no tier-1 window - see `literatureCovers`. */
export function literatureWindow(effect: PersonalEffectType): EffectLiteratureWindow | undefined {
  return EFFECT_LITERATURE_WINDOW[effect];
}

/** Onset always has a definite end - only a completion window can be
    open-ended (hair_changes' ">3 years"), so the two get their own types
    rather than one sharing a nullable `end` neither caller actually wants. */
interface OnsetDayRange {
  start: number;
  end: number;
}

interface CompletionDayRange {
  start: number;
  end: number | null;
}

interface EffectWindowDays {
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

/** Where HRT began, which drug its bands are read against, and where it
    stopped (functional audit ticket 18, CONTEXT: "HRT start"). The three
    parts of an answer `literatureWindowDays` needs, in the shape of an
    episode so a single episode still passes as one. */
export type HrtAnchor = Pick<RegimenEpisode, 'drug' | 'startEpochDay' | 'endEpochDay'>;

/**
 * Anchor effect timelines to HRT episodes in start-day order.
 * Use the portable hrtStartEpochDay override, or the earliest HRT
 * start. Choose the first HRT episode with an estradiol or testosterone
 * table, falling back to the first HRT episode. An earlier antiandrogen
 * can start the clock.
 *
 * Keep the anchor open while any HRT episode runs. Otherwise use
 * the last end day. A date without an episode anchors elapsed time
 * without a drug band. Return null when both are absent.
 */
export function hrtAnchor(episodes: readonly RegimenEpisode[], hrtStartEpochDay: number | null): HrtAnchor | null {
  const hrt = episodes.filter((episode) => episode.drugClass === 'hrt');
  if (hrt.length === 0 && hrtStartEpochDay === null) return null;
  const drug = (hrt.find((episode) => resolveHormoneDrug(episode.drug) !== null) ?? hrt[0])?.drug ?? '';
  const ends = hrt.map((episode) => episode.endEpochDay);
  return {
    drug,
    startEpochDay: hrtStartEpochDay ?? hrt[0].startEpochDay,
    endEpochDay: ends.length > 0 && ends.every((end) => end !== null) ? Math.max(...(ends as number[])) : null
  };
}

/**
 * Convert an effect's onset and completion to epoch days relative to
 * the anchor's start. Return null if the anchor drug does not match
 * the source table or the episode ended before onset.
 *
 * Clip each band at the episode end, including open completion
 * bounds. Omit a completion window the episode never reached.
 */
export function literatureWindowDays(
  effect: PersonalEffectType,
  anchor: Pick<RegimenEpisode, 'drug' | 'startEpochDay' | 'endEpochDay'>
): EffectWindowDays | null {
  if (!literatureCovers(effect, anchor.drug)) return null;

  const anchorEpochDay = anchor.startEpochDay;
  const endEpochDay = anchor.endEpochDay;
  const window = EFFECT_LITERATURE_WINDOW[effect]!;

  /** The one question the clip asks, asked once. Always false while the
      episode is open, which is what leaves every band exactly as it was
      before the clip existed. */
  const pastEnd = (day: number): boolean => endEpochDay !== null && day > endEpochDay;
  const clip = (day: number): number => (pastEnd(day) ? endEpochDay! : day);

  const onsetStart = afterAnchor(anchorEpochDay, window.onsetMonths.min);
  if (pastEnd(onsetStart)) return null;

  const completionStart = window.completionMonths ? afterAnchor(anchorEpochDay, window.completionMonths.min) : null;
  const completion =
    window.completionMonths && completionStart !== null && !pastEnd(completionStart)
      ? {
          start: completionStart,
          end:
            window.completionMonths.max == null
              ? endEpochDay
              : clip(afterAnchor(anchorEpochDay, window.completionMonths.max))
        }
      : null;

  return {
    onset: { start: onsetStart, end: clip(afterAnchor(anchorEpochDay, window.onsetMonths.max)) },
    completion
  };
}

/** An effect's source tier, the property CONTEXT names every built-in
    personal effect as carrying: tier 1 has a literature band, tier 2 is a
    named marker from the community catalogue with no band, and tier 3 is
    a person's own addition with no source at all.

    Derived, never stored, per ADR-0010 - the tier is exactly "is it
    built in, and does this file list a window for it", so a key gaining a
    window becomes tier 1 by that fact alone and nothing has to be kept in
    step with it. It lived as three untested lines inside
    care/changes/+page.svelte, deciding both which citation prints
    under an effect and whether a band is offered at all. */
export function effectTier(effect: { key: PersonalEffectType; builtIn: boolean }): 1 | 2 | 3 {
  if (!effect.builtIn) return 3;
  return literatureWindow(effect.key) ? 1 : 2;
}

/** Which of the three shapes an effect's window has, enumerated here so
    the screen picking a sentence per shape does not re-derive them from
    the nullable fields:

    - `no-completion`, the literature reports no defined ceiling at all
      (skin softening),
    - `open-completion`, a lower bound still running past it (hair
      changes' "more than 3 years"),
    - `bounded`, both ends given.

    `none` for any key with no tier-1 window - a tier 2 or tier 3 effect -
    which is the ordinary case. */
type EffectWindowShape = 'none' | 'no-completion' | 'open-completion' | 'bounded';

export function effectWindowShape(effect: PersonalEffectType): EffectWindowShape {
  const window = EFFECT_LITERATURE_WINDOW[effect];
  if (!window) return 'none';
  if (!window.completionMonths) return 'no-completion';
  return window.completionMonths.max == null ? 'open-completion' : 'bounded';
}
