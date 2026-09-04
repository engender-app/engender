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

   What one entry declares:

     key      the More hub's row key, which is also the walkthrough handle
     group    which of the hub's four groups the card sits in - the same four
              in the same order, so a person learns one organising idea
     covers   which `lastWrite.ts` areas this row fronts. A row appears when
              **any** of them has ever been written (ADR-0056's emptiness
              rule), because somebody can log hair stages for two years and
              never take a photograph, and an empty half is not an empty area
     hides    the area whose `hidden` flag takes the row out, or null where
              the row cannot be hidden. `cycleEvents` is the null: ADR-0043
              owns its visibility one-directionally and `HideableArea`
              excludes it by construction
     finishes the `areaGroups.ts` group whose end day the card draws, or null
              where the row is not finishable. A finished area is not an empty
              area: its records are there and its card belongs
     href     the screen that owns the full chart
     icon     the hub row's own icon, so the two surfaces agree

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

import { areaHidden, type AreaStates, type HideableArea } from './areaState';
import { groupFinishedOn, type AreaGroupKey } from './areaGroups';
import type { LastWriteKey } from './journal/lastWrite';

/** The More hub's four groups, in the More hub's order. */
export type StatsAreaGroup = 'body' | 'health' | 'transition' | 'practice';

export const STATS_AREA_GROUPS = ['body', 'health', 'transition', 'practice'] as const satisfies readonly StatsAreaGroup[];

export interface StatsAreaPanel {
  key: string;
  group: StatsAreaGroup;
  covers: readonly LastWriteKey[];
  hides: HideableArea | null;
  finishes: AreaGroupKey | null;
  href: string;
  icon: string;
}

/** Keeps the declaration site honest: `covers` has to name real last-write
    areas, and both it and the key stay literal on the way out.

    `Covers` is a `const` parameter and that is the whole load-bearing part,
    the same reason `day.ts`'s own `section` declares one. Written as a plain
    `readonly LastWriteKey[]` it widens to every key, which makes `Covered`
    below the whole union, `Exclude` empty, and `STATS_AREA_OPT_OUTS` accept
    anything at all - a compile-time check that silently checks nothing while
    looking exactly like a working one. Proved by deleting a panel and
    watching the opt-out record demand its areas. */
function panel<Key extends string, const Covers extends readonly LastWriteKey[]>(
  declared: Omit<StatsAreaPanel, 'key' | 'covers'> & { key: Key; covers: Covers }
) {
  return declared;
}

