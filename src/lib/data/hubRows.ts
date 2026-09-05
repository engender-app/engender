/* What the More hub is, and what each of its rows says (phase 8 UX ticket 02,
   ADR-0036, ADR-0052, ADR-0043, ADR-0027).

   The hub was twenty-six rows of a title and an icon, in four groups, written
   inline in `more/+page.svelte`. One row was different: `/care` earned its tap
   by opening on the regimen, the last dose, the next expected slot, the last
   lab draw and the run-out day, each a live read of the module that owns it.
   The other twenty-five said nothing about what was behind them.

   So every row now says something, and what it can say is declared here
   rather than decided at the call site. `line` is whether the row reports a
   reading at all:

     read      the row reports its own areas' last write, out of the one
               assembled read `journal/lastWrite.ts` answers with. Thirteen
               rows, not the eighteen the ticket counted: a row can only
               report a last write where the registry has one, and seven of
               the rows it counted front an area that opted out of that
               registry on purpose - a sealed letter, a span, a schedule,
               reference data.
     written   the row never reports a reading, so what it says is a line
               about what is behind it.

   A reading row with nothing written yet says the same line a `written` row
   does. The spec's own user story 13 is what settles that - "I want **each**
   row to tell me what is behind it, so that navigating is also reading" - and
   it is the DIRECTION.md 3b tension the ticket asked to have settled: a live
   read is not a subtitle, but a row with no reading to give still owes the
   person a sentence. Every row's line is in `vocabulary/hubLabels.ts`, total
   over the row keys, and a reading replaces it once there is one.

   Three other things live here because the hub is where they are presentation
   rather than record:

     - the one-to-many mapping from a row to the archive sections behind it,
       which is what `areaGroups.ts` and ADR-0052 deliberately left to the
       hub. A row fronting two sections reads as finished only when both are.
     - a hidden area's absence, which falls out of the same mapping: a row
       goes only when every hideable section behind it is hidden, and
       `cycleEvents` is not hideable at all (ADR-0043), so the row fronting
       only it can never disappear this way. That much is structural rather
       than a special case. ADR-0043's *positive* gate is not: it belongs to
       one named row and is written out as one, below.
     - the finished group, and the day it shows.

   Node-tier safe: no clock, no driver, no paraglide, no runes. Every function
   takes today as an argument. The words are `vocabulary/hubLabels.ts`'s, the
   same split `areaGroups.ts` keeps from `vocabulary/areaLabels.ts`. */

import {
  FINISH_SUGGESTION_QUIET_DAYS,
  groupFinishedOn,
  groupSuspendedOn,
  latestWrite,
  type AreaGroupKey
} from './areaGroups';
import { areasHidden, type AreaStates } from './areaState';
import type { ArchiveSectionName } from './journal/archiveSections';
import { LAST_WRITE_ENTRIES, type LastWriteKey } from './journal/lastWrite';

/** The hub's groups, in the order they are drawn.

    `media` is new (this ticket): photos and voice memos are both things
    attached to an entry rather than series of their own, and they used to sit
    one in Body and one in Practice with nothing saying they were the same kind
    of thing. Body keeps the four measurements-shaped rows.

    A video-note browse screen would be this group's third member and does not
    exist yet, which is recorded rather than filled - the ticket's own scope
    line. */
export const HUB_GROUP_KEYS = ['body', 'health', 'transition', 'practice', 'media'] as const;

export type HubGroupKey = (typeof HUB_GROUP_KEYS)[number];

/** One row, as declared. */
export interface HubRowSpec {
  /** The row's own identity: the walkthrough's handle and the key
      `areaGroups.ts` named its groups after (ADR-0029). */
  key: string;
  /** A name from `$lib/components/icons.ts`. No two rows share one - see
      `hubRows.test.ts`, which refuses a duplicate anywhere on the hub rather
      than only on adjacent rows. */
  icon: string;
  href: string;
  group: HubGroupKey;
  /** Which archive sections sit behind the row. Empty for a row that is a
      screen rather than an area: `/care` groups four medication surfaces,
      the clinician summary is a page built out of everywhere else.

      Two jobs, and both are about the row rather than about the record:
      whether the row has gone with a hidden area, and which of its sections'
      last writes its line reports. */
  areas: readonly ArchiveSectionName[];
  /** The group whose finish this row fronts, where there is one. Every key
      in `AREA_GROUPS` is claimed by exactly one row - a compile error
      otherwise, below. */
  finishes: AreaGroupKey | null;
  /** Whether the second line is a reading or a written line. Not derived
      from `areas`: `/care` fronts no area and states what is behind it,
      while `photos` and `voice` front records that travel inside an entry
      and have no dated stream of their own to report. */
  line: 'read' | 'written';
}

