/* Declare which rows the More hub shows and what each row reports
   (ADR-0036, ADR-0052, ADR-0043, ADR-0027). A read row uses the
   latest write for its areas and falls back to the same description
   as a written row. vocabulary/hubLabels.ts supplies the descriptions.

   Each row maps to the Archive sections behind it. A row counts as
   finished only when all its contributing areas are finished. It
   disappears only when all its sections can be hidden and are hidden.
   The cycle row is additionally gated by HubReading.cycleVisible.

   The registry chooses the home group and finished date. Its functions
   take today as input and run without the clock, journal driver, runes
   or localized copy. */

import {
  FINISH_SUGGESTION_QUIET_DAYS,
  groupFinishedOn,
  groupSuspendedOn,
  latestWrite,
  type AreaGroupKey
} from './areaGroups';
import { areaHidden, areasHidden, type AreaStates, type HideableArea } from './areaState';
import { foldText } from './fold';
import type { ArchiveSectionName } from './journal/archiveSections';
import { LAST_WRITE_ENTRIES, type LastWriteKey } from './journal/lastWrite';
import { ROW_FORWARD_KEYS, type RowForward, type RowForwardKey, type RowForwardMap } from './rowForward';

/**
 * Draw hub groups in this order. Media holds photos and voice
 * memos, with video notes included in the photo library (ADR-0085).
 * Support groups resources and Safe Space. Body holds physical
 * changes and practice. Steps holds plans and milestones. Care
 * owns the medication lanes and hosted rows.
 */
/* hub_screen_title (messages/*.json) names these five by hand for the
   hub's own hidden screen title - add, rename or reorder a group here and
   that string goes stale until it's edited too. */
export const HUB_GROUP_KEYS = ['health', 'body', 'transition', 'support', 'media'] as const;

export type HubGroupKey = (typeof HUB_GROUP_KEYS)[number];

/* Cycle events and dilation are on the hub and also linked from Meds and
   the surgery list, drawn through `HostedRows.svelte` with the keys those
   screens ask for: a link, not a home. `more-surfaces.test.ts` allows
   exactly those two. */

