/* Whether an area is hidden, whether the person has said it is finished, and
   whether they have paused it for now (ADR-0052, CONTEXT: "Finished").

   Nothing in the app modelled an area ending. Dilation tapers off, the last
   electrolysis session is the last one, a name change happens once - and the
   app's only word for "I am no longer doing this" was stopping, which it
   renders as absence, which every living tracker reads as a lapse. Three
   separate things are recorded here instead, per area:

     hidden            take this out of the navigation, the way a tag or a
                       measurement type is hidden - CONTEXT.md's own word
     finishedEpochDay  the day the person says the stream ended, kept as a
                       date rather than a flag so `chartAnnotations.ts` can
                       draw it beside a regimen change and a clinician
                       summary can say when a stream stopped
     suspendedEpochDay the day the person paused the stream, intending to
                       come back - phase 8 features ticket 51, cut from
                       ticket 44's finding that hormone tracking (ticket 44's
                       own motivating case) is not this, but voice practice
                       and hair removal are. Same shape as finishedEpochDay
                       and the same reason: a chart can draw the day the
                       pause started, and a clinician summary can say so

   Hidden is independent of the other two. Suspended and finished are not: a
   stream is active, suspended or finished, never two of those at once -
   `journal/areaStates.ts`'s writers enforce it by clearing whichever of the
   two the other one is setting. Only `hairRemovalSessions`, `voiceBenchmarks`
   and `voicePracticeTakes` can carry a suspended day today
   (`SUSPENDABLE_AREAS` below); the other six finishable areas named no case
   for it when asked (ticket 51), and stay as they were. A finished area is
   not hidden by finishing: the whole point is that a stream you are done
   with is still readable. Neither deletes anything.

   The key space is `ArchiveSectionName` and not the More hub's rows
   (ADR-0027). An archive section is already the canonical answer to "does
   this area exist", it is already the space two other registries do
   exhaustiveness against (`day.ts`, `textSearch.ts`), and it is a wire key,
   so it cannot be renamed casually - a hub row can be regrouped or renamed
   this afternoon without a stored key changing meaning underneath it. Where
   one hub row fronts two sections - hair progress is `hairStages` plus
   `hairPhotos` - the row finishes both together and the one-to-many mapping
   is presentation, living with the hub.

   Rune-free and driver-free, like `cycleTracking.ts` next door and for the
   same reason: both functions take the state and the day as arguments, so
   every surface that asks gets the same answer and the Node tier can test
   the rule with no driver at all. */

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

/** The areas a person can declare finished: the original nine approved area
    by area by Alicja on 2026-09-03, plus `voicePracticeTakes` (phase 8
    features ticket 10), which that ticket posed as an open choice rather
    than a decision Alicja had already made - "decide with the deepening
    spec's ticket 13 in hand whether practice takes join the finishable set
    or sit behind the same row" - resolved here and worth her confirming.

    The rule they satisfy: finishing is a statement about the person's
    *practice of tracking*, so it fits an accumulating dated series they
    decide they are done adding to - and says nothing on top of a thing that
    already ends itself, which is what `NOT_FINISHABLE` below is mostly
    about.

    Declared as the array so the literals stay narrow: a union written by
    hand beside a widened `readonly ArchiveSectionName[]` would make
    `Unfinishable` collapse to `never` and the whole check below vacuous. */
export const FINISHABLE_AREAS = [
  'hairRemovalSessions',
  'measurements',
  'sizeRecords',
  'wearSessions',
  'sideEffects',
  'personalEffects',
  /* Two sections, one hub row: hair progress is the stagings and the
     photographs together, and finishing that practice finishes both. */
  'hairStages',
  'hairPhotos',
  /* Two sections, one hub row, the same shape hairStages/hairPhotos give:
     a benchmark and a practice take are both dated records of the same
     ongoing practice of tracking a voice, so declaring that practice done
     finishes both together (phase 8 features ticket 10).

     This is a different question from why a letter stays out below, and
     answering it is not "how letter-like is the seal" - a practice take
     reuses that mechanic outright (sealedUntil.ts). It is whether there is
     a *practice* left over once one sealed record opens. A letter has none:
     writing it, sealing it and it later being read is the whole transaction,
     and nothing about "have you written enough letters" is a question this
     app asks. A practice take's seal only withholds one take's own figures
     for a day - the practice of taking them is what keeps going the way any
     other measurement does, which is what makes "done practising" a real
     statement to make about it. Its own opt-out from day.ts and
     lastWrite.ts is about the seal alone and says nothing about this
     question - see the comment there.

     A voice memo belongs to an entry and travels inside `entries`, so the
     memos are entry content rather than a series of their own and there is
     nothing else here to name. */
  'voiceBenchmarks',
  'voicePracticeTakes',
  /* Dilation (phase 8 features ticket 12) - the motivating case ADR-0052
     itself names: a taper tapers off, and finishing it says so is the
     normal outcome rather than a lapse. The schedule (`taper`) stays out
     below, the same reason `doseSchedules` does: it is what was meant to
     happen, and the practice that ends is the sessions. */
  'taperSessions'
] as const satisfies readonly ArchiveSectionName[];

