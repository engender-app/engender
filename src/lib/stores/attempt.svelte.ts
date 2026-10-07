/* The toast-bound half of writeOutcome.ts (after-release ticket 06): a
   write that fails says so in a toast, and a button that writes can hold
   itself disabled while its write is in flight. */
import { toast } from './toasts.svelte';
import { attemptWith, oneAtATime } from './writeOutcome';

const sayFailed = (message: string) => toast(message, { kind: 'failed' });

/** Runs a write; a rejection becomes a toast saying `failMessage`. Resolves
    whether the write landed, so the caller can confirm it. */
export function attempt(write: () => unknown, failMessage: string): Promise<boolean> {
  return attemptWith(write, failMessage, sayFailed);
}

/** One button's writes: `run` is `attempt` that refuses a second tap while
    the first is in flight, and `busy` is for the button's `disabled`. */
export function writer() {
  let busy = $state(false);
  const run = oneAtATime(sayFailed, (value) => { busy = value; });
  return {
    get busy() {
      return busy;
    },
    run
  };
}
