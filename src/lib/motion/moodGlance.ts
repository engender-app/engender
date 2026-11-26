/* Give each mood face its own glance period and delay so the row
   never moves in a wave (ADR-0071). Glances replace the existing
   face-blink loop in the ambient motion budget. Use periods with a
   long common multiple to keep the faces from drifting into sync.

   Each blink takes exactly one third of its face's glance cycle.
   Change eye position on the blink beat so each of the three moves
   happens under a closed lid. */

export type MoodGlance = {
  /** Seconds for one pass through the three glance positions. */
  cycle: number;
  /** Seconds before this face joins in, so the row starts already scattered
      rather than settling into scatter over the first minute. */
  delay: number;
  /** Which way round the three positions are visited. Two faces on the same
      period would still differ; five faces all sweeping the same way would
      still be a wave, at five speeds. */
  direction: 1 | -1;
};

/** How many blinks fit in one glance, and so how many positions the glance
    visits. Three: two is a metronome and four is long enough that the last
    leg of the cycle is a face that has forgotten what it was doing. */
export const BLINKS_PER_GLANCE = 3;

export const MOOD_GLANCE: Record<number, MoodGlance> = {
  1: { cycle: 12.9, delay: 0, direction: -1 },
  2: { cycle: 14.1, delay: 5.2, direction: 1 },
  3: { cycle: 13.5, delay: 2.1, direction: 1 },
  4: { cycle: 15.3, delay: 7.9, direction: -1 },
  5: { cycle: 13.8, delay: 3.4, direction: 1 }
};

/** One face's blink period: its glance divided exactly, so a change of
    direction always happens behind a closed lid. 4.3s to 5.1s across the
    five, which is also about where a resting human blink sits. */
export function blinkCycle(step: number): number {
  return MOOD_GLANCE[step].cycle / BLINKS_PER_GLANCE;
}
