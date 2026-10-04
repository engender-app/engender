import { describe, expect, it } from 'vitest';
import { COUNTEREVIDENCE_PREVIEW, previewWholeDays } from './counterevidence';

const day = (epochDay: number, n: number) => ({ epochDay, entries: Array.from({ length: n }, (_, i) => i) });

describe('previewWholeDays', () => {
  it('opens on six one-entry days and holds the rest', () => {
    const groups = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => day(d, 1));
    const { shown, held } = previewWholeDays(groups);
    expect(shown.map((g) => g.epochDay)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(held.map((g) => g.epochDay)).toEqual([7, 8]);
    expect(COUNTEREVIDENCE_PREVIEW).toBe(6);
  });

  it('never splits a day across the control: a day straddling the sixth entry stays above it whole', () => {
    const groups = [day(1, 2), day(2, 2), day(3, 3), day(4, 1)];
    const { shown, held } = previewWholeDays(groups);
    expect(shown.map((g) => g.epochDay)).toEqual([1, 2, 3]);
    expect(held.map((g) => g.epochDay)).toEqual([4]);
  });

  it('holds nothing back when the pool is short', () => {
    const { shown, held } = previewWholeDays([day(1, 1), day(2, 3)]);
    expect(shown).toHaveLength(2);
    expect(held).toEqual([]);
  });
});
