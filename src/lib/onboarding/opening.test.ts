import { describe, expect, it } from 'vitest';
import { OPENING_TOTAL_MS, REDUCED_FADE_MS, RING_STAGGER_MS, openingBeats, ringFromScale } from './opening';

describe("the welcome's opening", () => {
  for (const rings of [1, 5, 7]) {
    const beats = openingBeats(rings);
    const all = [...beats.rings, beats.mark, beats.sign, ...beats.lines, beats.foot];

    it(`draws the rings from the corner outwards, one stripe at a time (${rings} rings)`, () => {
      expect(beats.rings).toHaveLength(rings);
      beats.rings.forEach((beat, k) => expect(beat.delay, `ring ${k}`).toBe(k * RING_STAGGER_MS));
    });

    it(`then raises the wordmark, then the lines, then the actions (${rings} rings)`, () => {
      expect(beats.mark.delay).toBeGreaterThan(0);
      expect(beats.sign.delay).toBeGreaterThan(beats.mark.delay);
      for (const line of beats.lines) expect(line.delay).toBeGreaterThan(beats.sign.delay);
      expect(beats.foot.delay).toBeGreaterThan(Math.max(...beats.lines.map((line) => line.delay)));
    });

    it(`is over in about 1.3s (${rings} rings)`, () => {
      const end = Math.max(...all.map((beat) => beat.delay + beat.duration));
      expect(end).toBe(OPENING_TOTAL_MS);
      expect(end).toBeGreaterThanOrEqual(1200);
      expect(end).toBeLessThanOrEqual(1400);
    });
  }

  it('starts each ring at the edge of the one inside it, so the band opens rather than a hidden disc', () => {
    const diameters = [350, 280, 210, 140, 70];
    expect(diameters.map((_, i) => ringFromScale(diameters, i))).toEqual([0.8, 0.75, 2 / 3, 0.5, 0]);
  });

  it('is a crossfade of no more than 200ms under reduced motion', () => {
    expect(REDUCED_FADE_MS).toBeLessThanOrEqual(200);
    expect(REDUCED_FADE_MS).toBeGreaterThan(0);
  });
});
