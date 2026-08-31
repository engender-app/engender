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
