/* Box breathing cycle helper for the Safe Space dashboard (ticket 52, ADR-0040).
   Paced at 4-4-4-4 seconds (Inhale, Hold, Exhale, Hold), designed to ground
   and regulate during crisis or intense dysphoria. */

export type BreathingPhase = 'inhale' | 'hold-in' | 'exhale' | 'hold-out';

/** In order, PHASE_MS each. */
export const BOX_BREATHING_PHASES: readonly BreathingPhase[] = ['inhale', 'hold-in', 'exhale', 'hold-out'];

/* One clock for everything the exercise draws (breathing ticket 01). The
   ring, the figure and the phase word used to follow three separate CSS
   transitions off a one-second interval, so they drifted apart and the
   ring dropped from full to empty in a single frame at every boundary.
   Now each frame reads one elapsed time, and every visual is a function
   of it: nothing can disagree and nothing can jump. */
export const PHASE_MS = 4000;
export const CYCLE_MS = PHASE_MS * BOX_BREATHING_PHASES.length;

export interface BreathReading {
  phase: BreathingPhase;
  phaseIndex: number;
  /** 0 at the phase's first frame, approaching 1 at its last. */
  phaseProgress: number;
  /** One lap per 16s cycle, 0 to just under 1. Steps once a second under
      reduced motion, where nothing is allowed to travel continuously. */
  cycleProgress: number;
  /** How full the lungs are: 0 exhaled (rest), 1 full. Ease-in-out sine
      through inhale and exhale, flat through both holds. */
  level: number;
}

export function readBreath(elapsedMs: number, reduced = false): BreathReading {
  const inCycle = ((elapsedMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const phaseIndex = Math.floor(inCycle / PHASE_MS);
  const phaseProgress = (inCycle - phaseIndex * PHASE_MS) / PHASE_MS;
  const phase = BOX_BREATHING_PHASES[phaseIndex];
  const sine = (1 - Math.cos(Math.PI * phaseProgress)) / 2;
  const level = phase === 'inhale' ? sine : phase === 'hold-in' ? 1 : phase === 'exhale' ? 1 - sine : 0;
  const cycleProgress = reduced ? Math.floor(inCycle / 1000) / (CYCLE_MS / 1000) : inCycle / CYCLE_MS;
  return { phase, phaseIndex, phaseProgress, cycleProgress, level };
}

/** Paused time is banked, so a resume carries on from the frame it stopped
    on rather than restarting the phase. */
export interface BreathClock {
  startedAt: number | null;
  banked: number;
}

export function restingClock(): BreathClock {
  return { startedAt: null, banked: 0 };
}

export function isRunning(clock: BreathClock): boolean {
  return clock.startedAt !== null;
}

export function clockElapsed(clock: BreathClock, now: number): number {
  return clock.banked + (clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt));
}

export function startClock(clock: BreathClock, now: number): BreathClock {
  return isRunning(clock) ? clock : { startedAt: now, banked: clock.banked };
}

export function pauseClock(clock: BreathClock, now: number): BreathClock {
  return isRunning(clock) ? { startedAt: null, banked: clockElapsed(clock, now) } : clock;
}
