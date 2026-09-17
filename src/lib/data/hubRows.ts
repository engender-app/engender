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
               assembled read `journal/lastWrite.ts` answers with. Fourteen
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
       than a special case. ADR-0043's *positive* gate used to be written out
       here as a named special case beside it; ticket 16 hosted the cycle row
       on /health/side-effects, which was already asking that question for
       the cycle block it draws, so the gate is that screen's alone and this
       file has no special case left. Ticket 13 moved the cycle block again,
       onto /care/changes with the rest of what side effects
       screen drew - the gate travelled with it rather than being restated.
     - the finished group, and the day it shows.

   Phase 9 carpet ticket 16 added a fourth: where a row is drawn. A row's
   `home` is one of the hub's groups or one of the screens in `HUB_ROW_HOSTS`,
   and four of the twenty now name a screen - five until ticket 13 folded
   `side-effects` into `effects` rather than moving it to a new home. This
   file stays the registry for all of them either way, which is the point of
   holding the field here rather than deleting the rows that left: `finishes`
   still has to be claimed by exactly one row and the last-write registry
   still has to be fronted or opted out of. A row that moved screens moved
   one field.

   `statsAreas.ts` used to read a card's icon and route off a row the same
   way, as a second enumeration of areas beside this one. Phase 10 redesign
   ticket 12 deleted it - nothing had rendered it since ticket 99 item 36 took
   the area index off the stats tab - so this file is now the only one.

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
import { foldText } from './fold';
import type { ArchiveSectionName } from './journal/archiveSections';
import { LAST_WRITE_ENTRIES, type LastWriteKey } from './journal/lastWrite';
import { ROW_FORWARD_KEYS, type RowForward, type RowForwardKey, type RowForwardMap } from './rowForward';

/** The hub's groups, in the order they are drawn.

    `media` came in with phase 8 UX ticket 02: photos and voice memos are both
    things attached to an entry rather than series of their own, and they used
    to sit one in Body and one in Practice with nothing saying they were the
    same kind of thing.

    A video note is found in the photo library rather than on a browse screen
    of its own (phase 11 ticket 14, ADR-0085), so this group stays at two
    rows. Ticket 02 recorded the gap instead of filling it and the audit of
    15 September 2026 named it again; what closed it was a sixth source in a
    list that already existed, not a third row here.

    `practice` is gone and `support` is new, both from phase 9 carpet ticket
    16. Practice had become the group for whatever was not body, health,
    transition or media: a voice benchmark, a wear log, an entry template, a
    resource list and Safe Space, which is five answers to five different
    questions. Its rows went to the groups they were always about, and the two
    that are about somebody needing help rather than tracking anything got a
    group that says so.

    `body` is gone (audit item 10). It had been one row - measurements and
    sizes - under a heading, so the door paid a heading's height and a
    group's gap to say "Body" once and then say "Measurements and sizes",
    which is the same fact at two sizes. The row is in `health` now, beside
    the other readings somebody takes of themselves, and the door shows two
    more rows on arrival for it. Four groups is the floor here rather than a
    target: the audit's own warning is that the answer is not fewer, deeper
    rows - /care earned its depth by opening on five live reads and no other
    group has the equivalent. */
/* hub_screen_title (messages/*.json) names these four by hand for the
   hub's own hidden screen title - add, rename or reorder a group here and
   that string goes stale until it's edited too (ticket 08). */
export const HUB_GROUP_KEYS = ['health', 'transition', 'support', 'media'] as const;

export type HubGroupKey = (typeof HUB_GROUP_KEYS)[number];

