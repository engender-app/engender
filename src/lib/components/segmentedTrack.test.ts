import { describe, expect, it } from 'vitest';

import { nearestScrollLeft } from './segmentedTrack';

const track = (scrollLeft: number, clientWidth = 200) => ({ scrollLeft, clientWidth });
const segment = (offsetLeft: number, offsetWidth = 60) => ({ offsetLeft, offsetWidth });

describe('nearestScrollLeft', () => {
  it('leaves the track alone when the segment is already fully visible', () => {
    expect(nearestScrollLeft(track(0), segment(20))).toBe(0);
    expect(nearestScrollLeft(track(100), segment(120))).toBe(100);
  });

  it('brings a segment past the trailing edge just inside it', () => {
    // 300 + 60 = 360, and a 200-wide track showing from 0 ends at 200.
    expect(nearestScrollLeft(track(0), segment(300))).toBe(160);
  });

  it('brings a segment before the leading edge just inside it', () => {
    expect(nearestScrollLeft(track(200), segment(40))).toBe(40);
  });

  it('moves only as far as the segment needs, never centring it', () => {
    // Two pixels out is a two pixel move.
    expect(nearestScrollLeft(track(0), segment(142))).toBe(2);
  });

  it('shows the leading edge of a segment wider than the track', () => {
    expect(nearestScrollLeft(track(0), segment(300, 500))).toBe(300);
  });
});
