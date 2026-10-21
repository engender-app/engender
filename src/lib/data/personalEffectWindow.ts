/* The literature's onset/completion windows for the personal effects
   timeline's tier-1 markers, and the pure arithmetic that turns them into
   epoch-day bands against a given anchor. No journal, no clock, no
   paraglide (ADR-0016): a window is a fixed fact about the literature,
   and converting one to a concrete band needs only the anchor day it is
   asked about - not a live read of anything.

   Every window follows WPATH Standards of Care 8, Appendix C, Table 1
   (p. S254), cell for cell (functional audit ticket 22). SOC8's table says
   it is adapted from Hembree et al. 2017, the Endocrine Society tables the
   first eight windows were read from, and the other nine came from
   GenderGP's reproduction of SOC7. Neither is an independent check on
   SOC8: one guideline lineage, four authors shared between Hembree 2017 and
   SOC8, and both tables call their figures clinical observation. SOC8
   departs from Hembree in nine cells without a stated reason (voice onset
   1-6 months, the 1-2 year maximum for cessation of menses, the unknown
   maximum for decreased libido among them); the ADR that records this
   ticket names all nine, and the research notes with the sources sit
   beside it in the docs repo.

   Following SOC8 exactly moved ten bands. Hair loss ceasing on estradiol
   left tier 1 because SOC8 gives it "variable" for both figures, and scalp
   hair loss on testosterone joined it with 6-12 months and more than five
   years. Years are written as months here: 2-5 y is 24-60, and "> 5 y" is
   an open completion from 60.

   Each window carries its source and the day it was last read against
   that source, so the release-time guard (functional audit ticket 40) can
   say when the figures are older than its 24-month limit and what to
   re-check.

   Which of the two tables a window came from is recorded per effect and
   gates the band (phase 5 ticket 27). Both tables are keyed to a drug -
   the feminizing one describes estradiol therapy and the masculinizing one
   testosterone therapy - so a band only means anything when the anchoring
   regimen episode names that drug. Until this gate existed the screen drew
   all eight for everyone, which told someone on testosterone alone when to
   expect their breast development to be complete, and cited the Endocrine
   Society underneath it.

   Every window here is a claim about the literature, never a target for
   anyone's own experience - the acceptance criterion this file exists to
   keep honest. Tier 2 and tier 3 effects carry no entry here at all:
   `literatureCovers`/`literatureWindow` answer "no band" for any key this
   record does not list, which is the ordinary case once the catalogue is
   open. Which tier an effect is is derived from that same
   record, by `effectTier` at the foot of this file - there is no stored
   tier anywhere, on the catalogue row or off it (ADR-0010). */

import { epochDayMonthsAgo } from './epochDay';
import { resolveHormoneDrug, type HormoneDrug } from './hormoneDrug';
import type { EffectDirection, PersonalEffectType, RegimenEpisode } from './types';

export type { EffectDirection };

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
    the release-time staleness guard reads (functional audit ticket 40). */
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

/** Whether the literature's window for `effect` is a claim about someone on
    `drug` at all - the gate on every band this file produces.

    Fails closed. `resolveHormoneDrug` answers
    null for a free-text drug this app cannot classify, for an antiandrogen
    and for progesterone alone, and null matches neither direction, so those
    episodes get no band rather than a hedged one. That is the whole point:
    without this gate someone whose only episode is testosterone was told,
    sourced on screen to the Endocrine Society, when to expect their breast
    development to be complete.

    Built on hormoneDrug.ts so the effects timeline and labs use the same
    drug names.

    Also answers false for any key with no tier-1 window at all - a tier 2
    or tier 3 effect, or a custom one - which is the ordinary case once
    the catalogue is open past twenty (ticket 41). */
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

/** What the effects timeline, its onset bands and the hair anchor count
    from. Only episodes whose class is HRT take part: until ticket 18 the
    earliest episode of any drug anchored, so an SSRI started before
    estradiol moved every band to the SSRI's start and, since sertraline
    names no literature table, took the bands away.

    - The start is `hrtStartEpochDay` when the person set one (a portable
      preference), else the earliest HRT episode's start.
    - The drug is the first HRT episode that names a hormone with a table
      (estradiol or testosterone), else the first HRT episode at all. An
      antiandrogen started a month before estradiol starts the clock, and
      estradiol's table still draws the bands.
    - The end is the last HRT episode's end once every one has ended, and
      null while any is still running. A switch from oral estradiol to gel
      is two episodes and one stretch of HRT, so the first episode's end no
      longer clips bands the second one carries on.

    Null when there is neither an HRT episode nor a date. A date with no HRT
    episode anchors with no drug: months are counted, no band is drawn.
    `episodes` must be sorted by start day, the order getEpisodes returns. */
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

/** `effect`'s onset and completion as concrete epoch-day ranges counted
    forward from `anchor` (`hrtAnchor` above) - what a screen draws its
    background bands from - or null when `anchor`'s drug is not the one this
    effect's table describes and there is no band to draw.

    All three parts of the answer come from the anchor: its start day is
    where the bands are counted from, its drug is what decides whether they
    exist, and its end day is where they stop.

    Nothing is drawn past `endEpochDay` (phase 8 features ticket 49). Every
    window here is a claim about a body on the drug the table describes, so
    it says nothing about the days after that drug stopped, and the gate
    fails closed the same way `resolveHormoneDrug`'s does rather than hedging:

    - an episode that ended before the onset could even begin gets null, not
      a band whose every day is unreachable,
    - a completion window the episode never reached is dropped rather than
      drawn with both ends in the past,
    - anything the episode ran into stops at its end day, including
      hair_changes' open end, which was only ever open for a body still on
      the hormone.

    Until this, a five-year masculinizing completion band kept drawing years
    past a stopped regimen, citing the Endocrine Society underneath it for a
    body no longer on what the table describes. */
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

/** Whether at least one tier-1 personal effect's literature onset window is
    currently active for the HRT anchor (phase 5 ticket 49, anchored on HRT
    by functional audit ticket 18).
    Shows while at least one onset window for the anchor episode's drug is
    current (from the anchor's start day through the latest onset window end
    across all covered effects, e.g. 12 months for estradiol/testosterone),
    and false once every onset window has passed or when no covered episode
    exists. */
export function isHrtOnsetWindowCurrent(
  episodes: readonly RegimenEpisode[],
  todayEpochDay: number,
  hrtStartEpochDay: number | null
): boolean {
  const anchor = hrtAnchor(episodes, hrtStartEpochDay);
  if (!anchor) return false;
  if (todayEpochDay < anchor.startEpochDay) return false;

  for (const effectKey of Object.keys(EFFECT_LITERATURE_WINDOW) as PersonalEffectType[]) {
    const days = literatureWindowDays(effectKey, anchor);
    if (!days) continue;
    if (todayEpochDay <= days.onset.end) {
      return true;
    }
  }
  return false;
}

