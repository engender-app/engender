/* Keep hidden, finished and suspended state per Archive section (ADR-0052,
   ADR-0027). Hidden changes navigation independently. Finishing and
   suspending store dates for charts and summaries. The writers clear
   one date when setting the other, so a stream can occupy only one state.
   SUSPENDABLE_AREAS names the streams that accept a pause.

   Finished and suspended records remain readable. A hub row may map
   to multiple sections and apply the same operation to each without
   changing the stored keys. These rules take the state and day as input. */

import type { ArchiveSectionName } from './journal/archiveSections';

/** One area's state. Absent from `AreaStates` is the resting state - not
    hidden, not finished - so nothing has to write a row to say nothing. */
interface AreaState {
  hidden: boolean;
  /** The day the person says this stream ended, or null while it has not. */
  finishedEpochDay: number | null;
  /** The day the person paused this stream, or null while it is active or
      finished. Mutually exclusive with `finishedEpochDay` by construction -
      see `journal/areaStates.ts`. */
  suspendedEpochDay: number | null;
}

/** Every area a person can hide, which is every area but one.

    `cycleEvents` is out, and structurally rather than by convention. Cycle
    tracking's visibility is ADR-0043's own one-directional question: a
    preference or a testosterone regimen can add the row back, and no
    preference is what hides it, because read cold an unconditional cycle row
    is a dysphoria trigger. A uniform flag defaulting to shown would delete
    both the asymmetry and the data-driven unhide, so `cycleTrackingVisible`
    stays cycle's gate and this record cannot be asked about it. */
export type HideableArea = Exclude<ArchiveSectionName, 'cycleEvents'>;

/** Every area that has said anything, sparse on purpose: a key with no entry
    has said nothing, which is the resting state and not unfinished setup.

    Keyed by `HideableArea`, so the carve-out above holds for the record and
    not only for the two questions below: `states.cycleEvents` does not
    compile, and `areaStates.ts` drops such a row on the way out rather than
    trusting that no writer produced one. An `area_state` row travels, so
    without that a foreign archive carrying `area = 'cycleEvents'` would
    reverse a one-directional rule through the back door. */
export type AreaStates = Partial<Record<HideableArea, AreaState>>;

export const AREA_STATES_BEFORE_READ: AreaStates = {};

/** The areas a person can declare finished: the original nine approved area by area by plus
    `voicePracticeTakes`, which posed as an open choice rather than a decision had already
    made - "decide with the deepening spec's in hand whether practice takes join the
    finishable set or sit behind the same row" - resolved here and worth her confirming.

    The rule they satisfy: finishing is a statement about the person's *practice of
    tracking*, so it fits an accumulating dated series they decide they are done adding to -
    and says nothing on top of a thing that already ends itself, which is what
    `NOT_FINISHABLE` below is mostly about.

    Declared as the array so the literals stay narrow: a union written by hand beside a
    widened `readonly ArchiveSectionName[]` would make `Unfinishable` collapse to `never`
    and the whole check below vacuous. */
/* FINISHABLE_AREAS stays exported for its own test, and cross-checked in
   areaGroups.test.ts (AU-09 test-only review). */
export const FINISHABLE_AREAS = [
  'hairRemovalSessions',
  'wearSessions',
  'sideEffects',
  'personalEffects',
  /* One hub row covers voice benchmarks and practice takes, so
     finishing the practice marks both sections. Sealing a take hides
     its figures for a day and leaves the ongoing practice intact.

     A sealed letter is a one-off record. A voice memo belongs to its
     entry and has no separate area to finish. */
  'voiceBenchmarks',
  'voicePracticeTakes',
  /* Dilation - the motivating case ADR-0052
     itself names: a taper tapers off, and finishing it says so is the
     normal outcome rather than a lapse. The schedule (`taper`) stays out
     below, the same reason `doseSchedules` does: it is what was meant to
     happen, and the practice that ends is the sessions. */
  'taperSessions'
] as const satisfies readonly ArchiveSectionName[];

export type FinishableArea = (typeof FINISHABLE_AREAS)[number];

/** The finishable areas that can also be paused, not done (ADR-0052 amendment). Cut from
    own answer: don't build a general `suspended` field speculatively, and let whichever
    area names a real case propose it against that need. Asked directly, two did - a
    temporary break from voice practice, and pausing electrolysis or laser for a while - and
    none of the other seven did, so they are not here. A a later change naming a case for
    one of those adds it to this list, the same way `FINISHABLE_AREAS` itself grows one area
    at a time. */
export const SUSPENDABLE_AREAS = [
  'hairRemovalSessions',
  'voiceBenchmarks',
  'voicePracticeTakes'
] as const satisfies readonly FinishableArea[];

export type SuspendableArea = (typeof SUSPENDABLE_AREAS)[number];

type Unfinishable = Exclude<ArchiveSectionName, FinishableArea>;

/** Every area that deliberately **cannot** be finished, and why - a full `Record` over
    whatever `FINISHABLE_AREAS` does not name, the shape `DAY_OPT_OUTS` uses (`day.ts`). A
    new archive section is a compile error here until somebody either declares it finishable
    or writes down why it is not, so nobody has to remember the check.

    Two families of reason, and the difference matters:

    *Practice-based.* A judgement under the area already ends per record, so an area-level
    finish on top of it says nothing new. The wording is derived from that rule rather than
    quoted from her.

    *Structural.* A fact about the schema rather than a judgement about practice - reference
    data, or content that belongs to another record. These need no product call and cannot
    drift. */
/* NOT_FINISHABLE stays exported only for its own test (AU-09 test-only
   review). */
