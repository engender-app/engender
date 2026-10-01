import { describe, expect, it } from 'vitest';
import {
  CYCLE_MS,
  PHASE_MS,
  clockElapsed,
  isRunning,
  pauseClock,
  readBreath,
  restingClock,
  startClock
} from './breathing';

describe('readBreath', () => {
  it('reads rest as the start of an inhale, fully exhaled', () => {
    const r = readBreath(0);
    expect(r.phase).toBe('inhale');
    expect(r.phaseIndex).toBe(0);
    expect(r.level).toBe(0);
    expect(r.cycleProgress).toBe(0);
    expect(r.phaseProgress).toBe(0);
  });

  it('walks the four phases at 4s each', () => {
    expect(readBreath(PHASE_MS - 1).phase).toBe('inhale');
    expect(readBreath(PHASE_MS).phase).toBe('hold-in');
    expect(readBreath(2 * PHASE_MS).phase).toBe('exhale');
    expect(readBreath(3 * PHASE_MS).phase).toBe('hold-out');
    expect(readBreath(CYCLE_MS).phase).toBe('inhale');
  });

  it('fills on a sine: half full at mid-inhale, full through the hold, half at mid-exhale', () => {
    expect(readBreath(PHASE_MS / 2).level).toBeCloseTo(0.5);
    expect(readBreath(PHASE_MS / 4).level).toBeCloseTo((1 - Math.cos(Math.PI / 4)) / 2);
    expect(readBreath(PHASE_MS).level).toBe(1);
    expect(readBreath(1.5 * PHASE_MS).level).toBe(1);
    expect(readBreath(2.5 * PHASE_MS).level).toBeCloseTo(0.5);
    expect(readBreath(3.5 * PHASE_MS).level).toBe(0);
  });

  it('never jumps: level and cycle progress move less than a frame allows at every 16ms step', () => {
    let prev = readBreath(0);
    for (let t = 16; t <= 3 * CYCLE_MS; t += 16) {
      const r = readBreath(t);
      expect(Math.abs(r.level - prev.level)).toBeLessThan(0.01);
      const step = r.cycleProgress - prev.cycleProgress;
      // forward a frame's worth, or the wrap from ~1 back to ~0
      expect(step > 0 ? step : step + 1).toBeLessThan(0.002);
      prev = r;
    }
  });

  it('draws the first breath exactly like every later one', () => {
    for (let t = 0; t < CYCLE_MS; t += 250) {
      expect(readBreath(t)).toEqual(readBreath(t + 2 * CYCLE_MS));
    }
  });

  it('steps cycle progress once a second under reduced motion, keeping the breath curve', () => {
    expect(readBreath(999, true).cycleProgress).toBe(0);
    expect(readBreath(1000, true).cycleProgress).toBeCloseTo(1 / 16);
    expect(readBreath(1999, true).cycleProgress).toBeCloseTo(1 / 16);
    expect(readBreath(PHASE_MS / 2, true).level).toBeCloseTo(0.5);
  });
});

describe('the breath clock', () => {
  it('rests at zero and does not run', () => {
    const c = restingClock();
    expect(isRunning(c)).toBe(false);
    expect(clockElapsed(c, 123456)).toBe(0);
  });

  it('counts from the moment it starts', () => {
    const c = startClock(restingClock(), 1000);
    expect(isRunning(c)).toBe(true);
    expect(clockElapsed(c, 3500)).toBe(2500);
  });

  /* A frame's rAF timestamp is when the frame began, which can be a few ms
     before the click handler that started the clock stamped its start. A
     negative elapsed wrapped to the cycle's last moment and flashed "Hold"
     on the first frames of the very first inhale (the sign-off flipbook). */
  it('never reads before its own start', () => {
    const c = startClock(restingClock(), 1000);
    expect(clockElapsed(c, 996)).toBe(0);
    expect(readBreath(clockElapsed(c, 996)).phase).toBe('inhale');
  });

  it('freezes on pause and carries on from the same point on resume', () => {
    let c = startClock(restingClock(), 1000);
    c = pauseClock(c, 3500);
    expect(isRunning(c)).toBe(false);
    expect(clockElapsed(c, 99999)).toBe(2500);
    c = startClock(c, 50000);
    expect(clockElapsed(c, 50100)).toBe(2600);
  });

  it('agrees with itself across ten random pauses', () => {
    let c = restingClock();
    let now = 0;
    let running = 0;
    for (let i = 0; i < 10; i++) {
      const run = Math.round(Math.random() * 7000);
      const rest = Math.round(Math.random() * 7000);
      c = startClock(c, now);
      now += run;
      running += run;
      c = pauseClock(c, now);
      now += rest;
      expect(clockElapsed(c, now)).toBe(running);
    }
  });

  it('ignores a start while running and a pause while paused', () => {
    const c = startClock(restingClock(), 1000);
    expect(startClock(c, 5000)).toBe(c);
    const p = pauseClock(c, 2000);
    expect(pauseClock(p, 9000)).toBe(p);
  });
});
