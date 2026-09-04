/* What a person finishes, as opposed to what the journal stores it against
   (phase 8 features ticket 04, ADR-0052).

   `areaState.ts` keys the record by `ArchiveSectionName`, because that is
   what is compile-checkable and wire-stable. Nobody meets an archive section.
   What somebody meets is a screen - the hair progress screen, the size log -
   and hair progress is two sections, `hairStages` and `hairPhotos`, which
   finish together in one transaction or not at all.

   ADR-0052 calls that one-to-many mapping presentation and says it lives with
   the hub. It is here rather than in `more/+page.svelte` because four things
   now need it and none of them is the hub: the control on each area's own
   screen, the mark a finished area draws on a chart, the line in the clinician
   summary, and the offer. Written once and checked, rather than eight screens
   each naming their own sections and a ninth quietly disagreeing.

   This is not a second list of areas. `FINISHABLE_AREAS` remains the list;
   `EveryFinishableAreaGrouped` below refuses to compile until whatever is
   added there is grouped here, and areaGroups.test.ts refuses a section
   grouped twice.

   Node-tier safe: no clock, no driver, no paraglide. A group's own name is
   `vocabulary/areaLabels.ts`'s, the same split `day.ts` keeps from
   `vocabulary/dayLabels.ts`. */

import { areaQuiet, type AreaStates, type FinishableArea } from './areaState';

/** One finishable thing, as a person addresses it. Named after the More hub's
    own row keys, because that is what the screens behind them are called. */
export type AreaGroupKey =
  | 'measurements'
  | 'sizes'
  | 'wear'
  | 'hair-progress'
  | 'hair-removal'
  | 'side-effects'
  | 'effects'
  | 'voice'
  | 'dilation';

/** Which areas each group finishes, together.

    Six of the eight front exactly one area. Hair progress fronts two, and so
    does voice now (phase 8 features ticket 10): a benchmark and a practice
    take are both dated records of the same practice, so `voice` finishes
    them together the way hair progress finishes its stagings and its
    photographs. A voice memo belongs to an entry and travels inside
    `entries` (CONTEXT: "Area"), so the memos screen is not finishable and
    has no group here. */
export const AREA_GROUPS = {
  measurements: ['measurements'],
  sizes: ['sizeRecords'],
  wear: ['wearSessions'],
  'hair-progress': ['hairStages', 'hairPhotos'],
  'hair-removal': ['hairRemovalSessions'],
  'side-effects': ['sideEffects'],
  effects: ['personalEffects'],
  voice: ['voiceBenchmarks', 'voicePracticeTakes'],
  dilation: ['taperSessions']
} as const satisfies Record<AreaGroupKey, readonly FinishableArea[]>;

/* A finishable area with no group would be one nothing on screen could ever
   finish, silently. This line makes that a compile error instead -
   demonstrated by deleting the `sizes` entry above and watching `Ungrouped`
   stop being `never`. The other direction is covered by the `satisfies`,
   which refuses a group naming something `FINISHABLE_AREAS` does not hold. */
type Grouped = (typeof AREA_GROUPS)[AreaGroupKey][number];
type Ungrouped = Exclude<FinishableArea, Grouped>;
type AssertNoneUngrouped<Missing extends never> = Missing;
export type EveryFinishableAreaGrouped = AssertNoneUngrouped<Ungrouped>;

/** `AreaGroupKey` as a value, read off `AREA_GROUPS` rather than typed out a
    second time. */
export const AREA_GROUP_KEYS = Object.keys(AREA_GROUPS) as readonly AreaGroupKey[];

/** The day a group finished, or null while it has not.

    Every one of its areas has to carry a day, because a group half-finished
    is a state no screen has a way to show - one call finishes them together,
    so it is not reachable through the app and reads as not finished if an
    archive ever brings one in. Where two disagree, which the same rule makes
    unreachable too, the later day wins: the practice was still being added to
    until the last of them stopped. */
export function groupFinishedOn(key: AreaGroupKey, states: AreaStates): number | null {
  let latest: number | null = null;
  for (const area of AREA_GROUPS[key]) {
    const day = states[area]?.finishedEpochDay ?? null;
    if (day === null) return null;
    if (latest === null || day > latest) latest = day;
  }
  return latest;
}

/** Every group the person has finished, oldest first. What the clinician
    summary prints and what a chart draws a mark for. */
