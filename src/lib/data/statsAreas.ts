/* Which areas the stats tab indexes, and in what order (phase 8 UX ticket 03,
   ADR-0056).

   The tab reads nine of the journal's sixty-four tables and has three
   link-outs. Twelve areas own a chart on their own screen and the tab has no
   idea those charts exist, so for somebody using most of the app the tab that
   promises to show them their data shows them a slice of it and does not say
   so.

   This is the index that fixes it, and it is a registry for the reason the
   four before it are (ADR-0027, ADR-0031): the alternative is a hand-written
   list a new area is silently missing from, with no test able to notice.

   Keyed by the More hub's own row, not by archive section. That is the one
   place this registry differs from `lastWrite.ts` next door, and it is not a
   drift: a person meets a screen, and two screens front two written areas
   each - hair progress is `hairStages` plus `hairPhotos`, and the voice
   screen holds benchmarks beside practice takes. `covers` is what makes
   "every written area is indexed" checkable rather than remembered, exactly
   the job `covers` does in `day.ts`, and `STATS_AREA_OPT_OUTS` below is where
   the two areas that are deliberately not cards write down why.

   What one entry declares - which is only what a card adds to a row, since
   phase 8 audit ticket 22:

     key      the More hub's row key, which is also the walkthrough handle,
              and which is `HubRowKey` rather than a string: a card naming no
              row does not compile
     group    which of the hub's four groups the card sits in - the same four
              in the same order, so a person learns one organising idea. The
              card's own, not the row's, which is the ticket's own scope
              line: the hub has a fifth group since ticket 02, `media`, and
              no card can sit in it because both media rows front content
              that travels inside an entry and has no last write to index
     covers   which `lastWrite.ts` areas this row fronts. A row appears when
              **any** of them has ever been written (ADR-0056's emptiness
              rule), because somebody can log hair stages for two years and
              never take a photograph, and an empty half is not an empty
              area. Also the card's own rather than the row's `areas`, and
              not for want of trying to derive it: `care` fronts no section
              at all while its card indexes the dose log, and the voice
              benchmark card deliberately covers half of what its row does

   Its icon, its route and its finishable group are the hub row's, read off
   by key. They used to be restated here, and drifted within the hour: the
   hub rows module landed while this one was being merged and left milestones
   on `flag`, the voice benchmark on `mic`, personal effects on `sparkle` and
   its href on a route that no longer exists - four wrong fields on a shipped
   screen out of one afternoon. A hand-written test comparing the two lists
   caught it, and a test whose whole job is to compare two hand-written lists
   is a module that is missing. This is that module's other half; the test is
   gone, and what it asserted is now a compile error.

   Which area's `hidden` flag takes a card out was the fifth restated field,
   and it is gone rather than read off the row: `areasHidden` (areaState.ts)
   asks it over the areas the card is already declared to cover. That is the
   same *rule* the hub applies to a row - every area behind the surface, or
   it stays - over inputs that are the card's own, so the card fronting an
   area the row does not (`care`) and the card covering half of what its row
   does (`voice-benchmark`) can still answer differently to their rows, on
   purpose.

   No wording here: this file is Node-tier safe and imports no paraglide
   (ADR-0016). The names live in `vocabulary/statsAreaLabels.ts`, the same
   split `areaLabels.ts` and `clinicianSummaryLabels.ts` keep.

   No reads here either, and no chart. The index draws a row per area and
   sends you to the screen that owns the drawing (Alicja, on the rendered
   screen: no graphs in this block, and the wear trend belongs on the wear
   tab). An earlier pass gave four of these areas a preview chart and it was
   the wrong trade - a second drawing of somebody's own data, to keep in
   agreement with the first, for a reading they get by tapping through. What
   the row owes is the fact the last-write seam already has: this area exists,
   here is when you last wrote in it. */

import { areasHidden, type AreaStates } from './areaState';
import { groupFinishedOn, groupSuspendedOn, type AreaGroupKey } from './areaGroups';
import { hubRow, rowScreen, type HubRowKey } from './hubRows';
import type { LastWriteKey } from './journal/lastWrite';

/** The More hub's four groups, in the More hub's order. */
type StatsAreaGroup = 'body' | 'health' | 'transition' | 'practice';

export const STATS_AREA_GROUPS = ['body', 'health', 'transition', 'practice'] as const satisfies readonly StatsAreaGroup[];

/** A card as the screen draws it: what the panel declared, plus the identity
    it read off its hub row. */
interface StatsAreaPanel {
  key: string;
  group: StatsAreaGroup;
  covers: readonly LastWriteKey[];
  finishes: AreaGroupKey | null;
  href: string;
  icon: string;
}

/** A card that fronts a hub row, which is fourteen of the sixteen. It
    declares its group and its areas; its icon, its route and its finishable
    group come off the row.

    Two things are load-bearing about this signature. `Key extends HubRowKey`
    is the one the ticket is named for: a card key matching no hub row is a
    compile error here, at the declaration, rather than a card drawn with a
    stale icon and a dead link until somebody rereads a cross-check test.

    `Covers` is a `const` parameter, the same reason `day.ts`'s own `section`
    declares one. Written as a plain `readonly LastWriteKey[]` it widens to
    every key, which makes `Covered` below the whole union, `Exclude` empty,
    and `STATS_AREA_OPT_OUTS` accept anything at all - a compile-time check
    that silently checks nothing while looking exactly like a working one.
    Proved by deleting a panel and watching the opt-out record demand its
    areas. */
