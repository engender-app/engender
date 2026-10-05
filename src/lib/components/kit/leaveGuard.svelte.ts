/* The reactive half of leaveGuard.ts: the pending departure as state, the
   `beforeNavigate` registration, and SvelteKit's own navigation as the
   replay. Call it during component initialisation, like any
   `beforeNavigate`. DiscardSheet.svelte renders the question. */

import { beforeNavigate, goto } from '$app/navigation';
import { leaveGuardCore, type LeaveGuardOptions, type LeaveGuardState } from './leaveGuard.ts';

/* A history move has no promise of its own. It settles on the popstate it
   causes, a task after SvelteKit's own listener has run that navigation's
   `beforeNavigate`, or, for a delta past either end of the history, which
   the browser ignores without an event, after a bound. */
const SETTLE_BOUND_MS = 1000;

function historyGo(delta: number): Promise<void> {
  return new Promise((resolve) => {
    const settle = () => {
      clearTimeout(bound);
      removeEventListener('popstate', onPop);
      resolve();
    };
    const onPop = () => setTimeout(settle, 0);
    const bound = setTimeout(settle, SETTLE_BOUND_MS);
    addEventListener('popstate', onPop);
    history.go(delta);
  });
}

export type LeaveGuard = {
  /** The departure waiting on an answer, or null with no question open. */
  readonly pendingDeparture: (() => void) | null;
  /** A departure that is not a navigation: closing a sheet, switching a
      tab. Runs at once if nothing would be lost, otherwise asks. */
  request(after: () => void): void;
  keep(): void;
  discard(): void;
};

/** Registers a `beforeNavigate`, so call it during component
    initialisation, the same as SvelteKit's own. */
export function leaveGuard(options: LeaveGuardOptions): LeaveGuard {
  const state = $state<LeaveGuardState>({ pendingDeparture: null });
  const core = leaveGuardCore(
    options,
    {
      go: historyGo,
      // The destination is SvelteKit's own resolved navigation URL.
      goto: (url) => goto(url)
    },
    state
  );
  beforeNavigate((navigation) => core.beforeNavigate(navigation));

  return {
    get pendingDeparture() {
      return state.pendingDeparture;
    },
    request: core.request,
    keep: core.keep,
    discard: core.discard
  };
}
