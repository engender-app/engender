import { describe, expect, it } from 'vitest';
import { assertEraFits, eraConflict, eraForDay, eraCoversDay, eraRange, type EraSpan } from './eras';

const era = (name: string, startEpochDay: number | null, endEpochDay: number | null, id = name): EraSpan => ({
  id,
  name,
  startEpochDay,
  endEpochDay
});

describe('eraCoversDay', () => {
  it('covers its own bounds inclusively', () => {
    const first = era('first year', 100, 200);
    expect(eraCoversDay(first, 99)).toBe(false);
    expect(eraCoversDay(first, 100)).toBe(true);
    expect(eraCoversDay(first, 200)).toBe(true);
    expect(eraCoversDay(first, 201)).toBe(false);
  });

  it('reaches back forever with no start, the way "before I knew" has no first day', () => {
    const before = era('before I knew', null, 200);
    expect(eraCoversDay(before, -40000)).toBe(true);
    expect(eraCoversDay(before, 200)).toBe(true);
    expect(eraCoversDay(before, 201)).toBe(false);
  });

  it('is still running with no end', () => {
    const now = era('now', 200, null);
    expect(eraCoversDay(now, 199)).toBe(false);
    expect(eraCoversDay(now, 999999)).toBe(true);
  });

  it('covers every day when both bounds are open', () => {
    expect(eraCoversDay(era('all of it', null, null), 0)).toBe(true);
  });
});

describe('eraForDay', () => {
  const eras = [era('before I knew', null, 99), era('first year', 100, 200), era('now', 300, null)];

  it('resolves a day to the one era holding it', () => {
    expect(eraForDay(eras, 50)?.name).toBe('before I knew');
    expect(eraForDay(eras, 150)?.name).toBe('first year');
    expect(eraForDay(eras, 4000)?.name).toBe('now');
  });

  it('resolves a day nobody named to none, which is a resting state and not a gap', () => {
    expect(eraForDay(eras, 250)).toBe(null);
  });

  it('resolves to none when nothing is named at all', () => {
    expect(eraForDay([], 150)).toBe(null);
  });
});

describe('eraConflict', () => {
  const existing = [era('before I knew', null, 99), era('first year', 100, 200), era('now', 300, null)];

  it('admits an era that fits in a stretch nobody named', () => {
    expect(eraConflict(existing, { name: 'the move', startEpochDay: 220, endEpochDay: 260 })).toBe(null);
  });

  it('admits an era touching a neighbour without sharing a day', () => {
    expect(eraConflict(existing, { name: 'the move', startEpochDay: 201, endEpochDay: 299 })).toBe(null);
  });

  it('refuses a second era with no start, naming the one that already has none', () => {
    expect(eraConflict(existing, { name: 'earlier still', startEpochDay: null, endEpochDay: 50 })).toEqual({
      kind: 'openStart',
      with: existing[0]
    });
  });

  it('refuses a second era with no end, naming the one that is already running', () => {
    expect(eraConflict(existing, { name: 'after', startEpochDay: 4000, endEpochDay: null })).toEqual({
      kind: 'openEnd',
      with: existing[2]
    });
  });

  it('refuses an overlap, naming the era it overlaps', () => {
    expect(eraConflict(existing, { name: 'the move', startEpochDay: 150, endEpochDay: 260 })).toEqual({
      kind: 'overlap',
      with: existing[1]
    });
  });

  it('refuses an era that ends before it starts', () => {
    expect(eraConflict([], { name: 'backwards', startEpochDay: 260, endEpochDay: 220 })).toEqual({
      kind: 'inverted'
    });
  });

  it('reports the inversion before any overlap, because the range is not a range yet', () => {
    expect(eraConflict(existing, { name: 'backwards', startEpochDay: 260, endEpochDay: 90 })?.kind).toBe('inverted');
  });

  it('does not count an era against itself when it is the one being edited', () => {
    expect(eraConflict(existing, { ...existing[1], endEpochDay: 250 })).toBe(null);
    expect(eraConflict(existing, { ...existing[0], endEpochDay: 80 })).toBe(null);
  });

  it('still refuses a rename that would collide with a different era', () => {
    expect(eraConflict(existing, { ...existing[2], startEpochDay: 150 })).toEqual({
      kind: 'overlap',
      with: existing[1]
    });
  });
});

describe('assertEraFits', () => {
  it('throws one sentence naming the era it collides with, per kind', () => {
    const existing = [era('before I knew', null, 99), era('first year', 100, 200), era('now', 300, null)];
    expect(() => assertEraFits(existing, { name: 'the move', startEpochDay: 150, endEpochDay: 260 })).toThrow(
      'era "the move" overlaps "first year"'
    );
    expect(() => assertEraFits(existing, { name: 'earlier', startEpochDay: null, endEpochDay: 50 })).toThrow(
      'era "earlier" has no start, and neither does "before I knew"'
    );
    expect(() => assertEraFits(existing, { name: 'after', startEpochDay: 4000, endEpochDay: null })).toThrow(
      'era "after" has no end, and neither does "now"'
    );
    expect(() => assertEraFits([], { name: 'backwards', startEpochDay: 260, endEpochDay: 220 })).toThrow(
      'era "backwards" ends before it starts'
    );
  });

  it('says nothing about an era that fits', () => {
    expect(() => assertEraFits([era('first year', 100, 200)], { name: 'after', startEpochDay: 201, endEpochDay: 300 })).not.toThrow();
  });
});

describe('eraRange', () => {
  const bounds = { firstEpochDay: 120, lastEpochDay: 400 };

  it('leaves two closed bounds alone', () => {
    expect(eraRange(era('first year', 150, 200), bounds)).toEqual({ startEpochDay: 150, endEpochDay: 200 });
  });

  it('clamps an open start to the journal first day', () => {
    expect(eraRange(era('before I knew', null, 200), bounds)).toEqual({ startEpochDay: 120, endEpochDay: 200 });
  });

  it('clamps an open end to the journal last day', () => {
    expect(eraRange(era('now', 300, null), bounds)).toEqual({ startEpochDay: 300, endEpochDay: 400 });
  });

  it('clamps both, so an era that names the whole journal resolves to the whole journal', () => {
    expect(eraRange(era('all of it', null, null), bounds)).toEqual({ startEpochDay: 120, endEpochDay: 400 });
  });

  it('resolves to nothing when the era holds no day the journal has', () => {
    expect(eraRange(era('before I knew', null, 100), bounds)).toBe(null);
    expect(eraRange(era('later', 500, null), bounds)).toBe(null);
  });
});
