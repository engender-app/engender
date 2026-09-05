/* The stats tab's area index (phase 8 UX ticket 03, ADR-0056).

   Two of these tests are the ones that can actually fail for the right
   reason. The completeness check runs the registry's own `covers` over
   `LAST_WRITE_ENTRIES` rather than restating the list, so shortening the
   registry breaks it; and the emptiness rule is exercised over a journal
   that uses four areas out of sixteen, which is the shape the spec asked
   for.

   What was here and is not, since phase 8 audit ticket 22: a test that read
   both this registry and the hub rows and asserted the icon and the href on
   each of the fourteen cards that are also rows, defending itself against
   matching nothing with a hand-written `expect(checked).toBe(14)`. There is
   nothing left for the two lists to disagree about - a card declares neither
   field now and reads both off its row - so the assertion it made is a
   compile error, and the count nobody could have kept right is gone with
   it. */

import { describe, expect, it } from 'vitest';
import {
  CARDS_WITHOUT_A_ROW,
  STATS_AREA_GROUPS,
  STATS_AREA_OPT_OUTS,
  STATS_AREA_PANELS,
  cardsInGroup,
  statsAreaCards
} from './statsAreas';
import { LAST_WRITE_ENTRIES, type LastWriteKey } from './journal/lastWrite';
import { hubRow } from './hubRows';
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
    /* ADR-0043, structural rather than declared: `cycleEvents` is outside
       `HideableArea`, so no state a person can reach takes this card off. */
    const cards = statsAreaCards({ cycleEvents: 20100 }, { measurements: { hidden: true, finishedEpochDay: null } });
    expect(cards.map((card) => card.panel.key)).toEqual(['cycle-events']);
  });

  it('takes a two-area card out only when both halves are hidden', () => {
    /* The hub row's rule, which is now this card's too (`areasHidden`). Hair
       progress is stagings plus photographs: somebody who hides the stagings
       and keeps photographing has something left on the card. */
    const written = { hairStages: 20000, hairPhotos: 20050 };
    const half: AreaStates = { hairStages: { hidden: true, finishedEpochDay: null } };
    expect(statsAreaCards(written, half).map((card) => card.panel.key)).toEqual(['hair-progress']);

    const both: AreaStates = { ...half, hairPhotos: { hidden: true, finishedEpochDay: null } };
    expect(statsAreaCards(written, both)).toEqual([]);
  });
});

describe('a card reads its identity off its hub row', () => {
  /* Only what can fail is here. That a card carries its row's icon, route
     and finishable group is the derivation itself and is held by the types;
     asserting it back would be the two-lists test this ticket deleted,
     wearing the derivation as its expected value. */

  it('points at the screen where the row points at one of its tabs', () => {
    // The one row carrying a query string. The card means the screen.
    expect(hubRow('voice-benchmark').href).toBe('/settings/voice?tab=record');
    const card = STATS_AREA_PANELS.find((panel) => panel.key === 'voice-benchmark');
    expect(card?.href).toBe('/settings/voice');
  });

  it('says why each of the two rowless cards has no row', () => {
    for (const [key, reason] of Object.entries(CARDS_WITHOUT_A_ROW)) {
      expect(reason.length, `${key} has no written reason`).toBeGreaterThan(0);
    }
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