/** Every row, in the order each group draws them.

    The order is the hub's own, unchanged from before this ticket except where
    a row moved group. Icons: three pairs were duplicated - the two voice-ish
    rows both `mic`, roadmap and resources both `globe`, milestones and
    surgery both `flag` - and the repo's own rule is that two identical icons
    read as one row drawn twice. All three are resolved, and the test refuses
    a duplicate anywhere rather than only where two happen to be adjacent. */
const ROWS = [
  // --- Body: the four measurement-shaped rows ------------------------------
  {
    key: 'measurements',
    icon: 'ruler',
    href: '/body/measurements',
    group: 'body',
    areas: ['measurements'],
    finishes: 'measurements',
    line: 'read'
  },
  {
    key: 'sizes',
    icon: 'package',
    href: '/body/sizes',
    group: 'body',
    areas: ['sizeRecords'],
    finishes: 'sizes',
    line: 'read'
  },
  {
    key: 'hair-progress',
    icon: 'comb',
    href: '/body/hair-progress',
    group: 'body',
    /* Two sections, one row: the stagings and the photographs finish
       together and the row reports whichever of them was written last
       (`groupLastWrite`'s own reasoning - somebody can log stages for two
       years and never photograph one). */
    areas: ['hairStages', 'hairPhotos'],
    finishes: 'hair-progress',
    line: 'read'
  },
  {
    key: 'hair-removal',
    icon: 'shuffle',
    href: '/body/hair-removal',
    group: 'body',
    areas: ['hairRemovalSessions'],
    finishes: 'hair-removal',
    line: 'read'
  },

  // --- Health --------------------------------------------------------------
  {
    /* Deepening ticket 07 put labs, the regimen, the hormone curve and the
       dose log behind this one row, and what earned that tap is that /care
       opens on a live read of each. It fronts no area of its own, so there is
       nothing here for a hidden-area rule to act on and nothing whose last
       write would not already be on the screen behind it. */
    key: 'care',
    icon: 'timeline',
    href: '/care',
    group: 'health',
    areas: [],
    finishes: null,
    line: 'written'
  },
  {
    /* ADR-0043: the one row that has to be able to not exist, and the one
       area no `hidden` flag may reach. Its absence is `cycleTrackingVisible`'s
       to decide - an active testosterone regimen or the explicit opt-in -
       which is a positive gate rather than a hide, and `cycleEvents` being
       outside `HideableArea` is what stops this file reversing it. */
    key: 'cycle-events',
    icon: 'calendar',
    href: '/health/cycle-events',
    group: 'health',
    areas: ['cycleEvents'],
    finishes: null,
    line: 'read'
  },
  {
    key: 'side-effects',
    icon: 'zap',
    href: '/health/side-effects',
    group: 'health',
    areas: ['sideEffects'],
    finishes: 'side-effects',
    line: 'read'
  },
  {
    key: 'surgery',
    icon: 'flag',
    href: '/health/surgery',
    group: 'health',
    areas: ['procedures'],
    finishes: null,
    line: 'read'
  },
  {
    key: 'dilation',
    icon: 'flask',
    href: '/health/dilation',
    group: 'health',
    /* The sessions, not the schedule. `taper` is what was meant to happen
       and opts out of the last-write registry for the reason a dose schedule
       does; `taperSessions` is the practice, and the practice is what ends. */
    areas: ['taperSessions'],
    finishes: 'dilation',
    line: 'read'
  },
  {
    key: 'appointment-prep',
    icon: 'check',
    href: '/health/appointment-prep',
    group: 'health',
    areas: [],
    finishes: null,
    line: 'written'
  },
  {
    key: 'clinician-summary',
    icon: 'share',
    href: '/health/clinician-summary',
    group: 'health',
    areas: [],
    finishes: null,
    line: 'written'
  },

  // --- Transition ----------------------------------------------------------
  {
    /* `sparkle` rather than the `flag` it shared with the surgery journey. A
       flag is planted on a map, which is what a surgery journey has: one
       dated event and a recovery window either side of it. */
    key: 'milestones',
    icon: 'sparkle',
    href: '/transition/milestones',
    group: 'transition',
    areas: ['milestones'],
    finishes: null,
    line: 'read'
  },
  {
    /* Keeps `globe`, which resources gave up: a roadmap is the closest thing
       in the icon set to a map, and support and resources is a list of places
       outside the app rather than a route through it. */
    key: 'roadmap',
    icon: 'globe',
    href: '/transition/roadmap',
    group: 'transition',
    /* A goal and a tick against one both opt out of the last-write registry
       for the same reason: neither carries a date of its own. */
    areas: ['roadmapGoals', 'roadmapChecks'],
    finishes: null,
    line: 'written'
  },
  {
    key: 'letters',
    icon: 'book',
    href: '/transition/letters',
    group: 'transition',
    /* Sealed until its unlock day, which is why the registry has no last
       write for it - asking when one was last written is a second way to
       meet it before the seal does. So this row states what it is. */
    areas: ['letters'],
    finishes: null,
    line: 'written'
  },
  {
    key: 'tryouts',
    icon: 'tag',
    href: '/transition/tryouts',
    group: 'transition',
    /* The tryout photos only, which is the registry's own bound: a tryout's
       start and end are a span, and its felt-sense history is
       `feltSenseEntries`, which belongs to a milestone just as much and is
       fronted by no row (see `LAST_WRITE_WITHOUT_A_ROW`). */
    areas: ['tryouts'],
    finishes: null,
    line: 'read'
  },
  {
    key: 'presentations',
    icon: 'palette',
    href: '/transition/presentations',
    group: 'transition',
    areas: ['presentations'],
    finishes: null,
    line: 'written'
  },
  {
    key: 'eras',
    icon: 'columns',
    href: '/transition/eras',
    group: 'transition',
    areas: ['eras'],
    finishes: null,
    line: 'written'
  },
  {
    key: 'words',
    icon: 'note',
    href: '/transition/words',
    group: 'transition',
    /* Note text grouped by the two things the rows either side of it name.
       It stores nothing of its own, so there is no section here. */
    areas: [],
    finishes: null,
    line: 'written'
  },

  // --- Practice ------------------------------------------------------------
  {
    key: 'doubt',
    icon: 'heart',
    href: '/doubt',
    group: 'practice',
    /* ADR-0037/0040: a Safe Space artefact is not a diary record with a day
       to report a gap about, which is the registry's own wording for why
       neither of these has a last write. */
    areas: ['counterevidenceSnapshots', 'comfortItems'],
    finishes: null,
    line: 'written'
  },
  {
    /* `curve` rather than the `mic` it shared with the voice memos. What is
       behind this row is a line over takes; what is behind the memos row is a
       recording. */
    key: 'voice-benchmark',
    icon: 'curve',
    href: '/practice/voice?tab=record',
    group: 'practice',
    /* Both halves of the practice, the way `AREA_GROUPS.voice` finishes them
       together - but only the benchmarks have a last write, since a practice
       take is sealed until the day after it was taken. */
    areas: ['voiceBenchmarks', 'voicePracticeTakes'],
    finishes: 'voice',
    line: 'read'
  },
  {
    key: 'entry-templates',
    icon: 'grid',
    href: '/practice/entry-templates',
    group: 'practice',
    areas: ['entryTemplates'],
    finishes: null,
    line: 'written'
  },
  {
    key: 'wear',
    icon: 'clock',
    href: '/practice/wear',
    group: 'practice',
    areas: ['wearSessions'],
    finishes: 'wear',
    line: 'read'
  },
  {
    /* `eye` rather than `sparkle`, which milestones took: what this screen
       asks is when you first *noticed* each change, and the route and the
       title both say so now (see `personal-effects`). */
    key: 'effects',
    icon: 'eye',
    href: '/practice/personal-effects',
    group: 'practice',
    areas: ['personalEffects'],
    finishes: 'effects',
    line: 'read'
  },
  {
    /* `info` rather than the `globe` it shared with the roadmap. */
    key: 'resources',
    icon: 'info',
    href: '/practice/resources',
    group: 'practice',
    areas: [],
    finishes: null,
    line: 'written'
  },

  // --- Media ---------------------------------------------------------------
  {
    /* Both of these front content that travels inside an entry or a
       milestone rather than a stream of its own, so neither has a section in
       the archive to ask about and neither can carry a reading. What they get
       instead is a line saying what is in them. */
    key: 'photos',
    icon: 'image',
    href: '/media/photos',
    group: 'media',
    areas: [],
    finishes: null,
    line: 'written'
  },
  {
    key: 'voice',
    icon: 'mic',
    href: '/media/voice/memos',
    group: 'media',
    areas: [],
    finishes: null,
    line: 'written'
  },
  {
    /* Paper the person keeps (phase 8 features ticket 52, ADR-0065). The
       media group's third row, and the first one in it that fronts an area
       of its own - a document belongs to no entry and no milestone.

       `line: 'read'`, against ticket 52's own line, which asked for
       `written`. Two things in the file decided it. The row has to name its
       area or `rowHidden` cannot see it, and a row that names an area the
       last-write registry answers for is a reading row - the invariant
       right below this list, total in both directions, with no exception
       mechanism and no reason to grow one for this. And the registry entry
       is what the ticket asks for in the same breath, because the return
       surface has to count filing a diagnosis as having been here.

       What the reading actually says is a date, and ADR-0065 puts a date
       on every row of the list behind this one. What it keeps off both is
       the page image. */
    key: 'documents',
    icon: 'documents',
    href: '/media/documents',
    group: 'media',
    areas: ['documents'],
    /* Paper keeps arriving - `NOT_FINISHABLE`'s own reason for this area
       (areaState.ts). There is no group to front. */
    finishes: null,
    line: 'read'
  }
] as const satisfies readonly HubRowSpec[];

