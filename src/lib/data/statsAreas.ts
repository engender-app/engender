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
     preview  'trend' where the owning screen's own read yields a day series
              this card can draw in the same component, 'row' otherwise

   No wording here: this file is Node-tier safe and imports no paraglide
   (ADR-0016). The names live in `vocabulary/statsAreaLabels.ts`, the same
   split `areaLabels.ts` and `clinicianSummaryLabels.ts` keep.

   No reads here either. A trend card's series comes back from the module that
   owns it - the labs screen's `getSeries`, the wear screen's `wearTimeTrend`
   - so this tab introduces no figure its owning screen does not already show
   (ADR-0010), and if that chart changes the card changes with it. */

import { areaHidden, type AreaStates, type HideableArea } from './areaState';
import { groupFinishedOn, type AreaGroupKey } from './areaGroups';
import type { LastWriteKey } from './journal/lastWrite';

/** The More hub's four groups, in the More hub's order. */
export type StatsAreaGroup = 'body' | 'health' | 'transition' | 'practice';

export const STATS_AREA_GROUPS = ['body', 'health', 'transition', 'practice'] as const satisfies readonly StatsAreaGroup[];

/** How a card previews what is behind it. */
export type StatsAreaPreview = 'trend' | 'row';

export interface StatsAreaPanel {
  key: string;
  group: StatsAreaGroup;
  covers: readonly LastWriteKey[];
  hides: HideableArea | null;
  finishes: AreaGroupKey | null;
  href: string;
  icon: string;
  preview: StatsAreaPreview;
}

/** Keeps the declaration site honest: `covers` has to name real last-write
    areas, and the key is checked against the panel list below rather than
    against a second type. */
function panel<Key extends string>(declared: StatsAreaPanel & { key: Key }) {
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
    icon: 'ruler',
    /* `getMeasurementsInRange` is a bounded read the photo-compare view
       already makes, so the card draws the most recently written type's
       series out of rows it fetched once rather than asking per type. */
    preview: 'trend'
  }),
  panel({
    key: 'sizes',
    group: 'body',
    covers: ['sizeRecords'],
    hides: 'sizeRecords',
    finishes: 'sizes',
    href: '/settings/sizes',
    icon: 'package',
    /* A size is a garment label, not a number on a scale: 'M' does not sit
       between 'S' and 'L' by any distance the app knows. */
    preview: 'row'
  }),
  panel({
    key: 'hair-progress',
    group: 'body',
    covers: ['hairStages', 'hairPhotos'],
    hides: 'hairStages',
    finishes: 'hair-progress',
    href: '/settings/hair-progress',
    icon: 'comb',
    preview: 'row'
  }),
  panel({
    key: 'hair-removal',
    group: 'body',
    covers: ['hairRemovalSessions'],
    hides: 'hairRemovalSessions',
    finishes: 'hair-removal',
    href: '/settings/hair-removal',
    icon: 'shuffle',
    preview: 'row'
  }),
  panel({
    key: 'care',
    group: 'health',
    covers: ['doseEvents'],
    hides: 'doseEvents',
    finishes: null,
    href: '/care',
    icon: 'timeline',
    /* A dose is drawn on the hormone curve, which is a fitted model over a
       regimen rather than a day series (hormoneCurve.ts). Nothing this card
       could plot would be the chart /care sends you to. */
    preview: 'row'
  }),
  panel({
    key: 'labs',
    group: 'health',
    covers: ['labResults'],
    hides: 'labResults',
    finishes: null,
    href: '/settings/labs',
    icon: 'flask',
    preview: 'trend'
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
    icon: 'calendar',
    preview: 'row'
  }),
  panel({
    key: 'side-effects',
    group: 'health',
    covers: ['sideEffects'],
    hides: 'sideEffects',
    finishes: 'side-effects',
    href: '/settings/side-effects',
    icon: 'zap',
    preview: 'row'
  }),
  panel({
    key: 'surgery',
    group: 'health',
    covers: ['procedures'],
    hides: 'procedures',
    finishes: null,
    href: '/settings/surgery',
    icon: 'flag',
    preview: 'row'
  }),
  panel({
    key: 'dilation',
    group: 'health',
    covers: ['taperSessions'],
    hides: 'taperSessions',
    finishes: 'dilation',
    href: '/settings/dilation',
    icon: 'flask',
    preview: 'trend'
  }),
  panel({
    key: 'milestones',
    group: 'transition',
    covers: ['milestones'],
    hides: 'milestones',
    finishes: null,
    href: '/settings/milestones',
    icon: 'flag',
    preview: 'row'
  }),
  panel({
    key: 'tryouts',
    group: 'transition',
    covers: ['tryouts'],
    hides: 'tryouts',
    finishes: null,
    href: '/settings/tryouts',
    icon: 'tag',
    preview: 'row'
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
    icon: 'mic',
    preview: 'trend'
  }),
  panel({
    key: 'wear',
    group: 'practice',
    covers: ['wearSessions'],
    hides: 'wearSessions',
    finishes: 'wear',
    href: '/settings/wear',
    icon: 'clock',
    preview: 'trend'
  }),
  panel({
    key: 'effects',
    group: 'practice',
    covers: ['personalEffects'],
    hides: 'personalEffects',
    finishes: 'effects',
    href: '/settings/effects',
    icon: 'sparkle',
    preview: 'row'
  }),
  panel({
    key: 'tally',
    group: 'practice',
    covers: ['tallyEvents'],
    hides: 'tallyEvents',
    finishes: null,
    href: '/tally',
    icon: 'columns',
    preview: 'trend'
  })
] as const;

export const STATS_AREA_PANELS: readonly StatsAreaPanel[] = PANELS;

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
  panel: StatsAreaPanel;
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
