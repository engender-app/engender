/* The reactive half of leaveGuard.ts: the pending departure as state, the
   `beforeNavigate` registration, and SvelteKit's own navigation as the
   replay. Call it during component initialisation, like any
   `beforeNavigate`. DiscardSheet.svelte renders the question. */

import { beforeNavigate, goto } from '$app/navigation';
import { leaveGuardCore, type LeaveGuardOptions } from './leaveGuard.ts';

export type LeaveGuard = {
  /** The departure waiting on an answer, or null with no question open. */
  readonly pendingDeparture: (() => void) | null;
  /** A departure that is not a navigation: closing a sheet, switching a
      tab. Runs at once if nothing would be lost, otherwise asks. */
  request(after: () => void): void;
  keep(): void;
  discard(): void;
};

export function leaveGuard(options: LeaveGuardOptions): LeaveGuard {
  const state = $state<{ pendingDeparture: (() => void) | null }>({ pendingDeparture: null });
  const core = leaveGuardCore(
    options,
    {
      go: (delta) => history.go(delta),
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
