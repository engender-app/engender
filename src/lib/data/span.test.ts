import { describe, expect, it } from 'vitest';
import { spanCoversDay, spanOverlapsRange } from './span';

const span = (startEpochDay: number | null, endEpochDay: number | null) => ({
  startEpochDay,
  endEpochDay
});

describe('spanCoversDay', () => {
  it('covers its own bounds inclusively', () => {
    const bounded = span(100, 200);
    expect(spanCoversDay(bounded, 99)).toBe(false);
    expect(spanCoversDay(bounded, 100)).toBe(true);
    expect(spanCoversDay(bounded, 200)).toBe(true);
    expect(spanCoversDay(bounded, 201)).toBe(false);
  });

  it('reaches back forever with no start', () => {
    const openStart = span(null, 200);
    expect(spanCoversDay(openStart, -40000)).toBe(true);
    expect(spanCoversDay(openStart, 200)).toBe(true);
    expect(spanCoversDay(openStart, 201)).toBe(false);
  });

  it('is still running with no end', () => {
    const openEnd = span(200, null);
    expect(spanCoversDay(openEnd, 199)).toBe(false);
    expect(spanCoversDay(openEnd, 999999)).toBe(true);
  });

  it('covers every day with both bounds open', () => {
    const unbounded = span(null, null);
    expect(spanCoversDay(unbounded, -999999)).toBe(true);
    expect(spanCoversDay(unbounded, 999999)).toBe(true);
  });
});

describe('spanOverlapsRange', () => {
  it('overlaps when the span sits inside the range', () => {
    expect(spanOverlapsRange(span(110, 120), 100, 200)).toBe(true);
  });

  it('overlaps when only the tail crosses into the range', () => {
    expect(spanOverlapsRange(span(50, 100), 100, 200)).toBe(true);
    expect(spanOverlapsRange(span(50, 99), 100, 200)).toBe(false);
  });

  it('overlaps when only the head crosses into the range', () => {
    expect(spanOverlapsRange(span(200, 250), 100, 200)).toBe(true);
    expect(spanOverlapsRange(span(201, 250), 100, 200)).toBe(false);
  });

  it('overlaps when the span contains the whole range', () => {
    expect(spanOverlapsRange(span(0, 1000), 100, 200)).toBe(true);
  });

  it('a still-running span overlaps any range that has not fully passed before its start', () => {
    expect(spanOverlapsRange(span(150, null), 100, 200)).toBe(true);
    expect(spanOverlapsRange(span(150, null), 0, 100)).toBe(false);
  });

  it('an open start overlaps any range that starts before its end', () => {
    expect(spanOverlapsRange(span(null, 150), 100, 200)).toBe(true);
    expect(spanOverlapsRange(span(null, 50), 100, 200)).toBe(false);
  });
});
