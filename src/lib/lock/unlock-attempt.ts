/** A later lock owns the session even if authentication is still running. */
export class UnlockCancelledError extends Error {
  constructor() {
    super('the unlock was cancelled by a newer lock');
  }
}

export function unlockAttempts() {
  let generation = 0;
  return {
    lock() { generation++; },
    begin() {
      const mine = generation;
      return () => {
        if (mine !== generation) throw new UnlockCancelledError();
      };
    }
  };
}
