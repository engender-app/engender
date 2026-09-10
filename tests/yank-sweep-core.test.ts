// @ts-nocheck
/* The yank sweep's arithmetic, unit-tested on synthetic frames (ticket
   100). The desktop sweep proved itself by injecting wrong marks into a
   real browser; that proves the whole chain but says nothing about which
   half broke when it goes quiet. These pin the four failure shapes - and,
   just as much, the shapes that must NOT be flagged, because a detector
   that fires on every legitimate animation is a detector nobody reads.

   The hydration sweep's additions (ticket 108) are pinned here too: the
   wider teleport floor over its calmer window, the camera's transient
   arithmetic on synthetic gray frames, and the screen inventory the two
   crawlers walk. */
import { describe, expect, it } from 'vitest';

import {
  BLOAT_PX,
  HYDRATION_NEEDS,
  HYDRATION_PX,
  TELEPORT_PX,
  findPixelYanks,
  findYanks,
  hydrationScreensFor,
  scenesFor
} from './yank-sweep-core.mjs';

/** A frame holding one mark, sized and placed - the shape the rows
 *  instrument produces, minus everything the arithmetic does not read. */
const frame = (row, at) => ({ at, active: false, rows: row ? { mark: row } : {}, vt: {} });
const mark = (over = {}) => ({ x: 10, y: 20, w: 100, h: 24, o: 1, ...over });
/** `n` frames of the same resting mark - the stillness a spike is read
 *  against. */
const still = (n, over) => Array.from({ length: n }, (_, i) => frame(mark(over), i * 16));

describe('findYanks', () => {
  it('reports a mark that teleports between two still frames', () => {
    /* Eight frames of a smooth 6px slide, then 200px in one - and it stays
       teleported, so the return trip is not what gets flagged. */
    const frames = [
      ...Array.from({ length: 8 }, (_, i) => frame(mark({ y: 20 + i * 6 }), i * 16)),
      frame(mark({ y: 20 + 8 * 6 + 200 }), 128),
      ...still(4, { y: 20 + 8 * 6 + 200 })
    ];
    const yanks = findYanks(frames, 'rows');
    expect(yanks).toContainEqual(
      expect.objectContaining({ kind: 'teleport', mark: 'mark' })
    );
  });

  it('does not report a mark that slides, however fast', () => {
    /* 30px per frame, well over TELEPORT_PX, but every neighbour moves the
       same 30px: a slide, not a spike. */
    const frames = Array.from({ length: 12 }, (_, i) => frame(mark({ y: 20 + i * 30 }), i * 16));
    expect(findYanks(frames, 'rows')).toEqual([]);
  });

  it('reports a mark cut from full opacity to nothing in one frame', () => {
    const frames = [...still(6), frame(mark({ o: 0 }), 96), ...still(4)];
    expect(findYanks(frames, 'rows')).toContainEqual(
      expect.objectContaining({ kind: 'vanish', mark: 'mark' })
    );
  });

  it('reports a mark absent for two mid-gesture frames and back', () => {
    const frames = [...still(5), frame(null, 80), frame(null, 96), ...still(3)];
    expect(findYanks(frames, 'rows')).toContainEqual(
      expect.objectContaining({ kind: 'limbo', mark: 'mark' })
    );
  });

  describe('bloat - the field-blind shape (ticket 99 round 2, ticket 100)', () => {
    it('reports a mark that renders larger than its resting bounds for one frame', () => {
      const frames = [...still(8), frame(mark({ h: 520 }), 128), ...still(4)];
      const yanks = findYanks(frames, 'rows');
      expect(yanks).toContainEqual(
        expect.objectContaining({ kind: 'bloat', mark: 'mark', frames: [8, 9] })
      );
    });

    it('reports it on the width axis alone', () => {
      const frames = [...still(8), frame(mark({ w: 380 }), 128), ...still(4)];
      expect(findYanks(frames, 'rows')).toContainEqual(
        expect.objectContaining({ kind: 'bloat', mark: 'mark' })
      );
    });

    it('reports it off the view-transition instrument, where the defect lived', () => {
      /* The blind's pseudo row: a clip that answers the full window for one
         frame before the real, capped extent settles. */
      const vt = (h, at) => ({
        at,
        active: true,
        rows: {},
        vt: { 'new(blind)': { x: 0, y: 0, w: 390, h, o: 1 } }
      });
      const frames = [
        vt(260, 0), vt(260, 16), vt(260, 32), vt(260, 48),
        vt(844, 64),
        vt(260, 80), vt(260, 96)
      ];
      expect(findYanks(frames, 'vt')).toContainEqual(
        expect.objectContaining({ kind: 'bloat', mark: 'new(blind)' })
      );
    });

    it('does not report growth under the pixel floor', () => {
      const frames = [...still(8), frame(mark({ h: 24 + BLOAT_PX - 1 }), 128), ...still(4)];
      expect(findYanks(frames, 'rows')).toEqual([]);
    });

    it('does not report a mark that grows and stays grown', () => {
      /* A layout change, not a yank: the run never comes back. */
      const frames = [...still(8), ...still(6, { h: 520 })];
      expect(findYanks(frames, 'rows')).toEqual([]);
    });

    it('does not report an animating box, whose neighbours are moving too', () => {
      /* The blind's own slide: 40px of height change per frame over the
         whole run, so no frame has stillness on both sides of it. */
      const frames = Array.from({ length: 14 }, (_, i) =>
        frame(mark({ h: 24 + i * 40, w: 100 }), i * 16)
      );
      expect(findYanks(frames, 'rows')).toEqual([]);
    });

    it('does not report proportional jitter on a large mark', () => {
      /* 8px on a 300px-tall mark: over a sixth of the proof mark's own
         height, under every threshold a mark this size carries. */
      const frames = [...still(8, { h: 300 }), frame(mark({ h: 308, w: 100 }), 128), ...still(4, { h: 300 })];
      expect(findYanks(frames, 'rows')).toEqual([]);
    });
  });
});

