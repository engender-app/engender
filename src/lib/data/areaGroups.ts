/* Map finishable archive sections to the areas people see (ADR-0052).
   Grouped sections, such as Voice benchmarks and practice takes,
   finish together in one transaction.

   `FINISHABLE_AREAS` is the source of truth. The type check requires
   every finishable section to be grouped, and areaGroups.test.ts
   rejects duplicates. Keep the mapping free of clocks, drivers and
   Paraglide. Localized names live in `vocabulary/areaLabels.ts`. */

import { areaQuiet, type AreaStates, type FinishableArea, type SuspendableArea, SUSPENDABLE_AREAS } from './areaState';

/** One finishable thing, as a person addresses it. Named after the More hub's
    own row keys, because that is what the screens behind them are called. */
export type AreaGroupKey =
  | 'wear'
  | 'hair-removal'
  | 'effects'
  | 'voice'
  | 'dilation';

/** Which areas each group finishes, together.

    Most of them front exactly one area. Voice fronts two: a benchmark and a practice take are both dated records of
    the same practice, so `voice` finishes them together. A voice memo belongs to an entry and travels inside
    `entries` (CONTEXT: "Area"), so the memos screen is not finishable and
    has no group here.

    `effects` is the fourth, from phase 11 all-four-doors ticket 13: a side
    effect and a change you were hoping for both landed on one screen and one
    axis, and the group followed the screen -
    `personalEffects` and `sideEffects` finish together now, and the old
    `side-effects` group is gone rather than renamed, for the reason `sizes`
    was: `areaState.ts` keys what is finished by `sideEffects`, the archive
    section, so nothing already finished is disturbed by the screen above it
    merging. */
export const AREA_GROUPS = {
  wear: ['wearSessions'],
  'hair-removal': ['hairRemovalSessions'],
  effects: ['personalEffects', 'sideEffects'],
  voice: ['voiceBenchmarks', 'voicePracticeTakes'],
  dilation: ['taperSessions']
} as const satisfies Record<AreaGroupKey, readonly FinishableArea[]>;

/* A finishable area with no group would be one nothing on screen could ever
   finish, silently. This line makes that a compile error instead -
   demonstrated by deleting the `wear` entry above and watching `Ungrouped`
   stop being `never`. The other direction is covered by the `satisfies`,
   which refuses a group naming something `FINISHABLE_AREAS` does not hold. */
type Grouped = (typeof AREA_GROUPS)[AreaGroupKey][number];
type Ungrouped = Exclude<FinishableArea, Grouped>;
type AssertNoneUngrouped<Missing extends never> = Missing;
type EveryFinishableAreaGrouped = AssertNoneUngrouped<Ungrouped>;

/** `AreaGroupKey` as a value, read off `AREA_GROUPS` rather than typed out a
    second time. */
/* AREA_GROUP_KEYS stays exported for its own test, and cross-checked in
   AreaFinish.mounted.test.ts, hubRows.test.ts (AU-09 test-only review). */
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

/** The groups whose areas are all suspendable.
    Derived from `SUSPENDABLE_AREAS` rather than typed out a second time - the
    same reason this file's own header exists: one list, checked, instead of
    a screen and a rule quietly disagreeing about which groups these are. */
/* SUSPENDABLE_GROUPS stays exported only for its own test (AU-09 test-only
   review). */
export const SUSPENDABLE_GROUPS = AREA_GROUP_KEYS.filter((key) =>
  AREA_GROUPS[key].every((area): area is SuspendableArea => (SUSPENDABLE_AREAS as readonly string[]).includes(area))
);

/** A group's areas, typed as suspendable, or null where the group is not one
    of `SUSPENDABLE_GROUPS`. The one cast this file needs sits here, so a
    caller asking whether a group can be suspended reads a typed answer
    rather than reaching for `AREA_GROUPS[group] as SuspendableArea[]` itself
    and trusting it was asked only where that holds. */
export function suspendableAreasOf(key: AreaGroupKey): readonly SuspendableArea[] | null {
  return (SUSPENDABLE_GROUPS as readonly AreaGroupKey[]).includes(key)
    ? (AREA_GROUPS[key] as readonly SuspendableArea[])
    : null;
}

/** The day a group was paused, or null while it has not been - the same rule
    `groupFinishedOn` states, read off `suspendedEpochDay` instead. Suspended
    and finished are mutually exclusive per area (areaState.ts), so a group
    reads as suspended and as finished at once only if an inconsistent row
    somehow arrived from outside this build's own writers - unreachable
    through the app, same as a half-finished group is. */
export function groupSuspendedOn(key: AreaGroupKey, states: AreaStates): number | null {
  let latest: number | null = null;
  for (const area of AREA_GROUPS[key]) {
    const day = states[area]?.suspendedEpochDay ?? null;
    if (day === null) return null;
    if (latest === null || day > latest) latest = day;
  }
  return latest;
}

/** Every group the person has paused, oldest first - `finishedGroups`'s own
    shape, for the two consumers that draw a finished mark and need a paused
    one too (chartAnnotations.ts). Only ever non-empty for `SUSPENDABLE_GROUPS`
    in this build, but reads generically over every group for the same reason
    `groupFinishedOn` does: the areas a caller cannot suspend simply never
    carry a day here. */
export function suspendedGroups(states: AreaStates): { key: AreaGroupKey; epochDay: number }[] {
  const found: { key: AreaGroupKey; epochDay: number }[] = [];
  for (const key of AREA_GROUP_KEYS) {
    const epochDay = groupSuspendedOn(key, states);
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

/** Offer to finish an area after 180 days without a write, six times
    the Voice benchmark nudge interval. This is a conservative threshold
    for normal gaps. Offer only on the area's screen, never on Home or
    by notification. A decline lasts for the life of the journal. */
export const FINISH_SUGGESTION_QUIET_DAYS = 180;

interface FinishOfferInput {
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
/* groupDeclined stays exported only for its own test (AU-09 test-only review). */
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