/** Every row key, narrow. */
export type HubRowKey = (typeof ROWS)[number]['key'];

/** One row as the list holds it: `HubRowSpec` with its key still narrow, so a
    consumer reaching for a row's title cannot be handed a `string` the label
    record has never heard of. */
export type HubRow = Omit<HubRowSpec, 'key'> & { key: HubRowKey };

export const HUB_ROWS: readonly HubRow[] = ROWS;

const ROWS_BY_KEY = new Map<HubRowKey, HubRow>(ROWS.map((row) => [row.key, row]));

/** One row, by key. Total over `HubRowKey` and returning a `HubRow` rather
    than `HubRow | undefined`, which is what makes a second surface able to
    read a screen's identity off the row instead of restating it: the stats
    tab's cards are keyed by this type and a card naming no row does not
    compile (`statsAreas.ts`). */
export function hubRow(key: HubRowKey): HubRow {
  return ROWS_BY_KEY.get(key)!;
}

/** The screen behind a row, without the query string one row carries.

    `voice-benchmark` opens the voice screen on its benchmark tab, which is
    that row's business; anything asking which screen is behind the row - the
    stats card that fronts the same area, the test that holds every feature
    screen to the kit - means the screen. Here rather than as a `split` at
    each of those call sites. */
export function rowScreen(row: HubRowSpec): string {
  return row.href.split('?')[0];
}

