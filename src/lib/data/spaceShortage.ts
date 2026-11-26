/* Classify storage failures without changing unrelated error messages.
   Device storage can report SQLITE_FULL, ENOSPC, “No space left on
   device”, QuotaExceededError, or the export bridge's `storage-full`.
   The bridge reports a full save location as `destination-full`.

   Inspect `cause` and AggregateError's `errors` so an outer rollback
   failure does not hide an earlier storage error. */

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
