import { readFileSync } from 'node:fs';
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

  it('matches the shell\'s own desktop breakpoint rather than drifting from it', () => {
    /* Three CSS files and this constant all say 1024px with nothing but a
       comment holding them together - this is the guard that turns a
       silent drift (someone moves the shell's breakpoint, forgets the
       other three) into a failing test instead. */
    const query = `@container app (min-width: ${WEEK_STRIP_DESKTOP_BREAKPOINT}px)`;
    expect(readFileSync('src/lib/styles/app.css', 'utf8')).toContain(query);
    expect(readFileSync('src/lib/styles/kit.css', 'utf8')).toContain(query);
  });
});
