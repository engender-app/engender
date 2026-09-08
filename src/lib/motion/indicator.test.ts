import { describe, expect, it } from 'vitest';
import { boxesMatch, insets, leadingEdge, travel, type Box } from './indicator';

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

describe('boxesMatch', () => {
  it('is true for the same rectangle', () => {
    expect(boxesMatch(box(0, 0, 60, 48), box(0, 0, 60, 48))).toBe(true);
  });

  it('is false once anything about it moves', () => {
    expect(boxesMatch(box(0, 0, 60, 48), box(60, 0, 60, 48))).toBe(false);
    expect(boxesMatch(box(0, 0, 60, 48), box(0, 0, 61, 48))).toBe(false);
  });

  /* Sub-pixel layout noise is not a slide. A container that reflows by a
     third of a pixel would otherwise replay the stretch on every resize
     tick, which is the one way this animation could become a loop. */
  it('ignores a difference under half a pixel', () => {
    expect(boxesMatch(box(0, 0, 60, 48), box(0.3, 0, 60, 48))).toBe(true);
  });
});

describe('insets', () => {
  /* The four numbers CSS positions the pill with. All four, rather than a
     position and a size, because the two edges of the travelling axis are
     what move on their own schedules - see leadingEdge below. */
  it('measures every edge against the host it sits in', () => {
    expect(insets(box(60, 8, 62, 48), { w: 320, h: 64 })).toEqual({
      left: 60,
      right: 198,
      top: 8,
      bottom: 8
    });
  });

  it('gives back the box it was handed', () => {
    const at = insets(box(60, 8, 62, 48), { w: 320, h: 64 });
    expect(at.left + 62 + at.right).toBe(320);
    expect(at.top + 48 + at.bottom).toBe(64);
  });

  /* The rail scrolls, and a row below its fold sits past the host's own
     height. `bottom` goes negative there rather than clamping, which is what
     keeps the pair of insets describing the row's real position: both are
     measured against the same padding box, whatever the scroll offset is. */
  it('goes negative below a scrolled host rather than clamping', () => {
    expect(insets(box(0, 700, 200, 48), { w: 200, h: 600 }).bottom).toBe(-148);
  });
});

describe('travel', () => {
  it('is nothing at all when the pill has not moved', () => {
    expect(travel(box(0, 0, 60, 48), box(0, 0, 60, 48), 'x')).toBe(0);
  });

  it('is signed by the direction of the move along its own axis', () => {
    expect(travel(box(0, 0, 60, 48), box(60, 0, 60, 48), 'x')).toBe(1);
    expect(travel(box(60, 0, 60, 48), box(0, 0, 60, 48), 'x')).toBe(-1);
    expect(travel(box(0, 0, 200, 48), box(0, 48, 200, 48), 'y')).toBe(1);
    expect(travel(box(0, 48, 200, 48), box(0, 0, 200, 48), 'y')).toBe(-1);
  });

  /* The rail runs down the screen and the bar across it, so a move on the
     axis the pill is not travelling on is not a move: the bar's four tabs
     are one row and only a relayout changes their y. */
  it('ignores movement across the axis it is not travelling on', () => {
    expect(travel(box(0, 0, 60, 48), box(0, 300, 60, 48), 'x')).toBe(0);
  });

  /* Sub-pixel noise, again: the same floor boxesMatch uses, so a reflow that
     counts as the same place cannot also count as a direction of travel. */
  it('reads a third of a pixel as standing still', () => {
    expect(travel(box(0, 0, 60, 48), box(0.3, 0, 60, 48), 'x')).toBe(0);
  });
});

describe('leadingEdge', () => {
  /* Which of the axis's two insets leaves first. 'near' is left or top,
     'far' is right or bottom, so one pair of names covers both shapes of the
     navigation and the component maps them onto the properties. */
  it('leads with the far edge when the pill travels toward it', () => {
    expect(leadingEdge(1)).toBe('far');
  });

  it('leads with the near edge coming back', () => {
    expect(leadingEdge(-1)).toBe('near');
  });

  /* A placement that is not a slide has no leading edge to stage, and the
     component puts both edges on the same schedule when it gets null - a
     plain move rather than a stretch. The first placement on a tab and a
     re-measure after a rotation are both this case. */
  it('has no leading edge when nothing travelled', () => {
    expect(leadingEdge(0)).toBe(null);
  });
});