export const NOT_FINISHABLE: Record<Unfinishable, string> = {
  /* Practice-based exclusions. */
  tryouts: 'a tryout carries its own end day, so finishing the practice says nothing the record has not already said',
  eras: 'a named span that ends when the person ends it, which is the same statement one level down',
  letters: "sealed and then unlocked is a letter's whole lifecycle, not a practice that stops",
  procedures: 'one dated event and a recovery window; the course ends when the recovery does',
  roadmapGoals: 'a goal is answered per goal and a roadmap has no last one',
  roadmapCategories: 'a category only holds goals, which are answered per goal',
  roadmapInstitutions: 'each institution is done on its own dated change, and a list of them has no last one',
  roadmapInstitutionChanges: 'a dated change at one institution, which ends when that institution is done',
  roadmapChecks: 'a tick against one bundled goal, answered per goal like the goals themselves',
  milestones: 'one dated point each, and the list of them never closes',
  progressPhotos: 'a photograph taken when the person wants one, and the next one is always possible',
  appointments: 'one dated visit each, and nobody declares themselves done seeing people',
  cycleEvents: 'gated one-directionally by ADR-0043, which a finish flag must not reverse',
  regimenEpisodes: 'an episode carries its own end day, so a course that stopped is recorded by ending it',
  doseEvents: 'each dose is an event inside an episode, and the episode is where a course ends',
  doseSchedules: 'a schedule stops when the episode it belongs to does',
  taper: 'a schedule stops when the practice recorded in taperSessions does (ticket 12)',
  dosePauses: 'a pause already carries the day it started and the day it ended',
  medicationStock: 'a running count of what is in the drawer, not a series of records to stop adding to',
  labResults: 'results arrive from outside on whatever schedule the prescription needs, so there is no practice of the person’s to declare done',
  reminders: 'an intention for a future day, switched off one reminder at a time',
  checklists: 'a list is answered and done with per list, which is the same statement one level down',
  // ADR-0065: paper keeps arriving. There is no
  // state in which somebody is done being sent opinions, referrals and
  // rulings, so an area-level finish here would be a statement nobody is in
  // a position to make.
  documents: 'paper keeps arriving, so there is no day somebody is done receiving it',

  /* Structural exclusions. */
  entries: 'the journal itself, not a stream inside it',
  feltSenseEntries: 'content belonging to a tryout, not a series of its own',
  marginNotes: 'content belonging to an entry, not a series of its own (phase 8 features ticket 07)',
  providers: 'notes on the people appointments are with, not a series of its own (functional-audit ticket 27)',
  eraMutes: 'presence naming a muted era, which is the era’s own state and not a series',
  comfortItems: 'a standing list with no dates in it at all',
  importLog: 'this device’s bookkeeping about where an import came from',
  deletions: 'this device’s record of what was deleted, for an archive Merge to carry',
  areaStates: 'the record of which areas are finished, which cannot itself be one of them',
  dimensions: 'reference data, not a series (CONTEXT: "Reference data")',
  presets: 'reference data, not a series (CONTEXT: "Reference data")',
  tagGroups: 'reference data, not a series (CONTEXT: "Reference data")',
  bodyRegions: 'reference data, not a series (CONTEXT: "Reference data")',
  progressPoses: 'reference data, not a series (CONTEXT: "Reference data")',
  presentations: 'reference data, not a series (CONTEXT: "Reference data")',
  effectCategories: 'reference data, not a series (CONTEXT: "Reference data")',
  personalEffectTypes: 'reference data, not a series (CONTEXT: "Reference data")'
};

/** Whether an area is out of the navigation. Nothing here hides data: a
    hidden area keeps its records, its direct URL and its place in search,
    the same as ADR-0043's own hiding does.

    Takes no day, unlike `areaQuiet` below - hiding an area is not a dated
    statement, and finishing one does not hide it. */
/* areaHidden stays exported for its own test, and cross-checked in
   areaStates.test.ts (AU-09 test-only review). */
export function areaHidden(area: HideableArea, states: AreaStates): boolean {
  return states[area]?.hidden === true;
}

/** Whether an area's fields, taken alone, would leave it in the resting
    state - the same test the storage layer runs to know when to drop a row
    (`journal/areaStates.ts`). Here so both sides read one function rather
    than two copies of "hidden = 0 and both days are null" agreeing by luck. */
/* areaStateResting stays exported only for its own test (AU-09 test-only
   review). */
export function areaStateResting(state: Pick<AreaState, 'hidden' | 'finishedEpochDay' | 'suspendedEpochDay'>): boolean {
  return !state.hidden && state.finishedEpochDay === null && state.suspendedEpochDay === null;
}

/**
 * Hide a surface only if it fronts at least one area and all those areas are hidden. `cycleEvents` is outside `HideableArea`, so a surface for it alone stays visible (ADR-0043). `hubRows.ts` uses this rule so a hub row and the screen it opens agree.
 */
export function areasHidden(areas: readonly ArchiveSectionName[], states: AreaStates): boolean {
  if (areas.length === 0) return false;
  return areas.every((area) => area !== 'cycleEvents' && areaHidden(area, states));
}

/**
 * An area is quiet when hidden, finished, or suspended as of today. Prompts and tiles share this check. Per-surface `*Enabled` preferences still govern active areas. Quiet hours separately apply to all areas for part of the day.
 *
 * Compare stored finish and suspend days at read time so a future date leaves the area active until then (ADR-0049).
 */
export function areaQuiet(area: HideableArea, states: AreaStates, todayEpochDay: number): boolean {
  const state = states[area];
  if (!state) return false;
  return (
    state.hidden ||
    (state.finishedEpochDay !== null && state.finishedEpochDay <= todayEpochDay) ||
    (state.suspendedEpochDay !== null && state.suspendedEpochDay <= todayEpochDay)
  );
}