/** The screens that draw a row of their own, and where each one lives.

    Phase 9 carpet ticket 16's other half. Seven rows left the hub without
    their screens going anywhere: dilation belongs to a surgery journey rather
    than beside it, side effects and hair progress are both changes somebody
    noticed, cycle events are read next to the side effects they sit among,
    templates are how you write an entry and words are a reading of what you
    wrote. A hub that lists all of them at the top level is a hub that has
    stopped ranking anything.

    Two of those seven have since stopped being rows at all, and by two
    different routes. Redesign ticket 51 took entry templates to Settings: a
    reference area (ADR-0084) is managed there rather than hosted, so its row
    left this map the way modes left the Transition group outright, onto a
    plain row Settings writes out itself. Redesign ticket 62 took the words
    row off outright - the reading draws on the Look back door itself now
    (`WordsReading.svelte`), so there is no second screen for a row to open,
    and `stats` stopped being a host with it.

    A third route took a fourth off, and it is the one that shrank the host
    map itself rather than just a row in it. Phase 11 all-four-doors ticket
    13 put side effects on the same axis and the same screen as the changes
    somebody was hoping for (rule 16's new strip-versus-axis paragraph): the
    `side-effects` row is not hosted anywhere any more because it is not a
    screen of its own to link to, and `/health/side-effects` is a redirect
    stub. Three hosts for four rows now, keyed by the row key of the screen
    that hosts them where there is one and by the tab otherwise. What this
    map is for is naming the one screen that owes each row its link, which is
    what `more-surfaces.test.ts` holds them to - a hosted row whose host
    forgot it is a screen nothing reaches.

    Three of the four are drawn by `HostedRows.svelte`, which reads
    `rowsHostedBy` below. `cycle-events` is the exception and stays written by
    hand, now on /care/changes (it moved there with the rest of
    what /health/side-effects drew): it sits inside a block that screen
    already gates on `cycleTrackingVisible`, its way-in row carries copy
    about the chart behind it rather than the standing line, and
    `cycleEvents` is the one area no `hidden` flag can reach (ADR-0043), so
    the rule the component exists to apply has nothing to do there -
    `HostedRows.svelte` excludes it by key for the same reason, now that it
    shares a host with a row the component does draw.

    Eras never was one of the seven - it kept a plain row in the Transition
    group until redesign ticket 16 (ADR-0084) found it a reference area too,
    spent on seven other screens and created on exactly one. It left `ROWS`
    entirely, the way words did: the milestone rail is the one place under
    Transition an era is still drawn, as a band rather than a row. */
export const HUB_ROW_HOSTS = {
  care: '/care',
  effects: '/care/changes',
  surgery: '/health/surgery'
} as const;

export type HubRowHostKey = keyof typeof HUB_ROW_HOSTS;

/* A host may not be named the same as a group, or `hubSections` would bucket
   a hosted row into a group whose heading it has never had. Demonstrated by
   renaming `care` above to `health` and watching `Ambiguous` stop being
   `never`. */
type Ambiguous = Extract<HubRowHostKey, HubGroupKey>;
type AssertNoneAmbiguous<Both extends never> = Both;
type NoHostSharesAGroupName = AssertNoneAmbiguous<Ambiguous>;

/** Where a row is drawn: one of the hub's own groups, or the screen that
    draws it instead of the hub. */
export type HubRowHome = HubGroupKey | HubRowHostKey;

/** Whether a row is drawn on the hub at all. */
export function isHubGroup(home: HubRowHome): home is HubGroupKey {
  return (HUB_GROUP_KEYS as readonly string[]).includes(home);
}

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
  /** Which of the hub's groups draws the row, or which screen draws it
      instead of the hub. */
  home: HubRowHome;
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

/** Every row, in the order each group draws them, and then the rows that no
    group draws.

    Icons: three pairs were duplicated - the two voice-ish rows both `mic`,
    roadmap and resources both `globe`, milestones and surgery both `flag` -
    and the repo's own rule is that two identical icons read as one row drawn
    twice. All three are resolved, and the test refuses a duplicate anywhere
    rather than only where two happen to be adjacent.

    The order within each group is phase 9 carpet ticket 16's, which is where
    the group lists themselves come from. Two of its orderings are worth
    knowing about because the ticket did not settle them:

      - hair removal is not on the ticket's Transition list at all. Alicja
        put it in Transition, and it sits after the wear log because those
        two are the group's dated practice logs and everything after them is
        a plan or a letter.
      - the hosted rows are declared last, in the order their hosts appear
        above, so reading this list top to bottom is reading the hub and then
        reading what came off it. */
