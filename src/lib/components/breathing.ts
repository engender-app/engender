/* Box breathing cycle helper for the Safe Space dashboard (ticket 52, ADR-0040).
   Paced at 4-4-4-4 seconds (Inhale, Hold, Exhale, Hold), designed to ground
   and regulate during crisis or intense dysphoria. */

export type BreathingPhase = 'inhale' | 'hold-in' | 'exhale' | 'hold-out';

export interface BreathingState {
  phase: BreathingPhase;
  phaseIndex: number;
  secondsRemaining: number;
  running: boolean;
}

export const BOX_BREATHING_PHASES: readonly { phase: BreathingPhase; duration: number }[] = [
  { phase: 'inhale', duration: 4 },
  { phase: 'hold-in', duration: 4 },
  { phase: 'exhale', duration: 4 },
  { phase: 'hold-out', duration: 4 }
];

export function initialBreathingState(): BreathingState {
  return {
    phase: 'inhale',
    phaseIndex: 0,
    secondsRemaining: 4,
    running: false
  };
}

export function tickBreathing(state: BreathingState): BreathingState {
  if (!state.running) return state;
  if (state.secondsRemaining > 1) {
    return {
      ...state,
      secondsRemaining: state.secondsRemaining - 1
    };
  }
  const nextIndex = (state.phaseIndex + 1) % BOX_BREATHING_PHASES.length;
  const nextPhase = BOX_BREATHING_PHASES[nextIndex];
  return {
    ...state,
    phaseIndex: nextIndex,
    phase: nextPhase.phase,
    secondsRemaining: nextPhase.duration
  };
}