const PANELS = [
  panel({
    key: 'measurements',
    group: 'body',
    covers: ['measurements'],
    hides: 'measurements',
    finishes: 'measurements',
    href: '/settings/measurements',
    icon: 'ruler'
  }),
  panel({
    key: 'sizes',
    group: 'body',
    covers: ['sizeRecords'],
    hides: 'sizeRecords',
    finishes: 'sizes',
    href: '/settings/sizes',
    icon: 'package'
  }),
  panel({
    key: 'hair-progress',
    group: 'body',
    covers: ['hairStages', 'hairPhotos'],
    hides: 'hairStages',
    finishes: 'hair-progress',
    href: '/settings/hair-progress',
    icon: 'comb'
  }),
  panel({
    key: 'hair-removal',
    group: 'body',
    covers: ['hairRemovalSessions'],
    hides: 'hairRemovalSessions',
    finishes: 'hair-removal',
    href: '/settings/hair-removal',
    icon: 'shuffle'
  }),
  panel({
    key: 'care',
    group: 'health',
    covers: ['doseEvents'],
    hides: 'doseEvents',
    finishes: null,
    href: '/care',
    icon: 'timeline'
  }),
  panel({
    key: 'labs',
    group: 'health',
    covers: ['labResults'],
    hides: 'labResults',
    finishes: null,
    href: '/settings/labs',
    /* Not `flask`, which the hub already spends on dilation and which would
       sit two rows away in the same card. */
    icon: 'curve'
  }),
  panel({
    key: 'cycle-events',
    group: 'health',
    covers: ['cycleEvents'],
    /* ADR-0043: cycle tracking's visibility is its own one-directional
       question and `HideableArea` cannot name it. */
    hides: null,
    finishes: null,
    href: '/settings/cycle-events',
    icon: 'calendar'
  }),
  panel({
    key: 'side-effects',
    group: 'health',
    covers: ['sideEffects'],
    hides: 'sideEffects',
    finishes: 'side-effects',
    href: '/settings/side-effects',
    icon: 'zap'
  }),
  panel({
    key: 'surgery',
    group: 'health',
    covers: ['procedures'],
    hides: 'procedures',
    finishes: null,
    href: '/settings/surgery',
    icon: 'flag'
  }),
  panel({
    key: 'dilation',
    group: 'health',
    covers: ['taperSessions'],
    hides: 'taperSessions',
    finishes: 'dilation',
    href: '/settings/dilation',
    icon: 'flask'
  }),
  panel({
    key: 'milestones',
    group: 'transition',
    covers: ['milestones'],
    hides: 'milestones',
    finishes: null,
    href: '/settings/milestones',
    icon: 'flag'
  }),
  panel({
    key: 'tryouts',
    group: 'transition',
    covers: ['tryouts'],
    hides: 'tryouts',
    finishes: null,
    href: '/settings/tryouts',
    icon: 'tag'
  }),
  panel({
    key: 'voice-benchmark',
    group: 'practice',
    /* Benchmarks only. A practice take is sealed until the day after it was
       taken and opts out of the last-write registry for that reason; asking
       this card when one was last taken would be a second way to meet its
       figures before the seal does. */
    covers: ['voiceBenchmarks'],
    hides: 'voiceBenchmarks',
    finishes: 'voice',
    href: '/settings/voice',
    icon: 'mic'
  }),
  panel({
    key: 'wear',
    group: 'practice',
    covers: ['wearSessions'],
    hides: 'wearSessions',
    finishes: 'wear',
    href: '/settings/wear',
    icon: 'clock'
  }),
  panel({
    key: 'effects',
    group: 'practice',
    covers: ['personalEffects'],
    hides: 'personalEffects',
    finishes: 'effects',
    href: '/settings/effects',
    icon: 'sparkle'
  }),
  panel({
    key: 'tally',
    group: 'practice',
    covers: ['tallyEvents'],
    hides: 'tallyEvents',
    finishes: null,
    href: '/tally',
    icon: 'columns'
  })
] as const;

/** Every row the index draws, as a literal union - so
    `vocabulary/statsAreaLabels.ts` is a full `Record` over the real keys and
    a card added without a name is a typecheck failure. */
export type StatsAreaKey = (typeof PANELS)[number]['key'];

/** The panels, with their keys still literal. Typed `readonly
    StatsAreaPanel[]` they came out as `key: string`, so a screen comparing
    against a misspelled key compiled and matched nothing. */
export const STATS_AREA_PANELS: readonly (StatsAreaPanel & { key: StatsAreaKey })[] = PANELS;

/** Every written area that deliberately has **no** card, and why - the full
    `Record` over whatever `PANELS` above does not cover, the shape
    `LAST_WRITE_OPT_OUTS` and `DAY_OPT_OUTS` both use. An area registered in
    `lastWrite.ts` and not indexed here is a compile error until somebody
    either gives it a card or writes down why it has none. */
type Covered = (typeof PANELS)[number]['covers'][number];

export const STATS_AREA_OPT_OUTS: Record<Exclude<LastWriteKey, Covered>, string> = {
  /* The whole cross-area block above the index is the entries. A card
     sending somebody to the journal to see their entries charted, under a
     screen that has just charted them six ways, is the index describing
     itself. */
  entries: 'the cross-area block is the entries',
  /* No screen browses felt sense on its own: a felt-sense history hangs off
     the tryout or the milestone it was logged against, and a card here would
     have nowhere to send anybody. The gap is recorded, not filled. */
  feltSenseEntries: 'no screen owns it; it hangs off the tryout or milestone it was logged against'
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
    if (panel.hides !== null && areaHidden(panel.hides, states)) continue;

    let latest: number | null = null;
    for (const area of panel.covers) {
      const day = lastWrites[area] ?? null;
      if (day !== null && (latest === null || day > latest)) latest = day;
    }
    if (latest === null) continue;

    cards.push({
      panel,
      lastWriteEpochDay: latest,
      finishedEpochDay: panel.finishes === null ? null : groupFinishedOn(panel.finishes, states)
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
