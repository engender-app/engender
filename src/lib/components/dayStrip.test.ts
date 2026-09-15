import { describe, expect, it } from 'vitest';
import { canPageBack, stripCellOf, stripSlots, stripWindow, STRIP_DAYS } from './dayStrip';

const TODAY = 20_000;

describe('stripWindow', () => {
  it('ends the current window on today', () => {
    expect(stripWindow(TODAY, 0)).toEqual({ first: TODAY - 6, last: TODAY });
  });

  it('steps back a whole week at a time, leaving no day in two windows and none in neither', () => {
    const now = stripWindow(TODAY, 0);
    const back = stripWindow(TODAY, 1);
    expect(back.last).toBe(now.first - 1);
    expect(back.last - back.first + 1).toBe(STRIP_DAYS);
  });
});

describe('stripSlots', () => {
  it('draws every day of the window, earliest first, whatever the marks say', () => {
    const slots = stripSlots(stripWindow(TODAY, 0), TODAY, () => 'off');
    expect(slots.map((s) => s.epochDay)).toEqual([
      TODAY - 6,
      TODAY - 5,
      TODAY - 4,
      TODAY - 3,
      TODAY - 2,
      TODAY - 1,
      TODAY
    ]);
  });

  it('marks today, and only in a window that holds it', () => {
    const here = stripSlots(stripWindow(TODAY, 0), TODAY, () => 'off');
    expect(here.filter((s) => s.isToday).map((s) => s.epochDay)).toEqual([TODAY]);
    const back = stripSlots(stripWindow(TODAY, 1), TODAY, () => 'off');
    expect(back.some((s) => s.isToday)).toBe(false);
  });

  it('asks the caller what each day is', () => {
    const slots = stripSlots(stripWindow(TODAY, 0), TODAY, (day) =>
      day === TODAY ? 'expected' : day % 2 === 0 ? 'logged' : 'off'
    );
    expect(slots.at(-1)!.mark).toBe('expected');
    expect(slots.filter((s) => s.mark === 'logged').every((s) => s.epochDay % 2 === 0)).toBe(true);
  });
});

describe('stripCellOf', () => {
  it('fills a logged day and leaves an expected-but-empty one at the ramp\'s floor', () => {
    expect(stripCellOf('logged').level).toBeGreaterThan(0);
    expect(stripCellOf('expected').level).toBe(0);
  });

  it('paints an expected day and a day nothing was expected on the same, so only the outline tells them apart', () => {
    expect(stripCellOf('off').level).toBe(stripCellOf('expected').level);
    expect(stripCellOf('off').blank).toBe(true);
    expect(stripCellOf('expected').blank).toBe(false);
  });

  it('gives a logged day its outline too, so a fill never arrives with an edge change as well', () => {
    expect(stripCellOf('logged').blank).toBe(false);
  });
});

describe('canPageBack', () => {
  it('stops at the first day the screen has anything for', () => {
    const window = stripWindow(TODAY, 0);
    expect(canPageBack(window, window.first)).toBe(false);
    expect(canPageBack(window, window.first - 1)).toBe(true);
  });

  it('refuses a journal with nothing in it at all', () => {
    expect(canPageBack(stripWindow(TODAY, 0), null)).toBe(false);
  });
});
