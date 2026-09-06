/* One long operation's bar, as a thing a screen can hold (phase 9 audit
   ticket 11, ADR-0070). The reactive half of progress.ts, deliberately thin
   the way documentTargets.svelte.ts is: `$state` and the three timers only,
   so every decision with a right answer stays in the rune-free module a
   node test can reach.

   Why a run object rather than three `$state` variables per screen. Two of
   the four behaviours ADR-0070 asks for are not renderable from a value the
   screen already has: the show delay means the bar appears later than the
   operation starts, and the completion hold means whatever happens next -
   a toast, a screen swap, a sheet closing - waits for the bar rather than
   racing it. `await progress.finish()` is that wait, and it is the reason
   this is an object with a method instead of a prop.

   It is not a task registry (ADR-0070's own out-of-scope list). Nothing
   registers with it, it knows nothing about what is running, and a screen
   that wants two of them makes two. */

import { tick } from 'svelte';
import { motionDuration } from '$lib/motion/tokens';
import {
  PROGRESS_SAMPLE_MS,
  PROGRESS_SHOW_DELAY_MS,
  progressFraction,
  settleDelay
} from './progress';

export interface ProgressRun {
  /** Whether the bar is on screen. False for the first
      PROGRESS_SHOW_DELAY_MS of every run, and for all of a run that
      finishes inside it. */
  readonly visible: boolean;
  /** The fill, 0 to 1, or null while the operation cannot say how much is
      left - which is the indeterminate case rather than a zero. */
  readonly fraction: number | null;
  /** Whether a cancel has been asked for and not yet arrived. */
  readonly stopping: boolean;
  /** Whether this run offered a way to stop it. The safety reasoning lives
      at the call site (ADR-0070): the component only knows whether it was
      handed a handler. */
  readonly cancellable: boolean;

  /** The operation has begun. `onCancel` is what the stop button calls;
      leaving it out is what makes a run uncancellable. `immediate` skips
      the show delay, which is right only where the screen exists for the
      operation and nothing else - the conversion gate, the pre-migration
      restore - so there is no other content for a bar to flash over. */
  start(options?: { onCancel?: () => void; immediate?: boolean }): void;
  /** The operation's own unit of work, as often as it likes. What reaches
      the fill is the latest value at each sample, not this call. */
  report(done: number, total: number): void;
  /** The operation is done. Snaps to full, holds, and resolves once the
      bar is gone, so the caller's next visible step follows it. */
  finish(): Promise<void>;
  /** The operation failed or was stopped. Nothing to hold at full for. */
  abandon(): void;
  /** The stop button. */
  cancel(): void;
}

export function createProgress(): ProgressRun {
  let visible = $state(false);
  let fraction = $state<number | null>(null);
  let stopping = $state(false);
  let cancellable = $state(false);

  /* The latest report, held outside `$state` on purpose: this is written on
     every raw callback - every 10-40ms per row on the long-journal fixture -
     and the sample below is what turns that into a repaint. */
  let pending: number | null = null;
  let shownAt = 0;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let sampleTimer: ReturnType<typeof setInterval> | null = null;
  let onCancel: (() => void) | null = null;

  function clearTimers() {
    if (showTimer !== null) clearTimeout(showTimer);
    if (sampleTimer !== null) clearInterval(sampleTimer);
    showTimer = null;
    sampleTimer = null;
  }

  function show() {
    showTimer = null;
    visible = true;
    shownAt = Date.now();
    fraction = pending;
    sampleTimer = setInterval(() => {
      fraction = pending;
    }, PROGRESS_SAMPLE_MS);
  }

  const run: ProgressRun = {
    get visible() {
      return visible;
    },
    get fraction() {
      return fraction;
    },
    get stopping() {
      return stopping;
    },
    get cancellable() {
      return cancellable;
    },

    start(options) {
      clearTimers();
      pending = null;
      fraction = null;
      stopping = false;
      visible = false;
      onCancel = options?.onCancel ?? null;
      cancellable = onCancel !== null;
      if (options?.immediate) show();
      else showTimer = setTimeout(show, PROGRESS_SHOW_DELAY_MS);
    },

    report(done, total) {
      pending = progressFraction(done, total);
    },

    async finish() {
      clearTimers();
      if (!visible) {
        // Never appeared, so there is nothing to hold at full and nothing
        // for the caller to wait behind.
        run.abandon();
        return;
      }
      fraction = 1;
      // So the full bar and its 100% are in the DOM before the wait below,
      // which is 0 under reduced motion.
      await tick();
      const wait = settleDelay(Date.now() - shownAt, motionDuration('--dur-med'));
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      run.abandon();
    },

    abandon() {
      clearTimers();
      pending = null;
      visible = false;
      fraction = null;
      stopping = false;
      cancellable = false;
      onCancel = null;
    },

    cancel() {
      if (onCancel === null || stopping) return;
      stopping = true;
      onCancel();
    }
  };

  return run;
}
