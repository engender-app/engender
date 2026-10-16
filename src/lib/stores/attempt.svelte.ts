/* The toast-bound half of writeOutcome.ts (after-release ticket 06): a
   write that fails says so in a toast, and a button that writes can hold
   itself disabled while its write is in flight. A write that failed because
   storage is full says that instead of the caller's message, since freeing
   space is the one fix the person can make (last-audit ui 37). */
import { m } from '$lib/paraglide/messages';
import { spaceShortage } from '$lib/data/spaceShortage';
import { toast } from './toasts.svelte';
import { attemptWith, oneAtATime, oneAtATimeEach } from './writeOutcome';

const sayFailed = (message: string, error: unknown) =>
  toast(spaceShortage(error) ? m.storage_full_save() : message, { kind: 'failed' });

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

/** One control repeated on every row of a list: `run(key, write, message)`
    is `attempt` that refuses a second tap on the same row while that row's
    write is in flight. Nothing is disabled meanwhile: the row's own state
    answers once the write lands, and a fade on a write this short would
    only flicker. */
export function rowWriter() {
  return oneAtATimeEach(sayFailed);
}

/** A delete behind ConfirmDeleteSheet, for a screen that holds its own
    target rather than a recordEditor: `run` refuses a second tap while the
    first is in flight, and a failure is kept in `failed` for the sheet to
    say, instead of a toast under it. Pass `busy` and `failed` to the sheet,
    and call `dismiss` when it is cancelled. */
export function deleter() {
  let busy = $state(false);
  let failed = $state(false);
  const run = oneAtATime(
    () => { failed = true; },
    (value) => {
      busy = value;
      if (value) failed = false;
    }
  );
  return {
    get busy() {
      return busy;
    },
    get failed() {
      return failed;
    },
    run: (remove: () => unknown) => run(remove, ''),
    dismiss() {
      failed = false;
    }
  };
}
