/* What the glance table has to be true of for the row to read as five faces
   rather than as one mechanism running five times (phase 9 carpet ticket 01,
   Alicja: "make sure that each animation is delayed against others, so that
   they dont all move exactly the same at the same time").

   Every check here is about the row as a whole. Any one face's numbers are a
   designer's choice and nothing holds them; what is held is that no two faces
   can end up doing the same thing at the same moment. */

import { describe, expect, it } from 'vitest';
import { BLINKS_PER_GLANCE, MOOD_GLANCE, blinkCycle } from './moodGlance';

const STEPS = [1, 2, 3, 4, 5];
const glances = STEPS.map((step) => MOOD_GLANCE[step]);

/** Every unordered pair of steps, which is what most of these are about. */
const PAIRS = STEPS.flatMap((a, i) => STEPS.slice(i + 1).map((b) => [a, b] as const));

describe('the glance table', () => {
  it('covers every step of the ramp', () => {
    expect(Object.keys(MOOD_GLANCE).map(Number).sort()).toEqual(STEPS);
  });

  it('runs every face on its own clock', () => {
    expect(new Set(glances.map((g) => g.cycle)).size).toBe(STEPS.length);
  });

  it('starts every face at its own moment', () => {
    expect(new Set(glances.map((g) => g.delay)).size).toBe(STEPS.length);
  });

  /* A ramp is the thing this table exists to avoid. Five faces on 0, 1, 2, 3,
     4 seconds all have distinct delays and are still a wave crossing the row
     left to right, which is exactly what a stagger looks like when it is
     doing the animating instead of the animation. */
  it('scatters the delays rather than ramping them across the row', () => {
    const steps = glances.slice(1).map((g, i) => g.delay - glances[i].delay);
    expect(steps.every((d) => d > 0) || steps.every((d) => d < 0)).toBe(false);
  });

  /* And spread over most of a cycle, not clustered in its first second: the
     delay is what separates the five at the instant the picker opens, before
     the different periods have had any time to do it. */
  it('spreads the delays across most of the shortest cycle', () => {
    const shortest = Math.min(...glances.map((g) => g.cycle));
    const spread = Math.max(...glances.map((g) => g.delay)) - Math.min(...glances.map((g) => g.delay));
    expect(spread).toBeGreaterThan(shortest / 2);
    expect(spread).toBeLessThan(shortest);
  });

  /* Two periods that agree every few cycles put those two faces back in step
     often enough to see. 8 is well past the length of any look at a mood
     picker; the pairs here first agree at 43 cycles and worse. */
  it('gives no two faces a period they agree on again while anyone is watching', () => {
    const offenders: string[] = [];
    for (const [a, b] of PAIRS) {
      for (let n = 1; n <= 8; n++) {
        for (let m = 1; m <= 8; m++) {
          const drift = Math.abs(n * MOOD_GLANCE[a].cycle - m * MOOD_GLANCE[b].cycle);
          if (drift < 0.2) offenders.push(`steps ${a} and ${b} line up again after ${n} and ${m} cycles`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sends some faces round the other way, so the row is not one sweep at five speeds', () => {
    expect(new Set(glances.map((g) => g.direction)).size).toBe(2);
  });

  it('gives a face a resting human blink rather than a tic or a stare', () => {
    for (const step of STEPS) {
      expect(blinkCycle(step)).toBeGreaterThan(3);
      expect(blinkCycle(step)).toBeLessThan(6);
    }
  });

  /* The one number in this file that is a mechanism rather than a taste: the
     eyes change direction on the blink, so the lid covers the jump. If the
     blink stopped dividing the glance a whole number of times the two would
     drift and the saccade would happen in the open, which is the one thing a
     real eye never does. */
  it('fits a whole number of blinks into every glance', () => {
    for (const step of STEPS) {
      expect(MOOD_GLANCE[step].cycle / blinkCycle(step)).toBeCloseTo(BLINKS_PER_GLANCE, 10);
    }
    expect(Number.isInteger(BLINKS_PER_GLANCE)).toBe(true);
  });
});
