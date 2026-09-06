import { describe, expect, it } from 'vitest';
import { weekStripDayCount, WEEK_STRIP_DESKTOP_BREAKPOINT } from './weekStripDayCount';

describe('weekStripDayCount', () => {
  it('holds at 7 below the desktop breakpoint', () => {
    expect(weekStripDayCount(0, false)).toBe(7);
    expect(weekStripDayCount(390, false)).toBe(7);
    expect(weekStripDayCount(WEEK_STRIP_DESKTOP_BREAKPOINT - 1, false)).toBe(7);
  });

  it('widens to 14 at the desktop breakpoint on web', () => {
    expect(weekStripDayCount(WEEK_STRIP_DESKTOP_BREAKPOINT, false)).toBe(14);
    expect(weekStripDayCount(2000, false)).toBe(14);
  });

  it('holds Android at 7 whatever the container measures', () => {
    expect(weekStripDayCount(WEEK_STRIP_DESKTOP_BREAKPOINT, true)).toBe(7);
    expect(weekStripDayCount(2000, true)).toBe(7);
  });
});
