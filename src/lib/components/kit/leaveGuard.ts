/* Cancel navigation away from a dirty draft and keep it for a confirmed
   discard. Replay through history.go or goto and re-arm the guard if replay
   fails. leaveGuard.svelte.ts wires SvelteKit and DiscardSheet asks the
   question. This module stays runnable in Node. */

/** The part of SvelteKit's `BeforeNavigate` the guard reads. */
export type Departure = {
  cancel(): void;
  readonly willUnload: boolean;
  readonly type: string;
  readonly delta?: number;
  readonly to: { readonly url: URL } | null;
};

/** How a held departure is carried out once the person discards. Both
    settle once the move has gone through its own `beforeNavigate`, or has
    turned out not to happen at all. */
export type Replay = {
  go(delta: number): Promise<unknown>;
  goto(url: URL): Promise<unknown>;
};

export type LeaveGuardOptions = {
  /** Whether there is work here that leaving would lose. */
  holding: () => boolean;
  /** A save in flight. Leaving is refused without a question until it
      lands, since there is nothing to discard yet and nothing to keep. */
  busy?: () => boolean;
  /** Drop the draft. Runs once the departure has been started, so a
      departure that needs the draft to find its way - a delete reading the
      record off an open editor - still has it. */
  onDiscard?: () => void;
  /** A departure the screen takes as its own move rather than as leaving:
      the browser's Back on a stepped editor's second step goes one step
      back. Answering true cancels the departure and asks nothing. */
  ownsDeparture?: (departure: Departure) => boolean;
  /** A navigation that keeps this screen and its draft where they are: a query that opens a
      sheet over it. Answering true lets it through and asks nothing. */
  staysOnScreen?: (departure: Departure) => boolean;
};

export type LeaveGuardState = {
  /** The departure waiting on an answer, or null with no question open. */
  pendingDeparture: (() => void) | null;
};

export function leaveGuardCore(
  options: LeaveGuardOptions,
  replay: Replay,
  state: LeaveGuardState = { pendingDeparture: null }
) {
  /* One-shot: the departure being replayed is let through its own check
     and nothing after it is. It is spent by that check, or once the replay
     settles whichever way it went, so a navigation that fails to load, or
     a history move that goes nowhere, leaves the guard armed - the bug
     2acb6196 fixed in one copy of four. */
  let replaying = false;

  const busy = () => options.busy?.() ?? false;

  function carryOut(departure: Departure) {
    const move =
      departure.type === 'popstate' && departure.delta
        ? replay.go(departure.delta)
        : departure.to
          ? replay.goto(departure.to.url)
          : null;
    if (!move) return;
    replaying = true;
    move.catch(() => {}).finally(() => {
      replaying = false;
    });
  }

  return {
    state,

    /** Hand every `beforeNavigate` here. */
    beforeNavigate(departure: Departure) {
      if (replaying) {
        replaying = false;
        return;
      }
      if (options.staysOnScreen?.(departure)) return;
      if (options.ownsDeparture?.(departure)) {
        departure.cancel();
        return;
      }
      const saving = busy();
      if (!saving && !options.holding()) return;
      departure.cancel();
      // An unload gets the browser's own confirmation: a sheet cannot wait
      // across a reload, a closed tab or a link out of the app.
      if (saving || state.pendingDeparture || departure.willUnload) return;
      state.pendingDeparture = () => carryOut(departure);
    },

    /** A departure that is not a navigation - closing a sheet, switching a
        tab. Runs `after` at once if nothing would be lost. */
    request(after: () => void) {
      if (busy() || state.pendingDeparture) return;
      if (options.holding()) state.pendingDeparture = after;
      else after();
    },

    /** Keep editing: the question closes and nothing moves. */
    keep() {
      state.pendingDeparture = null;
    },

    /** Discard: drop the draft and carry the departure out. */
    discard() {
      const after = state.pendingDeparture;
      state.pendingDeparture = null;
      after?.();
      options.onDiscard?.();
    }
  };
}
