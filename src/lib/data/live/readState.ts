/* What a live read shows, and what each outcome of a run does to it
   (phase 5 audit ticket 04).

   Three facts rather than two. `loading` and a value were enough while a
   rejected read was indistinguishable from a journal with nothing in it;
   `failed` is what lets a screen tell those apart when it wants to. What it
   deliberately does not do is change the rendering: a read that gave up still
   reads as empty, because a placeholder held forever tells the user less than
   an empty state does and an unreadable database is already reported from
   boot. The state has a name now, and a screen opts in to saying more.

   Rune-free and here rather than in journal.svelte.ts so that the rule can be
   node-tested at all: `$state` is not defined in that tier (ADR-0017), which
   is why writes.ts and tableVersions.notify.ts sit beside this one. */

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

/** Nothing to show, and not because the answer is still out. A read that
    failed before it ever landed is empty by this measure, which is exactly
    the rendering the default keeps. */
export function emptyOf(state: ReadState<unknown[]>): boolean {
  return !state.loading && rowsOf(state).length === 0;
}