/* Every finishable group has to be fronted by a row, or it is one a person
   can declare finished on its own screen and which then moves nowhere on the
   hub, silently. This makes that a compile error - demonstrated by deleting
   `finishes: 'sizes'` above and watching `Unfronted` stop being `never`. The
   other direction is the `finishes: AreaGroupKey | null` field itself, which
   refuses a row claiming a group `AREA_GROUPS` does not hold. */
type Fronted = (typeof ROWS)[number]['finishes'];
type Unfronted = Exclude<AreaGroupKey, Fronted>;
type AssertNoneUnfronted<Missing extends never> = Missing;
export type EveryAreaGroupFrontedByARow = AssertNoneUnfronted<Unfronted>;

/** Every area with a last write that **no** row reports, and why - the full
    `Record` over whatever the rows above do not claim, the shape
    `LAST_WRITE_OPT_OUTS` and `DAY_OPT_OUTS` use. An area registered in
    `lastWrite.ts` and not fronted here is one whose recency the hub silently
    never shows, so this is a compile error until somebody either points a row
    at it or writes down why no row does.

    Five of them, and none is a hub row's business: three are their own tab or
    screen, one sits behind `/care`, and one is content belonging to two other
    rows at once. */
export const LAST_WRITE_WITHOUT_A_ROW: Record<Exclude<LastWriteKey, RowArea>, string> = {
  entries: 'the journal itself, which Home and the calendar are already about',
  doseEvents: 'behind the care row, whose own screen opens on the last dose',
  labResults: 'behind the care row, whose own screen opens on the last lab draw',
  tallyEvents: 'its own tab, not a row here',
  feltSenseEntries: 'written on a tryout or a milestone, so it belongs to two rows and is fronted by neither'
};