function panel<Key extends HubRowKey, const Covers extends readonly LastWriteKey[]>(
  declared: { key: Key; group: StatsAreaGroup; covers: Covers }
) {
  return declared;
}

/** A card with no hub row behind it, which has to state the identity a row
    would have given it. Two of them, and `CARDS_WITHOUT_A_ROW` below is
    where each says why it is one.

    Carrying an icon of its own *is* what a rowless card is, so that is what
    separates the two declarations below, at the type level and at runtime
    alike - one predicate rather than a marker field beside it. */
function rowless<Key extends string, const Covers extends readonly LastWriteKey[]>(
  declared: {
    key: Key;
    group: StatsAreaGroup;
    covers: Covers;
    finishes: AreaGroupKey | null;
    href: string;
    icon: string;
  }
) {
  return declared;
}

/** A card that declares its own identity, which is a card with no hub row -
    the predicate `STATS_AREA_PANELS` and `RowlessKey` below both use. */
type Rowless = Extract<(typeof PANELS)[number], { icon: string }>;

const PANELS = [
  panel({ key: 'measurements', group: 'body', covers: ['measurements'] }),
  panel({ key: 'sizes', group: 'body', covers: ['sizeRecords'] }),
  panel({ key: 'hair-progress', group: 'body', covers: ['hairStages', 'hairPhotos'] }),
  panel({ key: 'hair-removal', group: 'body', covers: ['hairRemovalSessions'] }),
  /* The dose log, under the row that fronts four medication surfaces. The
     row itself fronts no archive section - what it says is what is behind
     it - so this is one of the two places a card's areas are its own rather
     than the row's. */
  panel({ key: 'care', group: 'health', covers: ['doseEvents'] }),
  rowless({
    key: 'labs',
    group: 'health',
    covers: ['labResults'],
    finishes: null,
    href: '/settings/labs',
    /* Not `flask`, which the hub already spends on dilation and which would
       sit two rows away in the same card. */
    icon: 'curve'
  }),
  panel({ key: 'cycle-events', group: 'health', covers: ['cycleEvents'] }),
  panel({ key: 'side-effects', group: 'health', covers: ['sideEffects'] }),
  panel({ key: 'surgery', group: 'health', covers: ['procedures'] }),
  panel({ key: 'dilation', group: 'health', covers: ['taperSessions'] }),
  panel({ key: 'milestones', group: 'transition', covers: ['milestones'] }),
  panel({ key: 'tryouts', group: 'transition', covers: ['tryouts'] }),
  panel({
    key: 'voice-benchmark',
    group: 'practice',
    /* Benchmarks only, where the row fronts both halves of the practice. A
       practice take is sealed until the day after it was taken and opts out
       of the last-write registry for that reason; asking this card when one
       was last taken would be a second way to meet its figures before the
       seal does. */
    covers: ['voiceBenchmarks']
  }),
  panel({ key: 'wear', group: 'practice', covers: ['wearSessions'] }),
  panel({ key: 'effects', group: 'practice', covers: ['personalEffects'] }),
  rowless({
    key: 'tally',
    group: 'practice',
    covers: ['tallyEvents'],
    finishes: null,
    href: '/tally',
    icon: 'columns'
  })
] as const;

/** Every row the index draws, as a literal union - so
    `vocabulary/statsAreaLabels.ts` is a full `Record` over the real keys and
    a card added without a name is a typecheck failure. */
export type StatsAreaKey = (typeof PANELS)[number]['key'];

/** The panels, resolved against the hub and with their keys still literal.
    Typed `readonly StatsAreaPanel[]` they came out as `key: string`, so a
    screen comparing against a misspelled key compiled and matched nothing. */
/* STATS_AREA_PANELS stays exported only for its own test (AU-09 test-only
   review). */
export const STATS_AREA_PANELS: readonly (StatsAreaPanel & { key: StatsAreaKey })[] = PANELS.map(
  (declared) => {
    if ('icon' in declared) return declared;
    const row = hubRow(declared.key);
    return {
      ...declared,
      finishes: row.finishes,
      /* `rowScreen`, not the row's whole href: the one row carrying a query
         string points at its own tab (the voice benchmark's), which is the
         row's business rather than the card's. Both mean the same screen. */
      href: rowScreen(row),
      icon: row.icon
    };
  }
);

/* A rowless card may not take a key the hub already fronts: two cards would
   draw under one handle, and the one keyed by the row would be the copy
   ignoring it. Demonstrated by keying the tally card `wear` and watching
   `Shadowing` stop being `never` - the shape `hubRows.ts` uses for the other
   direction of the same join. */