describe('scenesFor', () => {
  it('adds the proof scene only when proving', () => {
    expect(scenesFor().map((s) => s.name)).not.toContain('proof-injected-yanks');
    expect(scenesFor({ prove: true }).map((s) => s.name)[0]).toBe('proof-injected-yanks');
  });

  it('narrows to the named scenes', () => {
    expect(scenesFor({ only: ['mood-pick'] }).map((s) => s.name)).toEqual(['mood-pick']);
  });
});

describe('the hydration floor (ticket 108)', () => {
  /* The same spike, read at both floors: what the gesture sweep catches
   * at 14px, the hydration sweep lets pass until the ticket's own 24px. */
  const jump = (d) => [...still(6), frame(mark({ y: 20 + d }), 96), ...still(4, { y: 20 + d })];

  it('flags a jump over the hydration floor in a still window', () => {
    const frames = jump(30);
    expect(findYanks(frames, 'rows', frames.length - 1, HYDRATION_PX)).toContainEqual(
      expect.objectContaining({ kind: 'teleport', mark: 'mark' })
    );
  });

  it('does not flag a jump the gesture floor catches but the ticket floor does not', () => {
    const frames = jump(TELEPORT_PX + 2);
    expect(findYanks(frames, 'rows')).toContainEqual(
      expect.objectContaining({ kind: 'teleport', mark: 'mark' })
    );
    expect(findYanks(frames, 'rows', frames.length - 1, HYDRATION_PX)).toEqual([]);
  });
});

describe('findPixelYanks', () => {
  /* A 20x20 gray frame: small enough to build by hand, large enough that
   * a 6x6 block of changed pixels clears the transient and region floors
   * the real camera's thresholds impose. */
  const W = 20;
  const H = 20;
  const flat = (v) => new Uint8Array(W * H).fill(v);
  const withBlock = (v, x0, y0, bw, bh) => {
    const g = flat(v);
    for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) g[y * W + x] = 220;
    return g;
  };
  const ats = (n) => Array.from({ length: n }, (_, i) => i * 16);

  it('reports a block painted for one frame and gone again', () => {
    const grays = [flat(100), flat(100), withBlock(100, 4, 4, 6, 6), flat(100), flat(100)];
    const { findings } = findPixelYanks(grays, W, H, ats(5));
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'flash', frame: 2, areaPct: expect.closeTo(0.09, 2) })
    );
  });

  it('does not report a block that arrives and stays - a load, not a flash', () => {
    const grays = [flat(100), flat(100), withBlock(100, 4, 4, 6, 6), withBlock(100, 4, 4, 6, 6)];
    expect(findPixelYanks(grays, W, H, ats(4)).findings).toEqual([]);
  });

  it('does not report a column sliding one step a frame - motion, not a transient', () => {
    const slide = (x) => withBlock(100, x, 0, 1, H);
    const grays = [slide(3), slide(4), slide(5), slide(6), slide(7)];
    expect(findPixelYanks(grays, W, H, ats(5)).findings).toEqual([]);
  });
});

describe('hydrationScreensFor (ticket 108)', () => {
  it('adds the proof scene only when proving, and narrows to the named scenes', () => {
    const names = hydrationScreensFor().map((s) => s.name);
    expect(names).not.toContain('proof-injected-yanks');
    expect(hydrationScreensFor({ prove: true }).map((s) => s.name)[0]).toBe('proof-injected-yanks');
    expect(hydrationScreensFor({ only: ['stats'] }).map((s) => s.name)).toEqual(['stats']);
  });

  it('names every needs token it uses in HYDRATION_NEEDS', () => {
    for (const scene of hydrationScreensFor())
      if (scene.needs) expect(Object.keys(HYDRATION_NEEDS)).toContain(scene.needs);
  });

  it('carries the two prologue scenes exactly once each', () => {
    const names = hydrationScreensFor().map((s) => s.name);
    expect(names.filter((n) => n === 'onboarding-mount')).toHaveLength(1);
    expect(names.filter((n) => n === 'lock-gate')).toHaveLength(1);
  });

  it('gives every scene a name, a route and a description', () => {
    for (const scene of hydrationScreensFor())
      expect(scene).toEqual(
        expect.objectContaining({ name: expect.any(String), at: expect.any(String), is: expect.any(String) })
      );
  });
});
