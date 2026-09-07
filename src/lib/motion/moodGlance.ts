/* The mood faces looking around the room (phase 9 carpet ticket 01).

   ## Why there are two ambient loops now

   DIRECTION.md's budget was one: the flag sun's 7s breath, on the one element
   that carries identity, and ADR-0051 refused a second one after four rounds
   of form failed to earn it. This is the second one, and it is deliberate
   (ADR-0071, Alicja 2026-09-07). It does not cite ADR-0050, which the budget
   forbids; the argument is its own and it is about what was already there.

   The faces were never still. `face-blink` ran forever on five of them
   wherever a mood was being chosen, so the budget had already been spent - it
   had just been spent on a loop that said nothing. A blink is a timer. What
   this replaces it with is the same amount of motion doing the job the drawing
   was made for: MoodFace's five faces are one face in five moods, and a face
   with eyes that never move is a mask of one.

   ## Why every face runs its own clock

   Five faces on one delay is a wave: the same movement crossing the row left
   to right, over and over, which reads as a mechanism rather than as five
   things that happen to be alive. So no two steps share a period, no two share
   a delay, the delays are not a ramp, and the periods have no small common
   multiple - 12.9 and 13.5 seconds only agree again after 43 and 45 cycles,
   about ten minutes in, by which time nobody is still watching a mood picker.
   The row drifts apart and stays apart.

   ## Why the blink divides the cycle exactly

   A real eye moves during a blink. The saccade is masked by the lid, which is
   why you never see your own eyes jump in a mirror. So each face's blink is
   exactly a third of its glance, and the glance changes direction on the beat
   the blink lands on: three positions per cycle, each arrived at behind a
   closed lid. That is the whole reason the numbers are what they are, and the
   one thing in this file a test has to hold. */

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
