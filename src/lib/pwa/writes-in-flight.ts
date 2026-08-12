/* Whether the journal is in the middle of something an update must not land
   on (ticket 04).

   A waiting service worker that takes over during a write swaps the code out
   from under a half-finished one. For an entry save that is a spinner that
   never resolves; for a migration or an encryption conversion it can be the
   journal. So the app never asks a waiting worker to activate while anything
   here is open, and never offers the update action either - update.ts reads
   this, and the notice appears when it clears.

   Four things enter: every journal write, which writes.ts wraps at one choke
   point and which covers an Archive import too (an import is a declared write
   on every table); the migrations in boot.ts; and the encryption conversion in
   boot.svelte.ts.

   A counter rather than a flag, because two writes overlap routinely - an
   entry save and the photo store's write land on their own schedules - and the
   first one finishing does not mean the journal is idle. Rune-free like
   writes.ts, for the same two reasons: the Node tier can test it, and a
   service worker's message plumbing has no business in reactive state. */

let open = 0;
const listeners = new Set<(busy: boolean) => void>();

function announce(busy: boolean): void {
  for (const listener of listeners) listener(busy);
}

/** Opens the guard, and hands back the release. Call it in a `finally`: a
    write that threw has finished as surely as one that resolved, and a
    release that never runs would keep the app on an old release for the rest
    of the session.

    The release is idempotent, so a caller that has already let go cannot
    release somebody else's write by calling twice. */
export function enterWriteInFlight(): () => void {
  open += 1;
  if (open === 1) announce(true);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    open -= 1;
    if (open === 0) announce(false);
  };
}

/** True while anything an update must not interrupt is running. */
export function writeInFlight(): boolean {
  return open > 0;
}

/** Called on the edges only - when the journal becomes busy and when it goes
    idle again - because that is the whole of what a listener acts on.
    Returns the way to stop listening. */
export function onWriteInFlightChange(listener: (busy: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
