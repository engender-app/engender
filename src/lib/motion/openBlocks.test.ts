import { describe, expect, it } from 'vitest';

import { openingShifts } from './openBlocks';

/* The geometry of the roadmap's opening: at progress e (0 to 1) the
   followers stand at from + travel * e, the section's clip must end where
   the followers begin less the gap, and its contents must stay `packSpace *
   (1 - e)` above where layout put them. */
const at = (pair: [number, number], e: number) => pair[0] + (pair[1] - pair[0]) * e;

describe('openingShifts', () => {
  const cases = [
    { added: 3200, travel: 600, packSpace: 70 },
    { added: 300, travel: 300, packSpace: 70 },
    { added: 300, travel: 300, packSpace: 0 }
  ];

  it('starts every piece where the old layout had it and lets go on the final layout', () => {
    for (const g of cases) {
      const s = openingShifts(g);
      expect(s.followers[0]).toBe(-g.added);
      // The followers end where the screen's bottom edge is, or in place.
      expect(s.followers[1]).toBe(g.travel - g.added);
      // A box and its children cancel at the end of the travel.
      expect(s.sectionBox[1] + s.sectionKids[1]).toBe(0);
      expect(s.packBox[1] + s.packKids[1]).toBe(0);
    }
  });

  it('keeps the section clipped to the followers and its contents under the pack', () => {
    for (const g of cases) {
      const s = openingShifts(g);
      for (const e of [0, 0.1, 0.5, 0.9, 1]) {
        // The clip's bottom edge rides the followers' top.
        expect(at(s.sectionBox, e)).toBeCloseTo(at(s.followers, e), 9);
        // The contents sit below the pack's visible part: layout position
        // less the part of the pack's room not yet open.
        expect(at(s.sectionBox, e) + at(s.sectionKids, e)).toBeCloseTo(-g.packSpace * (1 - e), 9);
        // The pack's own contents stay where layout put them.
        expect(at(s.packBox, e) + at(s.packKids, e)).toBeCloseTo(0, 9);
      }
    }
  });
});