type Shadowing = Extract<Rowless['key'], HubRowKey>;
type AssertNoneShadowing<Shadowed extends never> = Shadowed;
type NoRowlessCardShadowsARow = AssertNoneShadowing<Shadowing>;

/** Every card with no hub row behind it, and why - the full `Record` over
    whatever `PANELS` declares that the hub does not front, the shape
    `LAST_WRITE_WITHOUT_A_ROW` and `STATS_AREA_OPT_OUTS` both use. Two of
    them, and the positive claim the pair makes writable is the one this
    module exists for: every other stats card points at a screen the hub
    already knows about, as a compile error rather than as a grep. */
/* CARDS_WITHOUT_A_ROW stays exported only for its own test (AU-09 test-only
   review). */
export const CARDS_WITHOUT_A_ROW: Record<Exclude<StatsAreaKey, HubRowKey>, string> = {
  labs: 'behind the care row, which fronts four medication surfaces at once',
  tally: 'its own tab, and never a row on the hub'
};

/** Every written area that deliberately has **no** card, and why - the full
    `Record` over whatever `PANELS` above does not cover, the shape
    `LAST_WRITE_OPT_OUTS` and `DAY_OPT_OUTS` both use. An area registered in
    `lastWrite.ts` and not indexed here is a compile error until somebody
    either gives it a card or writes down why it has none. */
type Covered = (typeof PANELS)[number]['covers'][number];

/* STATS_AREA_OPT_OUTS stays exported only for its own test (AU-09 test-only
   review). */
export const STATS_AREA_OPT_OUTS: Record<Exclude<LastWriteKey, Covered>, string> = {
  /* The whole cross-area block above the index is the entries. A card
     sending somebody to the journal to see their entries charted, under a
     screen that has just charted them six ways, is the index describing
     itself. */
  entries: 'the cross-area block is the entries',
  /* A visit is a date somebody was given, not a practice with a cadence of
     their own, so there is no shape here to chart and a count of them would
     be a figure about how often they can get an appointment. */
  appointments: 'dates somebody else set; a count of them measures access, not the person',
  /* No screen browses felt sense on its own: a felt-sense history hangs off
     the tryout or the milestone it was logged against, and a card here would
     have nowhere to send anybody. The gap is recorded, not filled. */
  feltSenseEntries: 'no screen owns it; it hangs off the tryout or milestone it was logged against',
  /* Phase 8 features ticket 52. The index is a place to look at what a
     stream has accumulated, and a document is not a stream: the app never
     reads one (ADR-0065), draws nothing from a set of them and has nothing
     to chart. A card counting somebody's diagnoses would also be the one
     figure in the app nobody asked for. */
  documents: 'nothing about a set of documents is a figure; the app never reads what is in them'
};

/** One card the screen will draw: the panel, and the two dated facts the
    seams supply about it. */
export interface StatsAreaCard {
  panel: StatsAreaPanel & { key: StatsAreaKey };
  /** The most recent write anywhere in the row, which is never null here -
      a row with nothing written has no card. */
  lastWriteEpochDay: number;
  /** The day the person said this stream ended, or null while it has not. */
  finishedEpochDay: number | null;
  /** The day the person paused this stream, or null while it is active or
      finished (phase 8 features ticket 51). */
  suspendedEpochDay: number | null;
}

/** The cards to draw, in declaration order, which is the hub's group order.

    ADR-0056's emptiness rule, in one function: a card appears where the row
    has ever been written and is not hidden. A finished row keeps its card and
    carries its end day, because finishing is a statement about a practice
    rather than a delete.

    Pure over already-fetched state - one `getLastWrites` call answers for
    every area at once - so an area with no data costs no second read and the
    Node tier can test the rule with no driver at all. */
export function statsAreaCards(
  lastWrites: Partial<Record<LastWriteKey, number | null>>,
  states: AreaStates
): StatsAreaCard[] {
  const cards: StatsAreaCard[] = [];
  for (const panel of STATS_AREA_PANELS) {
    /* The areas the card is already about, asked the hub's own way: a card
       goes when every area behind it has gone, and one whose other half is
       still shown stays. `cycleEvents` cannot be hidden at all (ADR-0043),
       so the cycle card is structurally unhideable rather than carrying a
       null of its own. */
    if (areasHidden(panel.covers, states)) continue;

    let latest: number | null = null;
    for (const area of panel.covers) {
      const day = lastWrites[area] ?? null;
      if (day !== null && (latest === null || day > latest)) latest = day;
    }
    if (latest === null) continue;

    cards.push({
      panel,
      lastWriteEpochDay: latest,
      finishedEpochDay: panel.finishes === null ? null : groupFinishedOn(panel.finishes, states),
      suspendedEpochDay: panel.finishes === null ? null : groupSuspendedOn(panel.finishes, states)
    });
  }
  return cards;
}

/** The cards of one group, for a screen that lays the four out under their own
    headings. Empty where the person uses nothing in that group, and the
    heading goes with it. */
export function cardsInGroup(cards: readonly StatsAreaCard[], group: StatsAreaGroup): StatsAreaCard[] {
  return cards.filter((card) => card.panel.group === group);
}
