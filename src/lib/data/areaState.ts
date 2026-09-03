/* Whether an area is hidden, and whether the person has said it is finished
   (ADR-0052, CONTEXT: "Finished").

   Nothing in the app modelled an area ending. Dilation tapers off, the last
   electrolysis session is the last one, a name change happens once - and the
   app's only word for "I am no longer doing this" was stopping, which it
   renders as absence, which every living tracker reads as a lapse. Two
   separate things are recorded here instead, per area:

     hidden            take this out of the navigation, the way a tag or a
                       measurement type is hidden - CONTEXT.md's own word
     finishedEpochDay  the day the person says the stream ended, kept as a
                       date rather than a flag so `chartAnnotations.ts` can
                       draw it beside a regimen change and a clinician
                       summary can say when a stream stopped

   They are independent. A finished area is not hidden by finishing: the
   whole point is that a stream you are done with is still readable. Neither
   deletes anything.

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
export interface AreaState {
  hidden: boolean;
  /** The day the person says this stream ended, or null while it has not. */
  finishedEpochDay: number | null;
}

/** Every area that has said anything, sparse on purpose: a key with no entry
    has said nothing, which is the resting state and not unfinished setup. */
export type AreaStates = Partial<Record<ArchiveSectionName, AreaState>>;

/** The areas a person can declare finished, approved area by area by Alicja
    on 2026-09-03 and resolved to section keys here.

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
  /* The only voice section there is (`payload.ts`). A voice memo belongs to
     an entry and travels inside `entries`, so the memos are entry content
     rather than a series of their own and there is nothing else here to
     name. */
  'voiceBenchmarks'
] as const satisfies readonly ArchiveSectionName[];

export type FinishableArea = (typeof FINISHABLE_AREAS)[number];

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
  milestones: 'one dated point each, and the list of them never closes',
  tallyEvents: 'one dated point each, and the list of them never closes',
  counterevidenceSnapshots:
    'a crisis surface, not a tracked series - being done needing it is not a thing to record',
  cycleEvents: 'gated one-directionally by ADR-0043, which a finish flag must not reverse',
  journalingPauses: 'a break already carries the day it started and the day it ended',
  regimenEpisodes: 'an episode carries its own end day, so a course that stopped is recorded by ending it',
  doseEvents: 'each dose is an event inside an episode, and the episode is where a course ends',
  doseSchedules: 'a schedule stops when the episode it belongs to does',
  dosePauses: 'a pause already carries the day it started and the day it ended',
  medicationStock: 'a running count of what is in the drawer, not a series of records to stop adding to',
  labResults: 'results arrive from outside on whatever schedule the prescription needs, so there is no practice of the person’s to declare done',
  reminders: 'an intention for a future day, switched off one reminder at a time',
  checklists: 'a list is answered and done with per list, which is the same statement one level down',

  /* Structural exclusions. */
  entries: 'the journal itself, not a stream inside it',
  feltSenseEntries: 'content belonging to a tryout or a milestone, not a series of its own',
  comfortItems: 'a standing list with no dates in it at all',
  importLog: 'this device’s bookkeeping about where an import came from',
  areaStates: 'the record of which areas are finished, which cannot itself be one of them',
  dimensions: 'reference data, not a series (CONTEXT.md:20)',
  presets: 'reference data, not a series (CONTEXT.md:20)',
  tagGroups: 'reference data, not a series (CONTEXT.md:20)',
  affirmations: 'reference data, not a series (CONTEXT.md:20)',
  bodyRegions: 'reference data, not a series (CONTEXT.md:20)',
  presentations: 'reference data, not a series (CONTEXT.md:20)',
  entryTemplates: 'reference data, not a series (CONTEXT.md:20)',
  measurementTypes: 'reference data, not a series (CONTEXT.md:20)',
  effectCategories: 'reference data, not a series (CONTEXT.md:20)',
  personalEffectTypes: 'reference data, not a series (CONTEXT.md:20)'
};

/** Every area a person can hide, which is every area but one.

    `cycleEvents` is out, and structurally rather than by convention. Cycle
    tracking's visibility is ADR-0043's own one-directional question - a
    preference or a testosterone regimen can add the row back, and no
    preference is what hides it, because read cold an unconditional cycle row
    is a dysphoria trigger. A uniform flag defaulting to shown would delete
    both the asymmetry and the data-driven unhide, so `cycleTrackingVisible`
    stays cycle's gate and this one cannot be asked about it. */
export type HideableArea = Exclude<ArchiveSectionName, 'cycleEvents'>;

/** Whether an area is out of the navigation. Nothing here hides data: a
    hidden area keeps its records, its direct URL and its place in search,
    the same as ADR-0043's own hiding does.

    Takes no day, unlike `areaQuiet` below - hiding an area is not a dated
    statement, and finishing one does not hide it. */
export function areaHidden(area: HideableArea, states: AreaStates): boolean {
  return states[area]?.hidden === true;
}

/** Whether an area should stop talking: hidden, or finished on or before
    today. The one question the prompt-and-tile cascade asks, so a hidden
    area and a finished one silence prompts and tiles the same way while the
    per-surface `*Enabled` preferences keep governing the areas that are on.

    A finish day is compared against today rather than trusted as a flag for
    the reason ADR-0049 clamps an open bound at read time: the stored fact is
    the day the person named, and what follows from it on any given day is
    read, never stored. This ships the question; the cascade that consumes it
    is the features spec's, and nothing here silences anything by itself. */
export function areaQuiet(area: HideableArea, states: AreaStates, todayEpochDay: number): boolean {
  const state = states[area];
  if (!state) return false;
  return state.hidden || (state.finishedEpochDay !== null && state.finishedEpochDay <= todayEpochDay);
}
