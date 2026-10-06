import { describe, expect, it } from 'vitest';
import { revealTravel } from './sectionReveal';

/* Phase 15 after-release ticket 04 (audit UX-05): how far the scroll
   region moves on one frame of a section opening under the chip row. */
describe('revealTravel', () => {
  it('moves by what has grown past the region bottom, plus the 20 margin', () => {
    // section bottom 700, region bottom 647: 700 + 20 - 647 = 73
    expect(revealTravel({ sectionBottom: 700, regionTop: 0, regionBottom: 647, anchorTop: 500 })).toBe(73);
  });

  it('does not move while the section still ends 20 or more above the region bottom', () => {
    expect(revealTravel({ sectionBottom: 600, regionTop: 0, regionBottom: 647, anchorTop: 500 })).toBe(0);
  });

  it('never moves the chip row closer than 8 to the region top', () => {
    // wants 253, but the chips at 100 may only travel 100 - 0 - 8 = 92
    expect(revealTravel({ sectionBottom: 880, regionTop: 0, regionBottom: 647, anchorTop: 100 })).toBe(92);
  });

  it('does not move once the chip row is already at its limit', () => {
    expect(revealTravel({ sectionBottom: 880, regionTop: 56, regionBottom: 647, anchorTop: 60 })).toBe(0);
  });
});
