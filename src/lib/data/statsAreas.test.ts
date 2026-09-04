/* The stats tab's area index (phase 8 UX ticket 03, ADR-0056).

   Two of these tests are the ones that can actually fail for the right
   reason. The completeness check runs the registry's own `covers` over
   `LAST_WRITE_ENTRIES` rather than restating the list, so shortening the
   registry breaks it; and the emptiness rule is exercised over a journal
   that uses four areas out of sixteen, which is the shape the spec asked
   for. */

import { describe, expect, it } from 'vitest';
import {
  STATS_AREA_GROUPS,
  STATS_AREA_OPT_OUTS,
  STATS_AREA_PANELS,
  cardsInGroup,
  statsAreaCards
} from './statsAreas';
import { LAST_WRITE_ENTRIES, type LastWriteKey } from './journal/lastWrite';
import { HUB_ROWS } from './hubRows';
import type { AreaStates } from './areaState';

const covered = new Set(STATS_AREA_PANELS.flatMap((panel) => panel.covers));
const optedOut = new Set(Object.keys(STATS_AREA_OPT_OUTS));

describe('the index covers every written area', () => {
  it('gives every last-write area either a card or a written reason', () => {
    const unaccounted = LAST_WRITE_ENTRIES.map((entry) => entry.key).filter(
      (key) => !covered.has(key as LastWriteKey) && !optedOut.has(key)
    );
    expect(unaccounted).toEqual([]);
  });

  it('never covers the same area from two rows', () => {
    const seen = new Set<string>();
    for (const panel of STATS_AREA_PANELS) {
      for (const area of panel.covers) {
        expect(seen.has(area), `${area} is covered twice`).toBe(false);
        seen.add(area);
      }
    }
  });

  it('opts nothing out that also has a card', () => {
    for (const key of optedOut) expect(covered.has(key as LastWriteKey)).toBe(false);
  });

  it('lays the groups out in the hub order', () => {
    const declared = [...new Set(STATS_AREA_PANELS.map((panel) => panel.group))];
    expect(declared).toEqual([...STATS_AREA_GROUPS]);
  });
});

describe('the emptiness rule', () => {
  /* Four areas out of sixteen, which is the case the spec names: the four
     appear and the twelve are absent, rather than rendering an empty chart
     each. */
  const fourAreas: Partial<Record<LastWriteKey, number | null>> = {
    measurements: 20100,
    labResults: 20090,
    wearSessions: 20120,
    tallyEvents: 20080,
    sizeRecords: null,
    doseEvents: null
  };

  it('draws a card only where the area has been written', () => {
    const cards = statsAreaCards(fourAreas, {});
    expect(cards.map((card) => card.panel.key)).toEqual(['measurements', 'labs', 'wear', 'tally']);
  });

  it('draws nothing at all on an empty journal', () => {
    expect(statsAreaCards({}, {})).toEqual([]);
  });

  it('carries the last write of whichever half of a row was written', () => {
    const cards = statsAreaCards({ hairStages: 20000, hairPhotos: 20050 }, {});
    expect(cards).toHaveLength(1);
    expect(cards[0].panel.key).toBe('hair-progress');
    expect(cards[0].lastWriteEpochDay).toBe(20050);
  });

  it('keeps a row whose other half has never been written', () => {
    const cards = statsAreaCards({ hairStages: 20000 }, {});
    expect(cards.map((card) => card.panel.key)).toEqual(['hair-progress']);
  });

  it('takes a hidden area out', () => {
    const states: AreaStates = { measurements: { hidden: true, finishedEpochDay: null } };
    const cards = statsAreaCards(fourAreas, states);
    expect(cards.map((card) => card.panel.key)).not.toContain('measurements');
  });

  it('keeps a finished area and carries the day it ended', () => {
    const states: AreaStates = { measurements: { hidden: false, finishedEpochDay: 20105 } };
    const cards = statsAreaCards(fourAreas, states);
    const measurements = cards.find((card) => card.panel.key === 'measurements');
    expect(measurements?.finishedEpochDay).toBe(20105);
  });

  it('reports no end day for a row that cannot be finished', () => {
    const states: AreaStates = { tallyEvents: { hidden: false, finishedEpochDay: 20105 } };
    const cards = statsAreaCards({ tallyEvents: 20080 }, states);
    expect(cards[0].finishedEpochDay).toBeNull();
  });

  it('cannot hide the cycle row, which owns its own visibility', () => {
    const cycle = STATS_AREA_PANELS.find((panel) => panel.key === 'cycle-events');
    expect(cycle?.hides).toBeNull();
  });
});

describe('agreeing with the More hub', () => {
  it("draws the hub row's own icon and points at its screen, for every card that is one", () => {
    /* This file's own promise - "the hub row's own icon, so the two surfaces
       agree" (ADR-0024) - held rather than restated. It was restated and
       drifted within the hour: phase 8 UX ticket 02 resolved three duplicated
       hub icons and renamed the personal effects route while this module was
       being merged, which left milestones on `flag`, the voice benchmark on
       `mic`, personal effects on `sparkle`, and its href on a route that no
       longer exists.

       `labs` and `tally` are cards with no hub row of their own - one sits
       behind /care and one is its own tab - so they are skipped rather than
       failed, and the hub's own uniqueness test is what governs its icons. */
    const hubRows = new Map<string, { icon: string; href: string }>(
      HUB_ROWS.map((row) => [row.key, { icon: row.icon, href: row.href }])
    );
    let checked = 0;

    for (const panel of STATS_AREA_PANELS) {
      const row = hubRows.get(panel.key);
      if (!row) continue;
      checked += 1;
      expect(panel.icon, `${panel.key} icon`).toBe(row.icon);
      // The hub row's query string is its own (the benchmark tab); the path is
      // what both surfaces have to agree on.
      expect(panel.href, `${panel.key} href`).toBe(row.href.split('?')[0]);
    }

    expect(checked, 'no stats card matched a hub row, so this checked nothing').toBe(14);
  });
});

describe('grouping', () => {
  it('returns a group in declaration order and nothing from its neighbours', () => {
    const cards = statsAreaCards({ measurements: 20100, labResults: 20090, sizeRecords: 20000 }, {});
    expect(cardsInGroup(cards, 'body').map((card) => card.panel.key)).toEqual(['measurements', 'sizes']);
    expect(cardsInGroup(cards, 'health').map((card) => card.panel.key)).toEqual(['labs']);
    expect(cardsInGroup(cards, 'transition')).toEqual([]);
  });
});