type RowArea = (typeof ROWS)[number]['areas'][number];

/** The areas the registry answers for, as a set, so a row's reading half is
    derived from `lastWrite.ts` rather than listed a second time here. */
const AREAS_WITH_A_LAST_WRITE: ReadonlySet<string> = new Set(LAST_WRITE_ENTRIES.map((entry) => entry.key));

/* The set is built from the registry's own keys, so membership in it *is*
   `LastWriteKey`. Written as a predicate rather than left widened, because
   what it buys is at the other end: `HubReading.lastWrites` can then be keyed
   by the registry instead of by `string`, and a caller handing this the wrong
   read fails to compile. */
const hasLastWrite = (area: ArchiveSectionName): area is LastWriteKey => AREAS_WITH_A_LAST_WRITE.has(area);

/** Which of a row's areas have a last write to report. */
export function rowReads(spec: HubRowSpec): LastWriteKey[] {
  return spec.areas.filter(hasLastWrite);
}

/** Whether a row has gone with a hidden area: `areasHidden` over the sections
    it fronts, which is where the rule lives now that the stats tab's cards
    ask it too (`areaState.ts`). */
export function rowHidden(spec: HubRowSpec, states: AreaStates): boolean {
  return areasHidden(spec.areas, states);
}

/** What a row's second line says.

    The first two carry no data because the words are all of it, and both draw
    the same line - the one about what is behind the row
    (`vocabulary/hubLabels.ts`). They stay separate kinds because the facts
    are different, and a test or a flow wants to tell them apart: one row can
    never have a reading, the other does not have one yet. */
export type HubLine =
  /** The row reports no reading, ever: it fronts no dated stream, or fronts
      one the last-write registry deliberately refuses to answer for. */
  | { kind: 'no-stream' }
  /** The row reports a reading, and nothing has been written in it yet. */
  | { kind: 'not-yet' }
  /** Written to, recently enough that the gap is not the point. */
  | { kind: 'last'; epochDay: number; daysAgo: number }
  /** Written to, and then not for a whole quiet window. The observation the
      finished-area feature makes its offer from, made on the hub too. */
  | { kind: 'quiet'; epochDay: number; daysAgo: number }
  /** The person has said this one ended, and when. */
  | { kind: 'finished'; epochDay: number }
  /** The person has paused this one, and when (phase 8 features ticket 51).
      Unlike a finished row, a suspended one stays under its own group's
      heading rather than moving to the finished set - it is not done, and
      grouping it with what is would say so. */
  | { kind: 'suspended'; epochDay: number };

/** The one row ADR-0043's positive gate belongs to, named rather than left as
    a literal in the loop below. It is a special case on purpose and there is
    exactly one: cycle tracking is the only area whose row is added back by an
    active testosterone regimen or an explicit opt-in, and a general
    "gated on" field would be one implementation dressed as a mechanism. */
const CYCLE_GATED_ROW = 'cycle-events';

/** Everything the hub reads, so nothing below asks for itself. */
export interface HubReading {
  todayEpochDay: number;
  /** One assembled call, `journal/lastWrite.ts` - not a query per row.
      Partial so a caller with nothing read yet can pass `{}`. */
  lastWrites: Partial<Record<LastWriteKey, number | null>>;
  states: AreaStates;
  /** `cycleTrackingVisible`'s answer, which is the screen's to fetch: it
      needs the regimen episode list and a preference, neither of which
      belongs in a rule this file can test without a driver. */
  cycleShown: boolean;
}