/** One row, as declared. */
/* HubRowSpec stays exported only for its own test (AU-09 test-only review). */
export interface HubRowSpec {
  /** The row's own identity: the walkthrough's handle and the key
      `areaGroups.ts` named its groups after (ADR-0029). */
  key: string;
  /** A name from `$lib/components/icons.ts`. No two rows share one - see
      `hubRows.test.ts`, which refuses a duplicate anywhere on the hub rather
      than only on adjacent rows. */
  icon: string;
  href: string;
  /** Which of the hub's groups draws the row. */
  home: HubGroupKey;
  /** Which archive sections sit behind the row. Empty for a row that is a
      screen rather than an area: `/care` groups four medication surfaces,
      the clinician summary is a page built out of everywhere else.

      Two jobs, and both are about the row rather than about the record:
      whether the row has gone with a hidden area, and which of its sections'
      last writes its line reports. */
  areas: readonly ArchiveSectionName[];
  /** Areas controlling visibility when a row is a gateway rather than a
      dated stream. Care owns these records but reports no single last write. */
  visibilityAreas?: readonly HideableArea[];
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

/**
 * List rows in hub group order, then list hosted rows in host order. Hair removal follows the wear log in Transition. Letters sit in Support. The icon test enforces unique icons across all rows so distinct destinations do not look duplicated.
 */
const ROWS = [
  // --- Health --------------------------------------------------------------
  {
    /* Deepening ticket 07 put labs, the regimen and the dose log behind
       this one row. /care opens on their live reads. It fronts no area of its own, so there is
       nothing here for a hidden-area rule to act on and nothing whose last
       write would not already be on the screen behind it.

       Ticket 16 gave it a fifth thing: the changes somebody has noticed,
       hosted below. */
    key: 'care',
    /* `pill`, the medication mark the screen behind
       it already draws; it drew `timeline`, two dots on a rail. */
    icon: 'pill',
    href: '/care',
    home: 'health',
    areas: [],
    visibilityAreas: ['regimenEpisodes', 'doseEvents', 'doseSchedules', 'dosePauses', 'medicationStock', 'labResults'],
    finishes: null,
    line: 'written'
  },
  {
    /* ADR-0043: the one row that has to be able to not exist, and the one
       area no `hidden` flag may reach. Its absence is `cycleTrackingVisible`'s
       to decide - an active testosterone regimen or the explicit opt-in -
       which is a positive gate rather than a hide, and `cycleEvents` being
       outside `HideableArea` is what stops this file reversing it.

       It has been on the hub, off it, hosted by two screens and, since
       pre-release-human 12, on the hub again ("cycle and dilation should be
       appearing in care"), in Health beside Meds. What makes that safe is
       that the gate travels with it: `HubReading.cycleVisible` is false
       until a screen answers it, and `hubSections` and `hubRowsMatching`
       leave the row out until it is true, so neither the list nor the
       search can ask about cycles of somebody the app decided not to ask. */
    key: 'cycle-events',
    icon: 'calendar',
    href: '/health/cycle-events',
    home: 'health',
    areas: ['cycleEvents'],
    finishes: null,
    line: 'read'
  },
  {
    /* Renamed from `appointment-prep` by ticket 57 rather than joined by a
       second row: prep, the record and the debrief were three descriptions
       of one thing, and the one that names it is the one that stays
       (ADR-0066). `appointment`, a page with a clock; it drew `check`, which said "done" rather than "a visit". */
    key: 'appointments',
    icon: 'appointment',
    href: '/health/appointments',
    home: 'health',
    areas: ['appointments'],
    finishes: null,
    line: 'read'
  },
  {
    /* `clipboard`; it drew `flag`. */
    key: 'surgery',
    icon: 'clipboard',
    href: '/health/surgery',
    home: 'health',
    areas: ['procedures'],
    finishes: null,
    line: 'read'
  },
  {
    /* On the hub in Health only once a procedure can carry a dilation
       journey: `dilationGated` (taperSchedule.ts)
       hides its area until then, and the hub's reading is built over it.
       The surgery list keeps its own link, drawn through HostedRows. */
    key: 'dilation',
    icon: 'repeat',
    href: '/health/dilation',
    home: 'health',
    /* The sessions, not the schedule. `taper` is what was meant to happen
       and opts out of the last-write registry for the reason a dose schedule
       does; `taperSessions` is the practice, and the practice is what ends. */
    areas: ['taperSessions'],
    visibilityAreas: ['procedures'],
    finishes: 'dilation',
    line: 'read'
  },
  // --- Body --------------------------------------------------------------
  {
    /* Pre-release-human 12, bug 25: shots taken on purpose, pose by pose,
       split off the photo library, which keeps every photograph in the
       journal. `progressShot`, a portrait with the earlier shot's head behind
       it; it drew `camera` as a placeholder. Not finishable
       (areaState.ts's NOT_FINISHABLE says why). */
    key: 'progress-photos',
    icon: 'progressShot',
    href: '/transition/progress-photos',
    home: 'body',
    areas: ['progressPhotos'],
    finishes: null,
    line: 'read'
  },
  {
    /* The Care row links to noticed changes and side effects together. Use
       an eye icon and report the most recent write across both sections. */
    /* `sprout`, a change that grew; it drew `eye`. */
    key: 'effects',
    icon: 'sprout',
    href: '/care/changes',
    home: 'body',
    areas: ['personalEffects', 'sideEffects'],
    finishes: 'effects',
    line: 'read'
  },
  {
    /* `razor`; it drew `shuffle`, which said
       nothing about hair. */
    key: 'hair-removal',
    icon: 'razor',
    href: '/body/hair-removal',
    home: 'body',
    areas: ['hairRemovalSessions'],
    finishes: 'hair-removal',
    line: 'read'
  },
  {
    /* `watch`, something worn for a length of time; it drew `clock`. */
    key: 'wear',
    icon: 'watch',
    href: '/body/wear',
    home: 'body',
    areas: ['wearSessions'],
    finishes: 'wear',
    line: 'read'
  },
  {
    /* `waveform`. It drew `curve`, a line over
       takes, which at row size read as a hill rather than a voice. The
       recordings ticket 17 folded in here keep `mic` on the screen's own
       Recordings tab rather than taking the row's icon with them. */
    key: 'voice-benchmark',
    icon: 'waveform',
    /* No `?tab=record`: the flow's own tab is already the screen's default,
       so the two addresses opened on the same tab. */
    href: '/voice',
    home: 'body',
    /* Both halves of the practice, the way `AREA_GROUPS.voice` finishes them
       together - but only the benchmarks have a last write here, since a
       practice take is sealed until the day after it was taken. The
       recordings the Media group's own `voice` row used to front (ticket 17
       folded that row's screen into this one, as the Recordings tab) have no
       archive section of their own to register either (ADR-0036: a memo is
       entry content) - `voiceMemoLastWriteEpochDay` on `HubReading` is the
       second, non-registry read this row alone asks, and `rowLine` folds it
       in below. */
    areas: ['voiceBenchmarks', 'voicePracticeTakes'],
    finishes: 'voice',
    line: 'read'
  },
  // --- Transition --------------------------------------------------------
  {
    /* `route`, a way from one point to another. It
       drew `globe`, which said "the world" rather than "a plan". */
    key: 'roadmap',
    icon: 'route',
    href: '/transition/roadmap',
    home: 'transition',
    /* A goal and a tick against one both opt out of the last-write registry
       for the same reason: neither carries a date of its own. */
    areas: ['roadmapGoals', 'roadmapCategories', 'roadmapChecks'],
    finishes: null,
    line: 'written'
  },
  {
    /* `summit`, a flag on a mountain: a day reached.
       It drew `sparkle` before that, and `flag` before that, which it shared
       with the surgery journey. */
    key: 'milestones',
    icon: 'summit',
    href: '/transition/milestones',
    home: 'transition',
    areas: ['milestones'],
    finishes: null,
    line: 'read'
  },
  {
    /* `hanger`, for trying something on; it drew
       `tag`. */
    key: 'tryouts',
    icon: 'hanger',
    href: '/transition/tryouts',
    home: 'transition',
    /* The tryout photos only, which is the registry's own bound: a tryout's
       start and end are a span, and its felt-sense history is
       `feltSenseEntries`, which is fronted by no row (see
       `LAST_WRITE_WITHOUT_A_ROW`). */
    areas: ['tryouts'],
    finishes: null,
    line: 'read'
  },
  // --- Support -----------------------------------------------------------
  {
    /* `envelope`, sealed; it drew `book`. */
    key: 'letters',
    icon: 'envelope',
    href: '/transition/letters',
    home: 'support',
    /* Sealed until its unlock day, which is why the registry has no last
       write for it - asking when one was last written is a second way to
       meet it before the seal does. So this row states what it is. */
    areas: ['letters'],
    finishes: null,
    line: 'written'
  },
  {
    /* `shelter`, a heart under a roof; it drew a
       bare `heart`, which is also the comfort list's and the body map's. */
    key: 'doubt',
    icon: 'shelter',
    href: '/doubt',
    home: 'support',
    /* ADR-0037/0040: a Safe Space artefact is not a diary record with a day
       to report a gap about, which is the registry's own wording for why
       the comfort list has no last write. */
    areas: ['comfortItems'],
    finishes: null,
    line: 'written'
  },
  {
    /* `lifebuoy`. It drew `info`, which every
       notice in the app draws, and before that the roadmap's `globe`. */
    key: 'resources',
    icon: 'lifebuoy',
    href: '/support/resources',
    home: 'support',
    areas: [],
    finishes: null,
    line: 'written'
  },
  // --- Media -------------------------------------------------------------
  {
    /* Fronts content that travels inside an entry rather than a stream of
       its own, so it has no section in the archive to ask about and cannot
       carry a reading. What it gets instead is a line saying what is in it.

       Voice memos shared this shape and this group until ticket 17 folded
       their browse screen into the voice screen's own Recordings tab -
       `/media/voice/memos` has been removed, and what fronts a
       recording on the hub is `voice-benchmark`'s row on Transition. */
    key: 'photos',
    icon: 'image',
    href: '/media/photos',
    home: 'media',
    areas: [],
    finishes: null,
    line: 'written'
  },
  {
    /* Voice memos, back on the hub beside photos (bug session 18, item 70)
       after ticket 17 had folded them into the voice screen as its fourth
       tab. The same shape as photos: audio an entry owns, no section of
       its own, a written line. */
    key: 'recordings',
    icon: 'mic',
    href: '/media/recordings',
    home: 'media',
    areas: [],
    finishes: null,
    line: 'written'
  },
  {
    /* A document is its own media area (ADR-0065). The row reads its last-write
       date from the registry so hiding and the return surface can use the area.
       Leave page images out of the row. */
    key: 'documents',
    icon: 'documents',
    href: '/media/documents',
    home: 'media',
    areas: ['documents'],
    /* Paper keeps arriving - `NOT_FINISHABLE`'s own reason for this area
       (areaState.ts). There is no group to front. */
    finishes: null,
    line: 'read'
  },

  // --- Drawn on another screen rather than on the hub ----------
] as const satisfies readonly HubRowSpec[];

/** Every row key, narrow. */
export type HubRowKey = (typeof ROWS)[number]['key'];

/** One row as the list holds it: `HubRowSpec` with its key still narrow, so a
    consumer reaching for a row's title cannot be handed a `string` the label
    record has never heard of. */
/* HubRow stays exported only for feature-screens.test.ts, which cross-checks
   against it (AU-09 test-only review). */
export type HubRow = Omit<HubRowSpec, 'key'> & { key: HubRowKey };

/* HUB_ROWS stays exported for its own test, and cross-checked in
   feature-screens.test.ts, home-contracts.ts, more-surfaces.test.ts,
   safe-space-contracts.ts (AU-09 test-only review). */
export const HUB_ROWS: readonly HubRow[] = ROWS;

/** The same rows people can hide later. Dilation is configured by an eligible
    procedure inside Surgery journey, not chosen as a separate module. */
export const FEATURE_MODULE_ROWS: readonly HubRow[] = HUB_ROWS.filter((row) => row.key !== 'dilation' && featureAreas(row).length > 0);

export function featureAreas(row: HubRowSpec): readonly HideableArea[] {
  return row.visibilityAreas ?? row.areas.filter((area): area is HideableArea => area !== 'cycleEvents');
}

const ROWS_BY_KEY = new Map<HubRowKey, HubRow>(ROWS.map((row) => [row.key, row]));

/** One row, by key. Total over `HubRowKey` and returning a `HubRow` rather
    than `HubRow | undefined`, which is what makes a second surface able to
    read a screen's identity off the row instead of restating it: `HostedRows`
    is keyed by this type, and a hosted row naming no key does not compile. */
export function hubRow(key: HubRowKey): HubRow {
  return ROWS_BY_KEY.get(key)!;
}

/** The screen behind a row, without any query string it carries.

    No row carries one today (`voice-benchmark` did until ticket 17), but
    anything asking which screen is behind the row - the stats card that
    fronts the same area, the test that holds every feature screen to the
    kit - means the screen, and a row given a query later still answers with
    it. Here rather than as a `split` at each of those call sites. */
export function rowScreen(row: HubRowSpec): string {
  return row.href.split('?')[0];
}

/* Every finishable group has to be fronted by a row, or it is one a person
   can declare finished on its own screen and which then moves nowhere on the
   hub, silently. This makes that a compile error - demonstrated by deleting
   `finishes: 'wear'` above and watching `Unfronted` stop being `never`. The
   other direction is the `finishes: AreaGroupKey | null` field itself, which
   refuses a row claiming a group `AREA_GROUPS` does not hold. */
type Fronted = (typeof ROWS)[number]['finishes'];
type Unfronted = Exclude<AreaGroupKey, Fronted>;
type AssertNoneUnfronted<Missing extends never> = Missing;
type EveryAreaGroupFrontedByARow = AssertNoneUnfronted<Unfronted>;

/** Every area with a last write that **no** row reports, and why - the full
    `Record` over whatever the rows above do not claim, the shape
    `LAST_WRITE_OPT_OUTS` and `DAY_OPT_OUTS` use. An area registered in
    `lastWrite.ts` and not fronted here is one whose recency the hub silently
    never shows, so this is a compile error until somebody either points a row
    at it or writes down why no row does.

    Five of them, and none is a hub row's business: three are their own tab or
    screen, one sits behind `/care`, and one is content belonging to two other
    rows at once. */
/* LAST_WRITE_WITHOUT_A_ROW stays exported only for its own test (AU-09
   test-only review). */
export const LAST_WRITE_WITHOUT_A_ROW: Record<Exclude<LastWriteKey, RowArea>, string> = {
  entries: 'the journal itself, which Home and the calendar are already about',
  doseEvents: 'behind the care row, whose own screen opens on the last dose',
  labResults: 'behind the care row, whose own screen opens on the last lab draw',
  feltSenseEntries: 'written on a tryout, whose row is fronted by the tryout itself rather than its readings'
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
  /* Dilation also goes when its own area is hidden, which nothing but
     `dilationGated` (taperSchedule.ts) does: no procedure that can carry a
     dilation journey is logged. Its visibility area stays `procedures`, so
     hiding Surgery still takes it too. */
  if (spec.key === 'dilation' && areaHidden('taperSessions', states)) return true;
  return areasHidden(spec.visibilityAreas ?? spec.areas, states);
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
  /** The person has paused this one, and when.
      Unlike a finished row, a suspended one stays under its own group's
      heading rather than moving to the finished set - it is not done, and
      grouping it with what is would say so. */
  | { kind: 'suspended'; epochDay: number }
  /** rowForward.ts supplies the running, next or last value. Use one of the
      past-tense shapes only when no forward fact is available. */
  | RowForward;

/** Everything the hub reads, so nothing below asks for itself.

    ADR-0043's positive gate is `cycleVisible`: the cycle row is a row on the
    hub that has to be able to not exist, so the screen that draws the hub
    answers `cycleTrackingVisible` and hands it in. Ticket 16 once took that
    row off the hub and the gate with it; pre-release-human 12 put both back.

    Read by the front page too since phase 10 redesign ticket 05: a pinned
    row asks the same three questions a hub row does, off the same one
    assembled read (`pinnedRows.ts`). */
export interface HubReading {
  todayEpochDay: number;
  /** One assembled call, `journal/lastWrite.ts` - not a query per row.
      Partial so a caller with nothing read yet can pass `{}`. */
  lastWrites: Partial<Record<LastWriteKey, number | null>>;
  states: AreaStates;
  /** What each row has to say facing forwards, out of the one assembled
      call `rowForwardReads.ts` answers with - sparse the same way
      `lastWrites` is, and `{}` while nothing has landed. Required rather
      than optional so a surface drawing rows without asking the forward
      question is a compile error rather than a door that quietly goes back
      to reporting gaps. */
  forward: RowForwardMap;
  /** The most recent voice memo, at or before today, or null where there is
      none - `voice-benchmark`'s own second read.

      Not in `lastWrites`: a memo is entry content with no archive section
      of its own (ADR-0036), so it has no `LastWriteKey` to be registered
      under, the same reason `voicePracticeTakes` opts out of the registry
      rather than joining it with a made-up one. This is the one row that
      also asks a fact the registry cannot answer, so it is its own field
      rather than a `LastWriteKey` that would misrepresent what memos are.
      Optional, and read with `?? null`, so a caller that has not asked this
      question yet (every existing `HubReading` literal, every test) keeps
      compiling rather than being forced to state "nothing landed" by hand. */
  voiceMemoLastWriteEpochDay?: number | null;
  /** ADR-0043's positive gate, answered by the screen: whether
      `cycleTrackingVisible` says the cycle row may exist. Absent means no,
      so a caller that never asked cannot draw or search up a cycle row. */
  cycleVisible?: boolean;
}

/** The day a row's group ended, or null while it has not. A row fronting two
    sections reads as finished only when both are, which is `groupFinishedOn`'s
    own rule; a row fronting no group never reads as finished. */
function rowFinishedOn(spec: HubRowSpec, states: AreaStates, todayEpochDay: number): number | null {
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
    `rowFinishedOn`'s own rule, read off `groupSuspendedOn` instead. */
function rowSuspendedOn(spec: HubRowSpec, states: AreaStates, todayEpochDay: number): number | null {
  if (spec.finishes === null) return null;
  const day = groupSuspendedOn(spec.finishes, states);
  return day !== null && day <= todayEpochDay ? day : null;
}

/* Every key `rowForward.ts` answers for has to be a row here, or its fact
   would be assembled and never drawn. Declared as an assertion rather than
   by importing this module's keys over there, which would be a cycle: the
   forward registry names its own rows and this is where the two are proved
   to agree. */
type UnknownForwardKey = Exclude<RowForwardKey, HubRowKey>;
type AssertEveryForwardKeyIsARow<Unknown extends never> = Unknown;
export type EveryForwardKeyIsARow = AssertEveryForwardKeyIsARow<UnknownForwardKey>;

/** Which rows the forward registry answers for, written as a predicate for
    the reason `hasLastWrite` above is one: it is what lets the map stay
    keyed by the registry instead of by `string`, so `rowLine` reads it with
    no cast and a key that is not a forward row cannot be looked up at all. */
const FORWARD_KEYS: ReadonlySet<string> = new Set(ROW_FORWARD_KEYS);
const hasForward = (key: string): key is RowForwardKey => FORWARD_KEYS.has(key);

/** The later of two nullable days, or null where neither has one - `voice-
    benchmark`'s own fold of a registry read and its second, non-registry
    read (the field's own doc on `HubReading`). */
function laterEpochDay(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * Choose the row's second line in this order. Finished or suspended
 * state comes first. Then use the one forward fact supplied by
 * rowForward.ts, even for a row with a standing description.
 * Finally use the last-write reading or the row's fallback copy.
 *
 * The person's decision to finish wins over any appointment still
 * dated in that area. A standing description gives way to a concrete
 * next event when there is one.
 */
export function rowLine(spec: HubRowSpec, reading: HubReading): HubLine {
  const finishedOn = rowFinishedOn(spec, reading.states, reading.todayEpochDay);
  if (finishedOn !== null) return { kind: 'finished', epochDay: finishedOn };
  const suspendedOn = rowSuspendedOn(spec, reading.states, reading.todayEpochDay);
  if (suspendedOn !== null) return { kind: 'suspended', epochDay: suspendedOn };

  const forward = hasForward(spec.key) ? reading.forward[spec.key] : undefined;
  if (forward) return forward;

  if (spec.line === 'written') return { kind: 'no-stream' };

  const registryEpochDay = latestWrite(rowReads(spec), reading.lastWrites);
  /* `voice-benchmark` alone also asks its second, non-registry read (the
     field's own doc on `HubReading`) and reports whichever of the two is
     later - a recording since the row's own last write is exactly the
     "later of a benchmark and a recording" ticket 17 asks for. */
  const epochDay =
    spec.key === 'voice-benchmark'
      ? laterEpochDay(registryEpochDay, reading.voiceMemoLastWriteEpochDay ?? null)
      : registryEpochDay;
  if (epochDay === null) return { kind: 'not-yet' };

  const daysAgo = reading.todayEpochDay - epochDay;
  /* Quiet is the observation the finish offer is made from, so a row with
     nothing to finish never turns quiet (after-release 17, UX-18): on
     Documents it read as a nag about a paperwork vault. */
  const quiet = spec.finishes !== null && daysAgo >= FINISH_SUGGESTION_QUIET_DAYS;
  return { kind: quiet ? 'quiet' : 'last', epochDay, daysAgo };
}

/** A row as a screen draws it: what the registry declared, and what its
    second line says today.

    Named here rather than written out at each surface, because two surfaces
    draw it now - the hub's own sections below, and the front page's pinned
    rows (`pinnedRows.ts`). The two are different objects and the difference
    is what may be done to them: the hub groups its rows and sweeps a
    finished one into a set of its own, while a pinned row stays where the
    person put it. What one row *is* does not differ, and restating the
    shape per surface is how `statsAreas.ts` came to carry four wrong
    fields. */
export interface DrawnRow {
  spec: HubRow;
  line: HubLine;
}

/** One drawn section of the hub. */
export interface HubSection {
  /** A group, or the finished set, which is not one of them: a finished row
      keeps its icon and its screen and only stops sitting under the heading
      it used to. */
  key: HubGroupKey | 'finished';
  rows: DrawnRow[];
}

/** Group active rows, then list finished rows once. Omit empty groups.
    HostedRows.svelte keeps hosted rows on their own screen even after finish
    and uses the same rowLine wording as the hub. */
export function hubSections(reading: HubReading): HubSection[] {
  const byKey = new Map<HubGroupKey | 'finished', HubSection['rows']>();
  for (const key of [...HUB_GROUP_KEYS, 'finished'] as const) byKey.set(key, []);

  for (const spec of HUB_ROWS) {
    if (rowHidden(spec, reading.states)) continue;
    if (spec.key === 'cycle-events' && !reading.cycleVisible) continue;
    const line = rowLine(spec, reading);
    byKey.get(line.kind === 'finished' ? 'finished' : spec.home)!.push({ spec, line });
  }

  return [...byKey].filter(([, rows]) => rows.length > 0).map(([key, rows]) => ({ key, rows }));
}

/**
 * Find matching hub rows in group order using folded substrings.
 * The caller supplies translated titles and an empty query returns
 * no flat results. Use the grouped view for that state.
 *
 * Apply the hub's visibility and second-line rules to each result.
 * Finished rows remain navigable with their end date. Hidden areas
 * lose their navigation rows, while textSearch.ts still searches
 * the records they hold (ADR-0052).
 */
export function hubRowsMatching(
  reading: HubReading,
  query: string,
  titleOf: (key: HubRowKey) => string
): MatchedRow[] {
  const folded = foldText(query).trim();
  if (!folded) return [];
  const named = (spec: HubRow) => foldText(titleOf(spec.key)).includes(folded);

  const matches: MatchedRow[] = [];
  for (const section of hubSections(reading)) {
    for (const row of section.rows) if (named(row.spec)) matches.push({ ...row, where: section.key });
  }
  return matches;
}

/** A row a search found: the row as it is drawn, and the hub section it is
    drawn in.

    A flat list has no heading over a row to say which it was, so the row
    says it: a finished row found by name carries `finished`, which is what
    the heading it lost was saying, rather than the screen deciding that
    again from the line. */
export interface MatchedRow extends DrawnRow {
  where: HubSection['key'];
}

/** A section's own place in the flag's stripes, for whichever screen is
    colouring `hubSections`' output by role (`roleAt(activeFlag.roles, ...)`) -
    the More hub and, since phase 10 redesign ticket 22, onboarding's areas
    step, which draws the same sections while the person is still choosing
    what to pin.

    A section's place in the list rather than its place among whatever
    rendered, so Health keeps one stripe whether or not a finished group sits
    below it and whether or not hiding an area emptied a group above it. The
    finished set takes the index after the last group: it is set apart by its
    heading and by every row in it stating the day it ended, not by losing
    its colour. */
export function hubSectionRoleIndex(key: HubSection['key']): number {
  return key === 'finished' ? HUB_GROUP_KEYS.length : HUB_GROUP_KEYS.indexOf(key);
}

/** Which row fronts each finishable group's finish.

    The compile check above says every group is claimed; this says which row
    claimed it, and it is what catches the other half - two rows claiming one
    group, which the type system cannot see and which would leave the second
    row's finish moving nothing. `hubRows.test.ts` holds it against
    `AREA_GROUPS` rather than a module-level throw, because a bad row list is
    a coding error to fail a test on and not something to refuse to boot
    over. */
/* AREA_GROUP_ROW_KEYS stays exported for its own test, and cross-checked in
   AreaFinish.mounted.test.ts (AU-09 test-only review). */
export const AREA_GROUP_ROW_KEYS: Record<AreaGroupKey, HubRowKey> = Object.fromEntries(
  ROWS.filter((spec) => spec.finishes !== null).map((spec) => [spec.finishes, spec.key])
) as Record<AreaGroupKey, HubRowKey>;
