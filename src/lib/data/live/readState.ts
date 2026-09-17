/* Shared outcomes for live reads. Refresh failures retain the last result. */

export interface ReadState<T> {
  /** The last result, or `undefined` until the first one lands. */
  readonly value: T | undefined;
  /** True until the first run settles, whichever way it settles. A re-run
      after a write keeps showing the previous result rather than flashing the
      skeleton again: what is on screen is one round trip old, not absent. */
  readonly loading: boolean;
  /** True when the most recent run rejected. Cleared by the next one that
      lands, so a read that recovers stops saying it failed. */
  readonly failed: boolean;
}

/** Before the first run has answered. */
export function pending<T>(): ReadState<T> {
  return { value: undefined, loading: true, failed: false };
}

/** A run came back with a result. */
export function landed<T>(value: T): ReadState<T> {
  return { value, loading: false, failed: false };
}

/** A run rejected. The previous result stays on screen: it is one round trip
    old rather than wrong, and blanking it would lose the only thing the
    screen has to show. */
export function gaveUp<T>(before: ReadState<T>): ReadState<T> {
  return { value: before.value, loading: false, failed: true };
}

/** A list read's rows, already defaulted, so no call site writes `?? []`. */
export function rowsOf<T>(state: ReadState<T[]>): T[] {
  return state.value ?? [];
}

/** Only a successful read can say the list is empty. */
export function emptyOf(state: ReadState<unknown[]>): boolean {
  return !state.loading && !state.failed && rowsOf(state).length === 0;
}