/** The day a row's group ended, or null while it has not. A row fronting two
    sections reads as finished only when both are, which is `groupFinishedOn`'s
    own rule; a row fronting no group never reads as finished. */
export function rowFinishedOn(spec: HubRowSpec, states: AreaStates, todayEpochDay: number): number | null {
  if (spec.finishes === null) return null;
  const day = groupFinishedOn(spec.finishes, states);
  /* Clamped against today rather than trusted as a flag, which is the rule
     `areaQuiet` states (areaState.ts) and `groupFinishedOn` deliberately
     leaves to its callers: the stored fact is the day the person named, and
     what follows from it on any given day is read. So a row dated to end
     next month is not in the finished set today. */
  return day !== null && day <= todayEpochDay ? day : null;
}

/** The day a row's group was paused, or null while it has not been -
    `rowFinishedOn`'s own rule, read off `groupSuspendedOn` instead (phase 8
    features ticket 51). */
export function rowSuspendedOn(spec: HubRowSpec, states: AreaStates, todayEpochDay: number): number | null {
  if (spec.finishes === null) return null;
  const day = groupSuspendedOn(spec.finishes, states);
  return day !== null && day <= todayEpochDay ? day : null;
}

/** What one row says under its title. */
export function rowLine(spec: HubRowSpec, reading: HubReading): HubLine {
  const finishedOn = rowFinishedOn(spec, reading.states, reading.todayEpochDay);
  if (finishedOn !== null) return { kind: 'finished', epochDay: finishedOn };
  const suspendedOn = rowSuspendedOn(spec, reading.states, reading.todayEpochDay);
  if (suspendedOn !== null) return { kind: 'suspended', epochDay: suspendedOn };
  if (spec.line === 'written') return { kind: 'no-stream' };

  const epochDay = latestWrite(rowReads(spec), reading.lastWrites);
  if (epochDay === null) return { kind: 'not-yet' };

  const daysAgo = reading.todayEpochDay - epochDay;
  return { kind: daysAgo >= FINISH_SUGGESTION_QUIET_DAYS ? 'quiet' : 'last', epochDay, daysAgo };
}

/** One drawn section of the hub. */
export interface HubSection {
  /** A group, or the finished set, which is not one of them: a finished row
      keeps its icon and its screen and only stops sitting under the heading
      it used to. */
  key: HubGroupKey | 'finished';
  rows: { spec: HubRow; line: HubLine }[];
}

/** The hub, assembled: every group in order with its rows, then the finished
    set, with empty sections left out.

    A finished row leaves its own group rather than appearing twice - it is
    still one tap away and its screen still works, which is the whole point of
    an area ending rather than being deleted. */
export function hubSections(reading: HubReading): HubSection[] {
  const byKey = new Map<HubGroupKey | 'finished', HubSection['rows']>();
  for (const key of [...HUB_GROUP_KEYS, 'finished'] as const) byKey.set(key, []);

  for (const spec of HUB_ROWS) {
    if (rowHidden(spec, reading.states)) continue;
    if (spec.key === CYCLE_GATED_ROW && !reading.cycleShown) continue;
    const line = rowLine(spec, reading);
    byKey.get(line.kind === 'finished' ? 'finished' : spec.group)!.push({ spec, line });
  }

  return [...byKey].filter(([, rows]) => rows.length > 0).map(([key, rows]) => ({ key, rows }));
}

/** Which row fronts each finishable group's finish.

    The compile check above says every group is claimed; this says which row
    claimed it, and it is what catches the other half - two rows claiming one
    group, which the type system cannot see and which would leave the second
    row's finish moving nothing. `hubRows.test.ts` holds it against
    `AREA_GROUPS` rather than a module-level throw, because a bad row list is
    a coding error to fail a test on and not something to refuse to boot
    over. */
export const AREA_GROUP_ROW_KEYS: Record<AreaGroupKey, HubRowKey> = Object.fromEntries(
  ROWS.filter((spec) => spec.finishes !== null).map((spec) => [spec.finishes, spec.key])
) as Record<AreaGroupKey, HubRowKey>;