const ROWS = [
  // --- Health --------------------------------------------------------------
  {
    /* Two areas behind one row since phase 10 redesign ticket 61, the
       shape `hair-progress` has always had. Sizes were a row of their own
       pointing at a purchase log with no reading on it, next door to the
       one screen in Body that had a chart, a scrub and a protocol card -
       two halves of one question about the same body, split. The row
       reports whichever half was written last, and reads finished only
       when both are.

       In Health since audit item 10, and first in it: it was the whole of
       the Body group, which cost a heading to say "Body" over a row that
       says "Measurements and sizes". A reading somebody takes of their own
       body sits among the other readings rather than in a group of one. */
    key: 'measurements',
    icon: 'ruler',
    href: '/body/measurements',
    home: 'health',
    areas: ['measurements', 'sizeRecords'],
    finishes: 'measurements',
    line: 'read'
  },
  {
    /* Deepening ticket 07 put labs, the regimen, the hormone curve and the
       dose log behind this one row, and what earned that tap is that /care
       opens on a live read of each. It fronts no area of its own, so there is
       nothing here for a hidden-area rule to act on and nothing whose last
       write would not already be on the screen behind it.

       Ticket 16 gave it a fifth thing: the changes somebody has noticed,
       hosted below. */
    key: 'care',
    icon: 'timeline',
    href: '/care',
    home: 'health',
    areas: [],
    finishes: null,
    line: 'written'
  },
  {
    key: 'surgery',
    icon: 'flag',
    href: '/health/surgery',
    home: 'health',
    areas: ['procedures'],
    finishes: null,
    line: 'read'
  },
  {
    /* Renamed from `appointment-prep` by ticket 57 rather than joined by a
       second row: prep, the record and the debrief were three descriptions
       of one thing, and the one that names it is the one that stays
       (ADR-0066). Keeps `check` - no new icon. */
    key: 'appointments',
    icon: 'check',
    href: '/health/appointments',
    home: 'health',
    areas: ['appointments'],
    finishes: null,
    line: 'read'
  },
  // --- Transition ----------------------------------------------------------
  {
    /* `sparkle` rather than the `flag` it shared with the surgery journey. A
       flag is planted on a map, which is what a surgery journey has: one
       dated event and a recovery window either side of it. */
    key: 'milestones',
    icon: 'sparkle',
    href: '/transition/milestones',
    home: 'transition',
    areas: ['milestones'],
    finishes: null,
    line: 'read'
  },
  {
    key: 'tryouts',
    icon: 'tag',
    href: '/transition/tryouts',
    home: 'transition',
    /* The tryout photos only, which is the registry's own bound: a tryout's
       start and end are a span, and its felt-sense history is
       `feltSenseEntries`, which belongs to a milestone just as much and is
       fronted by no row (see `LAST_WRITE_WITHOUT_A_ROW`). */
    areas: ['tryouts'],
    finishes: null,
    line: 'read'
  },
  {
    /* `curve` still, from when this fronted the benchmark alone: a line over
       takes is still most of what is behind the row, and the recordings
       ticket 17 folded in here keep `mic` on the screen's own Recordings
       tab rather than taking the row's icon with them. */
    key: 'voice-benchmark',
    icon: 'curve',
    /* No `?tab=record`: the flow's own tab is already the screen's default,
       so the two addresses opened on the same tab (ticket 17). */
    href: '/voice',
    home: 'transition',
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
  {
    key: 'wear',
    icon: 'clock',
    href: '/body/wear',
    home: 'transition',
    areas: ['wearSessions'],
    finishes: 'wear',
    line: 'read'
  },
  {
    key: 'hair-removal',
    icon: 'shuffle',
    href: '/body/hair-removal',
    home: 'transition',
    areas: ['hairRemovalSessions'],
    finishes: 'hair-removal',
    line: 'read'
  },
  {
    /* Keeps `globe`, which resources gave up: a roadmap is the closest thing
       in the icon set to a map, and support and resources is a list of places
       outside the app rather than a route through it. */
    key: 'roadmap',
    icon: 'globe',
    href: '/transition/roadmap',
    home: 'transition',
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
    home: 'transition',
    /* Sealed until its unlock day, which is why the registry has no last
       write for it - asking when one was last written is a second way to
       meet it before the seal does. So this row states what it is. */
    areas: ['letters'],
    finishes: null,
    line: 'written'
  },
  // --- Support -------------------------------------------------------------
  {
    key: 'doubt',
    icon: 'heart',
    href: '/doubt',
    home: 'support',
    /* ADR-0037/0040: a Safe Space artefact is not a diary record with a day
       to report a gap about, which is the registry's own wording for why
       neither of these has a last write. */
    areas: ['counterevidenceSnapshots', 'comfortItems'],
    finishes: null,
    line: 'written'
  },
  {
    /* `info` rather than the `globe` it shared with the roadmap. */
    key: 'resources',
    icon: 'info',
    href: '/support/resources',
    home: 'support',
    areas: [],
    finishes: null,
    line: 'written'
  },

  // --- Media ---------------------------------------------------------------
  {
    /* Fronts content that travels inside an entry rather than a stream of
       its own, so it has no section in the archive to ask about and cannot
       carry a reading. What it gets instead is a line saying what is in it.

       Voice memos shared this shape and this group until ticket 17 folded
       their browse screen into the voice screen's own Recordings tab -
       `/media/voice/memos` redirects there now, and what fronts a
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
    home: 'media',
    areas: ['documents'],
    /* Paper keeps arriving - `NOT_FINISHABLE`'s own reason for this area
       (areaState.ts). There is no group to front. */
    finishes: null,
    line: 'read'
  },

  // --- Drawn on another screen rather than on the hub (ticket 16) ----------
  {
    /* `eye` rather than `sparkle`, which milestones took: what this screen
       asks is when you first *noticed* each change, and the route and the
       title both say so now (see `personal-effects`).

       Under /care because a change you noticed is what a regimen is for.
       The hormones list above it says what is going in; this says what
       came of it.

       Two sections, one row, since ticket 13: a side effect and a change you
       were hoping for are both something you noticed after starting a
       regimen, and having them as sibling top-level rows made the reader
       classify their own symptom before they could write it down. The row
       reports whichever half was written last (`groupLastWrite`'s own
       reasoning), the way `hair-progress` already does for its own two. */
    key: 'effects',
    icon: 'eye',
    href: '/care/changes',
    home: 'care',
    areas: ['personalEffects', 'sideEffects'],
    finishes: 'effects',
    line: 'read'
  },
  {
    key: 'hair-progress',
    icon: 'comb',
    href: '/body/hair-progress',
    home: 'effects',
    /* Two sections, one row: the stagings and the photographs finish
       together and the row reports whichever of them was written last
       (`groupLastWrite`'s own reasoning - somebody can log stages for two
       years and never photograph one). */
    areas: ['hairStages', 'hairPhotos'],
    finishes: 'hair-progress',
    line: 'read'
  },
  {
    /* ADR-0043: the one row that has to be able to not exist, and the one
       area no `hidden` flag may reach. Its absence is `cycleTrackingVisible`'s
       to decide - an active testosterone regimen or the explicit opt-in -
       which is a positive gate rather than a hide, and `cycleEvents` being
       outside `HideableArea` is what stops this file reversing it.

       Ticket 16 took the row off the hub, and the gate went with it rather
       than being weakened: /health/side-effects drew a cycle block behind
       `cycleTrackingVisible`, and that block's own way in was the only one.
       Ticket 13 moved the block again, onto /care/changes with
       the rest of what that screen drew, so this row's home moved with it -
       the gate itself is untouched, and the hub still cannot show a cycle
       prompt at all. */
    key: 'cycle-events',
    icon: 'calendar',
    href: '/health/cycle-events',
    home: 'effects',
    areas: ['cycleEvents'],
    finishes: null,
    line: 'read'
  },
  {
    key: 'dilation',
    icon: 'flask',
    href: '/health/dilation',
    home: 'surgery',
    /* The sessions, not the schedule. `taper` is what was meant to happen
       and opts out of the last-write registry for the reason a dose schedule
       does; `taperSessions` is the practice, and the practice is what ends. */
    areas: ['taperSessions'],
    finishes: 'dilation',
    line: 'read'
  }
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
   feature-screens.test.ts, home-surfaces.test.ts, more-surfaces.test.ts,
   safe-space-surfaces.test.ts (AU-09 test-only review). */
export const HUB_ROWS: readonly HubRow[] = ROWS;

const ROWS_BY_KEY = new Map<HubRowKey, HubRow>(ROWS.map((row) => [row.key, row]));

/** One row, by key. Total over `HubRowKey` and returning a `HubRow` rather
    than `HubRow | undefined`, which is what makes a second surface able to
    read a screen's identity off the row instead of restating it: `HostedRows`
    is keyed by this type, and a hosted row naming no key does not compile. */
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
/* rowReads stays exported only for its own test (AU-09 test-only review). */
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
  | { kind: 'suspended'; epochDay: number }
  /** What is running, what is next, or a last value - `rowForward.ts`'s
      three kinds, taken whole rather than restated (phase 11 all-four-doors
      ticket 02, DIRECTION.md rule 16). Six shapes became nine, and the four
      past-tense ones above now speak only where a row has nothing forward to
      say. */
  | RowForward;

/** Everything the hub reads, so nothing below asks for itself.

    Two reads, not three. ADR-0043's positive gate used to be here as a
    `cycleShown` the screen fetched an episode list to answer, because the
    cycle row was a row on the hub that had to be able to not exist. Ticket 16
    moved that row onto /health/side-effects, which was already asking
    `cycleTrackingVisible` for the cycle block it draws, so the gate is that
    screen's alone now and the hub reads nothing to support it.

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
      none - `voice-benchmark`'s own second read (ticket 17).

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
    `rowFinishedOn`'s own rule, read off `groupSuspendedOn` instead (phase 8
    features ticket 51). */
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

/** What one row says under its title.

    Four questions in order, and the order is the whole of the rule (phase
    11 all-four-doors ticket 02, DIRECTION.md rule 16).

    **Finished and suspended come first**, unchanged. A row the person has
    said is over does not announce what is next in it: the statement they
    made about the practice outranks anything still dated inside it, and a
    finished area with a stale appointment in it would otherwise read as
    though it were still running.

    **Then a forward fact beats a last write.** This is the ticket's own
    choice rule, and it is what the rows on the Transition door were getting
    wrong: "Nothing logged for 1 year 4 months" printed over a name-change
    hearing sixteen days out. Which of a running span and a dated future
    wins is settled one layer down, per row, by `rowForward.ts` - it hands
    back one fact, so nothing here has to rank two.

    The forward fact also beats `no-stream`, which is why this sits above
    the `written` check rather than below it. Two of the eight rows that
    face forwards report no reading at all - Care fronts no archive section,
    and a letter is sealed until its day - and a standing sentence about
    what is behind the row is exactly what a dated future should replace.

    **Then the reading it always had**, unchanged: what was last written,
    worded as an observation once a whole quiet window has passed. */
/** The later of two nullable days, or null where neither has one - `voice-
    benchmark`'s own fold of a registry read and its second, non-registry
    read (the field's own doc on `HubReading`). */
function laterEpochDay(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

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
  return { kind: daysAgo >= FINISH_SUGGESTION_QUIET_DAYS ? 'quiet' : 'last', epochDay, daysAgo };
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

/** The hub, assembled: every group in order with its rows, then the finished
    set, with empty sections left out.

    A finished row leaves its own group rather than appearing twice - it is
    still one tap away and its screen still works, which is the whole point of
    an area ending rather than being deleted.

    A hosted row is not here at all, finished or not (ticket 16). It stays on
    the screen named by its `home`, and states its ending there: the
    alternative is the hub adding it to the finished set while its host still
    draws it, which is the appearing-twice the paragraph above is about. Four
    of the nine finishable groups are hosted, so the finished set is a smaller
    place than it was - and `HostedRows.svelte` draws those four through
    `rowLine`, the same function this one calls, so a hosted row says what
    ended and when in the same words the hub would have used. */
export function hubSections(reading: HubReading): HubSection[] {
  const byKey = new Map<HubGroupKey | 'finished', HubSection['rows']>();
  for (const key of [...HUB_GROUP_KEYS, 'finished'] as const) byKey.set(key, []);

  for (const spec of HUB_ROWS) {
    if (!isHubGroup(spec.home)) continue;
    if (rowHidden(spec, reading.states)) continue;
    const line = rowLine(spec, reading);
    byKey.get(line.kind === 'finished' ? 'finished' : spec.home)!.push({ spec, line });
  }

  return [...byKey].filter(([, rows]) => rows.length > 0).map(([key, rows]) => ({ key, rows }));
}

/** The rows whose name contains what somebody typed, flat: the hub's own in
    the order its groups draw them, then the rows drawn on a screen of their
    own (phase 10 redesign ticket 15).

    All twenty of them - twenty-five until redesign ticket 51 moved
    modes and entry templates off the registry entirely and into Settings
    (ADR-0084), twenty-four until ticket 59 deleted the clinician-summary
    row outright rather than hosting it, since it fronts no area,
    twenty-three until ticket 62 took the words row off with the screen it
    opened, twenty-one until ticket 13 folded `side-effects` into `effects`
    rather than giving it a row of its own, and twenty until ticket 16
    took eras off the same way ticket 62 did. The four hosted rows still
    here are not on this screen and are still areas of this app: somebody
    looking for dilation or hair progress looks for them here, and leaving
    them out would make the one index with a search box the one place they
    cannot be found. A match draws the row the registry declares -
    the same row its host screen draws - and following it lands on the
    area's own screen rather than on the host.

    Assembled here rather than filtered out of `hubSections`' output, so the
    three rules about a row's existence hold for both halves in one place: a
    hidden area cannot be searched up, a finished one can and states the day
    it ended, and every match carries the second line its section would have
    given it.

    The hidden half of that is navigation, not search, and ADR-0052 draws the
    line where this does: "hiding takes an area out of the navigation" and
    "a hidden or finished area stays searchable, because a search that stops
    finding things a person wrote" is the risk the whole idea carries. What
    this function answers is which of the door's *rows* a word reaches, and a
    hidden area has no row anywhere; the records inside it are the other half
    of the door's search and are not filtered by any of this
    (`textSearch.ts`), so nothing somebody wrote goes missing.

    The titles are handed in, not resolved: they are paraglide's and nothing
    the Node tier touches may import that (ADR-0016). `tagIdsMatching` takes
    the labels a screen showed for exactly the same reason, and this matches
    the way that one does - a folded substring, over twenty-odd short strings
    already in memory. Not the entry index's whole-token prefix rule: an area
    is found by any part of its name, so "log" reaches the size log and the
    wear log both.

    An empty query matches nothing rather than everything, because the screen
    shows the grouped list for an empty box; a flat copy of every row would
    be the same list twice. */
/** The one row a search by name may not reach, and why.

    ADR-0043: whether the cycle row exists at all is not this file's to say.
    `cycleEvents` is outside `HideableArea` precisely so that nothing here
    can reverse the decision, and the row's *positive* gate - an active
    testosterone regimen or an explicit opt-in - belongs to
    /care/changes, which is the only screen that asks. A search
    that answered "Cycle events" to somebody the app has decided not to ask
    about cycles would put that prompt back on the hub through the box, which
    is exactly what ticket 16 took off it.

    Named here rather than left to fall out of a rule, because every rule
    that would exclude it also excludes something that should be found: the
    row fronts one area, and that area is not hideable. */
const NOT_SEARCHABLE: readonly HubRowKey[] = ['cycle-events'];

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
  for (const spec of HUB_ROWS) {
    if (isHubGroup(spec.home)) continue;
    if (NOT_SEARCHABLE.includes(spec.key)) continue;
    if (rowHidden(spec, reading.states)) continue;
    if (!named(spec)) continue;
    matches.push({ spec, line: rowLine(spec, reading), where: spec.home });
  }
  return matches;
}

/** A row a search found: the row as it is drawn, and where it is drawn -
    one of the hub's sections, or the screen that hosts it.

    A flat list has no heading over a row to say which it was, so the row
    says it: a finished row found by name carries `finished`, which is what
    the heading it lost was saying, rather than the screen deciding that
    again from the line. */
export interface MatchedRow extends DrawnRow {
  where: HubSection['key'] | HubRowHostKey;
}

/** A section's own place in the flag's stripes, for whichever screen is
    colouring `hubSections`' output by role (`roleAt(activeFlag.roles, ...)`) -
    the More hub and, since phase 10 redesign ticket 22, onboarding's areas
    step, which draws the same sections while the person is still choosing
    what to pin.

    A section's place in the list rather than its place among whatever
    rendered, so Body keeps one stripe whether or not a finished group sits
    below it and whether or not hiding an area emptied a group above it. The
    finished set takes the index after the last group: it is set apart by its
    heading and by every row in it stating the day it ended, not by losing
    its colour. */
export function hubSectionRoleIndex(key: HubSection['key']): number {
  return key === 'finished' ? HUB_GROUP_KEYS.length : HUB_GROUP_KEYS.indexOf(key);
}

/** The rows one screen hosts, in declaration order.

    `hubSections`' counterpart for the other side of `home`, and the reason
    the two are worth one function each rather than one filter at five call
    sites: what a host owes its rows is the same thing the hub owes them -
    a row goes when every area behind it is hidden, and states the day the
    person said it ended. `HostedRows.svelte` reads this and applies
    `rowHidden` and `rowLine` over the area record, so the rule lives once -
    except for `cycle-events`, which that component excludes by key and
    /care/changes draws by hand instead (ADR-0043). */
export function rowsHostedBy(host: HubRowHostKey): HubRow[] {
  return HUB_ROWS.filter((row) => row.home === host);
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