export type FinishableArea = (typeof FINISHABLE_AREAS)[number];

/** The finishable areas that can also be paused, not done (phase 8 features
    ticket 51, ADR-0052 amendment). Cut from ticket 44's own answer: don't
    build a general `suspended` field speculatively, and let whichever area
    names a real case propose it against that need. Asked directly, two did -
    a temporary break from voice practice, and pausing electrolysis or laser
    for a while - and none of the other seven did, so they are not here. A
    later ticket naming a case for one of those adds it to this list, the same
    way `FINISHABLE_AREAS` itself grows one area at a time. */
export const SUSPENDABLE_AREAS = [
  'hairRemovalSessions',
  'voiceBenchmarks',
  'voicePracticeTakes'
] as const satisfies readonly FinishableArea[];

export type SuspendableArea = (typeof SUSPENDABLE_AREAS)[number];

type Unfinishable = Exclude<ArchiveSectionName, FinishableArea>;

/** Every area that deliberately **cannot** be finished, and why - a full
    `Record` over whatever `FINISHABLE_AREAS` does not name, the shape
    `DAY_OPT_OUTS` uses (`day.ts`). A new archive section is a compile error
    here until somebody either declares it finishable or writes down why it
    is not, so nobody has to remember the check.

    Two families of reason, and the difference matters:

    *Practice-based.* A judgement under Alicja's rule: the area already ends
    per record, so an area-level finish on top of it says nothing new. The
    wording is derived from that rule rather than quoted from her.

    *Structural.* A fact about the schema rather than a judgement about
    practice - reference data, or content that belongs to another record.
    These need no product call and cannot drift. */
export const NOT_FINISHABLE: Record<Unfinishable, string> = {
  /* Practice-based exclusions. */
  tryouts: 'a tryout carries its own end day, so finishing the practice says nothing the record has not already said',
  eras: 'a named span that ends when the person ends it, which is the same statement one level down',
  letters: "sealed and then unlocked is a letter's whole lifecycle, not a practice that stops",
  procedures: 'one dated event and a recovery window; the course ends when the recovery does',
  roadmapGoals: 'a goal is answered per goal and a roadmap has no last one',
  roadmapChecks: 'a tick against one bundled goal, answered per goal like the goals themselves',
  roadmapTracks: 'saying a track is not your path is already the roadmap\'s own way of putting one away',
  milestones: 'one dated point each, and the list of them never closes',
  appointments: 'one dated visit each, and nobody declares themselves done seeing people',
  tallyEvents: 'one dated point each, and the list of them never closes',
  counterevidenceSnapshots:
    'a crisis surface, not a tracked series - being done needing it is not a thing to record',
  cycleEvents: 'gated one-directionally by ADR-0043, which a finish flag must not reverse',
  journalingPauses: 'a break already carries the day it started and the day it ended',
  regimenEpisodes: 'an episode carries its own end day, so a course that stopped is recorded by ending it',
  doseEvents: 'each dose is an event inside an episode, and the episode is where a course ends',
  doseSchedules: 'a schedule stops when the episode it belongs to does',
  taper: 'a schedule stops when the practice recorded in taperSessions does (ticket 12)',
  dosePauses: 'a pause already carries the day it started and the day it ended',
  medicationStock: 'a running count of what is in the drawer, not a series of records to stop adding to',
  labResults: 'results arrive from outside on whatever schedule the prescription needs, so there is no practice of the person’s to declare done',
  reminders: 'an intention for a future day, switched off one reminder at a time',
  checklists: 'a list is answered and done with per list, which is the same statement one level down',
  // Phase 8 features ticket 52, ADR-0065: paper keeps arriving. There is no
  // state in which somebody is done being sent opinions, referrals and
  // rulings, so an area-level finish here would be a statement nobody is in
  // a position to make.
  documents: 'paper keeps arriving, so there is no day somebody is done receiving it',

  /* Structural exclusions. */
  entries: 'the journal itself, not a stream inside it',
  feltSenseEntries: 'content belonging to a tryout or a milestone, not a series of its own',
  marginNotes: 'content belonging to an entry, not a series of its own (phase 8 features ticket 07)',
  eraMutes: 'presence naming a muted era, which is the era’s own state and not a series',
  comfortItems: 'a standing list with no dates in it at all',
  importLog: 'this device’s bookkeeping about where an import came from',
  areaStates: 'the record of which areas are finished, which cannot itself be one of them',
  savedQuestions: 'a saved shortcut into search, not a practice that runs and can stop',
  revisits: "sealed and then met on its target day is a revisit's whole lifecycle, not a practice that stops",
  dimensions: 'reference data, not a series (CONTEXT: "Reference data")',
  presets: 'reference data, not a series (CONTEXT: "Reference data")',
  tagGroups: 'reference data, not a series (CONTEXT: "Reference data")',
  affirmations: 'reference data, not a series (CONTEXT: "Reference data")',
  bodyRegions: 'reference data, not a series (CONTEXT: "Reference data")',
  presentations: 'reference data, not a series (CONTEXT: "Reference data")',
  entryTemplates: 'reference data, not a series (CONTEXT: "Reference data")',
  measurementTypes: 'reference data, not a series (CONTEXT: "Reference data")',
  effectCategories: 'reference data, not a series (CONTEXT: "Reference data")',
  personalEffectTypes: 'reference data, not a series (CONTEXT: "Reference data")',
  wordIgnore: 'reference data, not a series (CONTEXT: "Reference data")'
};

