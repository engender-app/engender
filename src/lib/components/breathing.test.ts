import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOX_BREATHING_PHASES,
  initialBreathingState,
  phaseProgress,
  tickBreathing,
  type BreathingState
} from './breathing';

describe('breathing state machine', () => {
  it('starts idle with inhale phase and 4 seconds remaining', () => {
    const s = initialBreathingState();
    expect(s.running).toBe(false);
    expect(s.phase).toBe('inhale');
    expect(s.phaseIndex).toBe(0);
    expect(s.secondsRemaining).toBe(4);
  });

  it('does not advance when not running', () => {
    const s = initialBreathingState();
    const next = tickBreathing(s);
    expect(next).toEqual(s);
  });

  it('counts down seconds within a phase', () => {
    let s: BreathingState = { ...initialBreathingState(), running: true, secondsRemaining: 4 };
    s = tickBreathing(s);
    expect(s.secondsRemaining).toBe(3);
    expect(s.phase).toBe('inhale');
    s = tickBreathing(s);
    expect(s.secondsRemaining).toBe(2);
    s = tickBreathing(s);
    expect(s.secondsRemaining).toBe(1);
  });

  it('transitions through the 4 box breathing phases in sequence', () => {
    let s: BreathingState = { ...initialBreathingState(), running: true, secondsRemaining: 1 };
    // Transitions from inhale -> hold-in
    s = tickBreathing(s);
    expect(s.phase).toBe('hold-in');
    expect(s.phaseIndex).toBe(1);
    expect(s.secondsRemaining).toBe(4);

    // Transitions from hold-in -> exhale
    s.secondsRemaining = 1;
    s = tickBreathing(s);
    expect(s.phase).toBe('exhale');
    expect(s.phaseIndex).toBe(2);
    expect(s.secondsRemaining).toBe(4);

    // Transitions from exhale -> hold-out
    s.secondsRemaining = 1;
    s = tickBreathing(s);
    expect(s.phase).toBe('hold-out');
    expect(s.phaseIndex).toBe(3);
    expect(s.secondsRemaining).toBe(4);

    // Transitions from hold-out -> inhale (loops)
    s.secondsRemaining = 1;
    s = tickBreathing(s);
    expect(s.phase).toBe('inhale');
    expect(s.phaseIndex).toBe(0);
    expect(s.secondsRemaining).toBe(4);
  });
});

describe('phaseProgress', () => {
  it('is 1/duration at the first second of a phase, aiming for the end of that second', () => {
    expect(phaseProgress(4, 4)).toBeCloseTo(0.25);
  });

  it('reaches 1 (full) on the phase\'s last second', () => {
    expect(phaseProgress(4, 1)).toBe(1);
  });

  it('climbs one step per second in between', () => {
    expect(phaseProgress(4, 3)).toBeCloseTo(0.5);
    expect(phaseProgress(4, 2)).toBeCloseTo(0.75);
  });

  it('scales to whatever duration a phase carries', () => {
    expect(phaseProgress(8, 8)).toBeCloseTo(0.125);
    expect(phaseProgress(8, 1)).toBe(1);
  });
});

/* The ring's reset, held at the level a source read can hold it (carpet 30).

   `tickBreathing` reassigns the whole state object every second, so an
   `$effect` that reads any field of `breath` depends on `breath` itself and
   re-runs on every tick. The reset effect in `BreathingExercise.svelte` read
   `breath.running` one line under a comment claiming it was keyed on
   `phaseIndex` alone, so it emptied the ring every second and had a single
   frame to transition out of it. Measured on a frame sampler against main at
   8ae757fa, over 9s of a running exercise: the drawn fraction reached 18.7%,
   37.5%, 56.2% and 75% and dropped to 0.0% in between, four times per 4s
   phase. Keyed through a `$derived` it rises 6.2% to 93.7% across the phase
   and resets once, at the boundary.

   A source read rather than a render, because the defect is a reactivity
   graph and neither the pure module below nor any DOM assertion can see it:
   what a test can hold is that the effect reads the derived and nothing off
   `breath`. Seen to fail against the old line. */
describe('the countdown ring resets once a phase, not once a second', () => {
  const source = readFileSync('src/lib/components/BreathingExercise.svelte', 'utf8');
  const effect = /\$effect\(\(\) => \{([\s\S]*?)\n  \}\);/.exec(
    source.slice(source.indexOf('let ringPhase'))
  );

  it('keys the reset on a derived phase rather than on the state object', () => {
    expect(source).toMatch(/let ringPhase = \$derived\(/);
    expect(effect, 'no $effect after the ringPhase derived').toBeTruthy();
    expect(effect![1]).toMatch(/ringPhase/);
    expect(effect![1], 'the effect reads breath and so re-runs every tick').not.toMatch(/\bbreath\b/);
  });
});
