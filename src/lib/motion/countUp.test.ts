import { afterEach, describe, expect, it } from 'vitest';

import { asCount, countAt, countUp } from './countUp';

/* The same stub reveal.test.ts uses: the primitive reads its duration out of
   the token layer and the reduced-motion signal off documentElement. */
function stubDocument(reduced = false) {
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: { dataset: reduced ? { a11yMotion: 'reduce' } : {} } };
  g.getComputedStyle = () => ({
    getPropertyValue: (name: string) => ({ '--dur-slow': '380ms' })[name] ?? ''
  });
}

/** A hand-cranked animation frame, so a test can step the clock itself. */
function stubFrames() {
  const g = globalThis as Record<string, unknown>;
  const queue: FrameRequestCallback[] = [];
  let now = 1000;
  g.performance = { now: () => now };
  g.requestAnimationFrame = (cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  };
  g.cancelAnimationFrame = () => {
    queue.length = 0;
  };
  return {
    /** Advances the clock and runs every frame queued up to now. */
    tick(ms: number) {
      now += ms;
      const pending = queue.splice(0);
      for (const cb of pending) cb(now);
    },
    get pending() {
      return queue.length;
    }
  };
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.document;
  delete g.getComputedStyle;
  delete g.performance;
  delete g.requestAnimationFrame;
  delete g.cancelAnimationFrame;
});

describe('asCount: which values count up', () => {
  it('reads a plain integer as a count', () => {
    expect(asCount('28')).toBe(28);
    expect(asCount('0')).toBe(0);
    expect(asCount('1204')).toBe(1204);
  });

  /* A name, a duration and a date cut (ticket 25): "a value that is a
     count counts up on arrival and on change; a value that is a name or a
     duration cuts". Anything that is not only digits is not a count. */
  it('leaves a name, a duration, a date and a decimal alone', () => {
    expect(asCount('Estradiol valerate')).toBeNull();
    expect(asCount('9h 0m 15s')).toBeNull();
    expect(asCount('3 Aug 2025')).toBeNull();
    expect(asCount('2.5')).toBeNull();
    expect(asCount('12 days')).toBeNull();
    expect(asCount('')).toBeNull();
    expect(asCount(undefined)).toBeNull();
  });
});

describe('countAt: the number shown at a moment of the travel', () => {
  it('starts where it came from and lands on the target', () => {
    expect(countAt(0, 28, 0)).toBe(0);
    expect(countAt(0, 28, 1)).toBe(28);
    expect(countAt(40, 12, 1)).toBe(12);
  });

  it('decelerates: more than half the distance is covered by the midpoint', () => {
    expect(countAt(0, 100, 0.5)).toBeGreaterThan(50);
    expect(countAt(0, 100, 0.5)).toBeLessThan(100);
  });

  it('is always a whole number, so a count never shows a fraction', () => {
    for (const t of [0.1, 0.33, 0.5, 0.77, 0.9]) expect(Number.isInteger(countAt(0, 7, t))).toBe(true);
  });
});

describe('countUp: the runner', () => {
  it('runs the count over --dur-slow and hands back every frame', () => {
    stubDocument();
    const frames = stubFrames();
    const seen: number[] = [];
    countUp(0, 28, (n) => seen.push(n));
    expect(seen).toEqual([]);
    frames.tick(0);
    frames.tick(100);
    frames.tick(100);
    frames.tick(100);
    frames.tick(100);
    expect(seen.at(-1)).toBe(28);
    expect(seen.length).toBeGreaterThan(2);
    /* Monotonic: a count-up never counts back on its way up. */
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(frames.pending).toBe(0);
  });

  /* The reduced-motion substitute the ticket names: a count-up becomes the
     final number, in the same frame, with nothing between. */
  it('lands on the final number at once under reduced motion', () => {
    stubDocument(true);
    const frames = stubFrames();
    const seen: number[] = [];
    countUp(0, 28, (n) => seen.push(n));
    expect(seen).toEqual([28]);
    expect(frames.pending).toBe(0);
  });

  it('can be cancelled mid-travel, and then reports nothing more', () => {
    stubDocument();
    const frames = stubFrames();
    const seen: number[] = [];
    const cancel = countUp(0, 28, (n) => seen.push(n));
    frames.tick(0);
    frames.tick(50);
    const before = seen.length;
    cancel();
    frames.tick(400);
    expect(seen.length).toBe(before);
  });

  it('does nothing when there is no distance to travel', () => {
    stubDocument();
    const frames = stubFrames();
    const seen: number[] = [];
    countUp(28, 28, (n) => seen.push(n));
    expect(seen).toEqual([28]);
    expect(frames.pending).toBe(0);
  });
});