export function finishedGroups(states: AreaStates): { key: AreaGroupKey; epochDay: number }[] {
  const found: { key: AreaGroupKey; epochDay: number }[] = [];
  for (const key of AREA_GROUP_KEYS) {
    const epochDay = groupFinishedOn(key, states);
    if (epochDay !== null) found.push({ key, epochDay });
  }
  return found.sort((a, b) => a.epochDay - b.epochDay);
}

/** The most recent write across some set of areas, or null where nothing has
    ever been written in any of them (`journal/lastWrite.ts`).

    The latest rather than the earliest, and a section with nothing in it is
    passed over rather than answering null for the whole set: somebody can log
    hair stages for two years and never take a photograph, and an empty half
    is not a quiet half.

    Generic over the key rather than pinned to `FinishableArea`, because the
    other caller is the More hub, which asks the same question about rows that
    front sections no finishable group covers (`hubRows.ts`). One shape, two
    callers, rather than the same loop and the same reasoning written twice. */
export function latestWrite<Key extends string>(
  areas: readonly Key[],
  lastWrites: Partial<Record<Key, number | null>>
): number | null {
  let latest: number | null = null;
  for (const area of areas) {
    const day = lastWrites[area] ?? null;
    if (day !== null && (latest === null || day > latest)) latest = day;
  }
  return latest;
}

/** The most recent write anywhere in a group. */
export function groupLastWrite(
  key: AreaGroupKey,
  lastWrites: Partial<Record<FinishableArea, number | null>>
): number | null {
  return latestWrite(AREA_GROUPS[key], lastWrites);
}

/** How long an area has to go unwritten before the app asks about it once.

    Half a year. The number itself is a judgement rather than a measurement:
    the one cadence the tree actually pins is the measurements nudge's, which
    speaks up after 30 days (`liveTiles.ts`), and 180 is six times that. The
    rest is plausibility - electrolysis runs on a four-to-six-week course, a
    wear session is a most-weeks thing, a benchmark happens when somebody
    remembers - so what the window buys is that no ordinary gap and no hard
    season comes near it.

    What actually keeps this from being a nag is structural, and it is not
    the number. The offer is made on the area's own screen, which somebody
    reached on purpose, never on Home and never as a notification; and a no
    is kept forever, so the question is asked at most once per area for the
    life of the journal. If the number turns out to be wrong, it is wrong by
    asking a little early or a little late, once. */
export const FINISH_SUGGESTION_QUIET_DAYS = 180;

export interface FinishOfferInput {
  states: AreaStates;
  /** From `journal/lastWrite.ts`, which is where the fact lives. */
  lastWrites: Partial<Record<FinishableArea, number | null>>;
  /** The areas already answered no, kept in `areaFinishOfferDeclined` as
      section names rather than as group keys (ADR-0052: a stored key must
      not be a hub row). `readonly string[]` because that is the preference's
      own type, and a value this build does not recognise simply matches no
      section. */
  declined: readonly string[];
  todayEpochDay: number;
}

/** Whether the person has already said no about this group.

    True when **any** of its sections carries the no, not all of them. A
    decline writes every section at once so the two agree today; they can only
    disagree if a later build regroups the rows, and there the safe reading is
    that an area somebody said no about stays said-no-about. Re-asking is the
    failure this whole preference exists to prevent, and a group reading as
    un-declined because it grew a new section would be exactly that. */
export function groupDeclined(key: AreaGroupKey, declined: readonly string[]): boolean {
  return AREA_GROUPS[key].some((area) => declined.includes(area));
}

/** Whether this group's screen should offer to mark it finished (ADR-0045:
    an automatic trigger asks, and the confirmation is what writes).

    Four things have to be true, and the first two are the ones that keep it
    honest. The person has not already said no. The area is not already quiet,
    which covers both a finished group and a hidden one, so an area that has
    gone silent for the app does not go on asking about itself. Then: there is
    something in it to have stopped, and the last of it is a whole window
    back. */
export function shouldOfferFinish(key: AreaGroupKey, input: FinishOfferInput): boolean {
  if (groupDeclined(key, input.declined)) return false;
  if (AREA_GROUPS[key].some((area) => areaQuiet(area, input.states, input.todayEpochDay))) return false;

  const lastWrite = groupLastWrite(key, input.lastWrites);
  if (lastWrite === null) return false;
  return input.todayEpochDay - lastWrite >= FINISH_SUGGESTION_QUIET_DAYS;
}
