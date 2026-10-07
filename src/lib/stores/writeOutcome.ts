/* How a tapped write ends (after-release ticket 06). A write that rejects
   has to say so, because nothing else will: there is no unhandledrejection
   handler, and a promise nobody awaits fails where no one is looking.
   Framework-free so the node tier can drive it; attempt.svelte.ts binds it to
   the toast and to a reactive busy flag. */

export type Report = (message: string) => void;

/** Runs a write. Resolves true once it lands; on a rejection (or a throw
    before it returned) it reports `failMessage` and resolves false, so the
    caller never rethrows into the void. */
export async function attemptWith(write: () => unknown, failMessage: string, report: Report): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (error) {
    console.error(error);
    report(failMessage);
    return false;
  }
}

/** The same, for one button: a tap while the last write is still in flight
    writes nothing and resolves false. `onBusy` hears true before the write
    and false after it settles, either way, for `disabled={busy}`. */
export function oneAtATime(report: Report, onBusy: (busy: boolean) => void = () => {}) {
  let busy = false;
  return async (write: () => unknown, failMessage: string): Promise<boolean> => {
    if (busy) return false;
    busy = true;
    onBusy(true);
    try {
      return await attemptWith(write, failMessage, report);
    } finally {
      busy = false;
      onBusy(false);
    }
  };
}