/** Whether an area is out of the navigation. Nothing here hides data: a
    hidden area keeps its records, its direct URL and its place in search,
    the same as ADR-0043's own hiding does.

    Takes no day, unlike `areaQuiet` below - hiding an area is not a dated
    statement, and finishing one does not hide it. */
export function areaHidden(area: HideableArea, states: AreaStates): boolean {
  return states[area]?.hidden === true;
}

/** Whether an area's fields, taken alone, would leave it in the resting
    state - the same test the storage layer runs to know when to drop a row
    (`journal/areaStates.ts`). Here so both sides read one function rather
    than two copies of "hidden = 0 and both days are null" agreeing by luck. */
export function areaStateResting(state: Pick<AreaState, 'hidden' | 'finishedEpochDay' | 'suspendedEpochDay'>): boolean {
  return !state.hidden && state.finishedEpochDay === null && state.suspendedEpochDay === null;
}

/** Whether a surface fronting these areas has gone with them.

    Every one of them has to be hidden, and there has to be at least one: a
    surface fronting no area is a screen rather than an area and nothing
    hides it, and one whose other half is still shown has something left to
    show. `cycleEvents` is outside `HideableArea` (ADR-0043), so a surface
    fronting only it can never go this way - the asymmetry the ADR asks for,
    expressed rather than special-cased.

    Here rather than in either caller because both surfaces that front areas
    ask it: the More hub's rows (`hubRows.ts`) and the stats tab's cards
    (`statsAreas.ts`), which used to answer it per card off a single named
    area and so could disagree with the row it sits behind. */
export function areasHidden(areas: readonly ArchiveSectionName[], states: AreaStates): boolean {
  if (areas.length === 0) return false;
  return areas.every((area) => area !== 'cycleEvents' && areaHidden(area, states));
}

/** Whether an area should stop talking: hidden, finished, or suspended, any
    of them on or before today. The one question the prompt-and-tile cascade
    asks, so a hidden, finished or suspended area silences prompts and tiles
    the same way while the per-surface `*Enabled` preferences keep governing
    the areas that are on.

    Nothing to do with quiet hours (`unprompted/quietHours.ts`), which is a
    window in the day and applies to every area at once. The name is the one
    the features spec asked for; the two never appear in the same read, and
    an area that is quiet here is quiet at every hour.

    A finish or suspend day is compared against today rather than trusted as
    a flag for the reason ADR-0049 clamps an open bound at read time: the
    stored fact is the day the person named, and what follows from it on any
    given day is read, never stored. This ships the question; the cascade
    that consumes it is the features spec's, and nothing here silences
    anything by itself. */
export function areaQuiet(area: HideableArea, states: AreaStates, todayEpochDay: number): boolean {
  const state = states[area];
  if (!state) return false;
  return (
    state.hidden ||
    (state.finishedEpochDay !== null && state.finishedEpochDay <= todayEpochDay) ||
    (state.suspendedEpochDay !== null && state.suspendedEpochDay <= todayEpochDay)
  );
}
