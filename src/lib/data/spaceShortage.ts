/* Whether a failed write ran out of space, and where (last-audit ui 37).

   A full disk used to read as any other failure: "Couldn't save this entry",
   "Couldn't finish the export", "Something went wrong while opening it". The
   person had no way to know that freeing space was the fix. This names the
   one failure that has a fix they can make, and nothing else: an unnamed
   failure keeps its own message.

   - `device`: storage this app writes to directly ran out. SQLite says
     "database or disk is full" (SQLITE_FULL) on both drivers, a native file
     write says ENOSPC, java.nio says "No space left on device", and a
     browser refuses with QuotaExceededError. The export bridge rejects its
     own staging failure with the code `storage-full`, because Capacitor
     hands JavaScript the rejection's message and code, never the exception.
   - `destination`: the place an export was being saved to was full, either
     by the save's own preflight or when the provider refused the bytes. The
     export bridge rejects with `destination-full`; the text never says so.

   Read through `cause` and AggregateError's `errors`: the transactor keeps a
   statement's error first when SQLite has already rolled back and the
   explicit ROLLBACK is refused (backend 76), and a failure that arrives
   wrapped keeps the original underneath. */

export type SpaceShortage = 'device' | 'destination';

const OUT_OF_SPACE = /database or disk is full|SQLITE_FULL|ENOSPC|no space left on device/i;

type Failure = { name?: unknown; code?: unknown; message?: unknown; cause?: unknown; errors?: unknown };

function* failures(error: unknown, seen = new Set<unknown>()): Generator<Failure | string> {
  if (error == null || seen.has(error)) return;
  seen.add(error);
  if (typeof error === 'string') {
    yield error;
    return;
  }
  if (typeof error !== 'object') return;
  const failure = error as Failure;
  yield failure;
  yield* failures(failure.cause, seen);
  if (Array.isArray(failure.errors)) for (const inner of failure.errors) yield* failures(inner, seen);
}

export function spaceShortage(error: unknown): SpaceShortage | null {
  let device = false;
  for (const failure of failures(error)) {
    if (typeof failure === 'string') {
      device ||= OUT_OF_SPACE.test(failure);
      continue;
    }
    if (failure.code === 'destination-full') return 'destination';
    device ||=
      failure.code === 'storage-full' ||
      failure.name === 'QuotaExceededError' ||
      (typeof failure.message === 'string' && OUT_OF_SPACE.test(failure.message));
  }
  return device ? 'device' : null;
}
