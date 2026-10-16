import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { nearestScrollLeft, SCROLL_HINT_WIDTH } from './segmentedTrack';

const root = fileURLToPath(new URL('../../..', import.meta.url));

/* A 200px window onto 600px of segments unless a case says otherwise, so
   the far end is 400. The hint is 26px wide at either edge. */
const track = (scrollLeft: number, clientWidth = 200, scrollWidth = 600) => ({ scrollLeft, clientWidth, scrollWidth });
const segment = (offsetLeft: number, offsetWidth = 60) => ({ offsetLeft, offsetWidth });

describe('nearestScrollLeft', () => {
  it('leaves the track alone when the segment is already clear of both edges', () => {
    expect(nearestScrollLeft(track(0), segment(20))).toBe(0);
    expect(nearestScrollLeft(track(100), segment(130))).toBe(100);
  });

  it('brings a segment past the trailing edge in clear of the chevron there', () => {
    // 300 + 60 = 360, and the window has to end 26px past it: 386 - 200.
    expect(nearestScrollLeft(track(0), segment(300))).toBe(186);
  });

  it('brings a segment before the leading edge in clear of the chevron there', () => {
    expect(nearestScrollLeft(track(200), segment(140))).toBe(114);
  });

  it('moves a segment that is inside the window but under a chevron', () => {
    /* Wrapped's "Last year" at 390px: the segment ended exactly at the
       window's edge, so the old answer left it where the end chevron's
       ground covered its last letter. */
    expect(nearestScrollLeft(track(0), segment(140))).toBe(26);
    expect(nearestScrollLeft(track(100), segment(110))).toBe(84);
  });

  it('moves only as far as the segment needs, never centring it', () => {
    // Two pixels under the chevron is a two pixel move.
    expect(nearestScrollLeft(track(0), segment(116))).toBe(2);
  });

  it('needs no room for a chevron at either end of the scroll, where none is drawn', () => {
    // The first segment at the start, the last at the far end (400).
    expect(nearestScrollLeft(track(150), segment(3))).toBe(0);
    expect(nearestScrollLeft(track(0), segment(526))).toBe(400);
  });

  it('centres a segment that cannot clear both chevrons, so they cover it evenly', () => {
    /* 170px plus two 26px hints is more than the 200px window: centred,
       each hint covers 11px of it rather than the end one covering 22px. */
    expect(nearestScrollLeft(track(0), segment(300, 170))).toBe(285);
  });

  it('still needs only one chevron of room at either end of the scroll', () => {
    // 150 + 26 fits a 200px window that starts at 0, where no start hint is drawn.
    expect(nearestScrollLeft(track(100), segment(3, 150))).toBe(0);
  });

  it('shows the leading edge of a segment wider than the track', () => {
    expect(nearestScrollLeft(track(0, 200, 900), segment(300, 500))).toBe(300);
  });

  it('reserves exactly the width the stylesheet gives the chevron', () => {
    const css = readFileSync(root + '/src/lib/styles/components.css', 'utf8');
    const rule = css.match(/\.segmented-hint \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain(`width: ${SCROLL_HINT_WIDTH}px;`);
  });
});
