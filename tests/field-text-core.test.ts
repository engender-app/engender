// @ts-nocheck
/* The field-text probe's arithmetic on synthetic frames (ticket 285). A
   probe that has only ever passed proves nothing, so these pin the shapes it
   must flag - text below the painted edge, a part that jumps against the
   edge, a part that appears in one frame, ink below the field in a frame's
   pixels - and the shapes it must not, which are what the app does on
   purpose: a part riding the edge with a small travel of its own, a ring
   scaling about its own middle, and a one-frame ResizeObserver artefact on a
   step machine. */
import { describe, expect, it } from 'vitest';

import {
  INK_PIXELS,
  findGeometry,
  findHeightJumps,
  offFieldInk
} from './field-text-core.mjs';

const row = (t, edge, parts) => ({ t, edge, parts });
const part = (n, bottom, op = 1, mid = bottom - 20) => ({ n, bottom, mid, op });

describe('findGeometry', () => {
  it('passes a part that rides the edge with a travel of its own', () => {
    const series = [];
    for (let i = 0; i < 20; i++) {
      const edge = 128 + i * 5;
      series.push(row(i * 16, edge, [part('fp-b-0', edge - 16 - Math.max(0, 12 - i * 1.5))]));
    }
    const r = findGeometry(series);
    expect(r.overspill).toEqual([]);
    expect(r.teleports).toEqual([]);
  });

  it('flags a part whose box is below the edge and names how far', () => {
    const r = findGeometry([row(0, 100, [part('fp-a-0', 96)]), row(16, 100, [part('fp-a-0', 108)])]);
    expect(r.overspill).toEqual([{ name: 'fp-a-0', reach: 8, at: 16 }]);
  });

  it('does not count a part that is fully faded out', () => {
    const r = findGeometry([row(0, 100, [part('fp-a-0', 140, 0.01)])]);
    expect(r.overspill).toEqual([]);
  });

  it('flags a part that jumps against the edge in one frame', () => {
    const r = findGeometry([row(0, 200, [part('fp-a-0', 180)]), row(16, 200, [part('fp-a-0', 150)])]);
    expect(r.teleports).toEqual([{ name: 'fp-a-0', at: 16, jump: 30 }]);
  });

  it('reads a ring by its middle, so scaling about the centre is not a jump', () => {
    const r = findGeometry([
      row(0, 200, [{ n: 'sun-a-0', bottom: 175, mid: 0, op: 1 }]),
      row(16, 200, [{ n: 'sun-a-0', bottom: 90, mid: 0, op: 1 }])
    ]);
    expect(r.teleports).toEqual([]);
  });

  it('does not call a thing anchored to the top corner a teleport because the edge moved', () => {
    const r = findGeometry([
      row(0, 130, [{ n: 'sun-b-0', bottom: 40, mid: 0, op: 1 }]),
      row(16, 160, [{ n: 'sun-b-0', bottom: 45, mid: 0, op: 1 }])
    ]);
    expect(r.teleports).toEqual([]);
  });

  it('flags a part that appears or vanishes in a single frame', () => {
    const r = findGeometry([row(0, 200, [part('fp-b-0', 150, 0)]), row(16, 200, [part('fp-b-0', 150, 1)])]);
    expect(r.pops).toEqual([{ name: 'fp-b-0', at: 16, from: 0, to: 1 }]);
  });

  it('on a step machine one stray sample is a ResizeObserver artefact, two are real', () => {
    const one = [row(0, 100, [part('q', 90)]), row(16, 100, [part('q', 130)]), row(32, 100, [part('q', 90)])];
    expect(findGeometry(one, { persist: 2 }).overspill).toEqual([]);
    const two = [...one.slice(0, 2), row(32, 100, [part('q', 125)])];
    expect(findGeometry(two, { persist: 2 }).overspill).toHaveLength(1);
  });
});

describe('findHeightJumps', () => {
  it('flags a field that changes height by more than a move could in one frame', () => {
    const r = findHeightJumps([{ t: 0, height: 128 }, { t: 16, height: 128 }, { t: 32, height: 163 }]);
    expect(r).toEqual([{ at: 32, from: 128, to: 163, jump: 35 }]);
  });

  it('flags a small change with stillness on both sides', () => {
    const r = findHeightJumps([128, 128, 132, 132, 132].map((height, i) => ({ t: i * 16, height })));
    expect(r).toEqual([{ at: 32, from: 128, to: 132, jump: 4 }]);
  });

  it('passes the same 35px travelled over an ease-out', () => {
    const heights = [128, 137, 147, 154, 159, 161, 162, 163, 163];
    expect(findHeightJumps(heights.map((height, i) => ({ t: i * 16, height })))).toEqual([]);
  });
});

describe('offFieldInk', () => {
  /** A frame `w` by `h`: blue down to row `fieldEnd`, white below, with green
      painted over the rows `ink` names. */
  const frameOf = (w, h, fieldEnd, ink) => {
    const pixels = new Uint8Array(w * h * 3).fill(255);
    const set = (x, y, rgb) => pixels.set(rgb, (y * w + x) * 3);
    for (let y = 0; y < fieldEnd; y++) for (let x = 0; x < w; x++) set(x, y, [0, 0, 255]);
    for (const [y0, y1] of ink) for (let y = y0; y < y1; y++) for (let x = 10; x < 30; x++) set(x, y, [0, 255, 0]);
    return { width: w, height: h, channels: 3, pixels };
  };

  it('is quiet when the ink is on the field', () => {
    expect(offFieldInk(frameOf(40, 60, 40, [[10, 30]])).count).toBeLessThan(INK_PIXELS);
  });

  it('counts ink below the field and says how far below', () => {
    const r = offFieldInk(frameOf(40, 60, 30, [[30, 45]]));
    expect(r.count).toBeGreaterThanOrEqual(INK_PIXELS);
    expect(r.deepest).toBe(15);
  });
});
