/* How a tapped write ends. A write that rejects
   has to say so, because nothing else will: there is no unhandledrejection
   handler, and a promise nobody awaits fails where no one is looking.
   Framework-free so the node tier can drive it; attempt.svelte.ts binds it to
   the toast and to a reactive busy flag. */

/** `error` is what the write threw, so a report can say something truer than
    `message` when it knows the failure (a full disk, last-audit ui 37). */
export type Report = (message: string, error: unknown) => void;

/** Runs a write. Resolves true once it lands; on a rejection (or a throw
    before it returned) it reports `failMessage` and resolves false, so the
    caller never rethrows into the void. */
export async function attemptWith(write: () => unknown, failMessage: string, report: Report): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (error) {
    console.error(error);
    report(failMessage, error);
    return false;
  }
}

/** The same, for one button: a tap while the last write is still in flight
    writes nothing and resolves false. `onBusy` hears true before the write
    and false after it settles, either way, for `disabled={busy}`. */
export function oneAtATime(report: Report, onBusy: (busy: boolean) => void = () => {}) {
  const run = oneAtATimeEach(report, (_key, busy) => onBusy(busy));
  return (write: () => unknown, failMessage: string): Promise<boolean> => run('', write, failMessage);
}

/** `oneAtATime` for a control every row of a list repeats (a checkbox, a
    flag): a tap on a row whose last write is still in flight writes nothing,
    while another row's tap goes ahead. */
export function oneAtATimeEach(report: Report, onBusy: (key: string, busy: boolean) => void = () => {}) {
  const inFlight = new Set<string>();
  return async (key: string, write: () => unknown, failMessage: string): Promise<boolean> => {
    if (inFlight.has(key)) return false;
    inFlight.add(key);
    onBusy(key, true);
    try {
      return await attemptWith(write, failMessage, report);
    } finally {
      inFlight.delete(key);
      onBusy(key, false);
    }
  };
}
