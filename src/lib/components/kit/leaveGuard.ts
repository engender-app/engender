/* Leaving changed work asks first (CONTEXT: "Draft", interaction-language
   spec rule on deliberate discard).

   Four screens used to carry their own copy of the same `beforeNavigate`
   sequence: cancel, keep the departure, replay it on Discard with
   `history.go(delta)` or `goto`. The copies drifted. Only the tryouts copy
   learned (2acb6196) that a replay can fail, and that a guard which
   switches itself off before replaying stays off for good when it does;
   the other three still fired the replay and forgot it. And the screens
   built on detailDraft had no copy at all, so a reminder or a document
   rename vanished on Back.

   This is the decision, rune-free so it can be node-tested against a fake
   navigation the way readGate.ts and recordEditor.ts are.
   leaveGuard.svelte.ts registers it with SvelteKit and DiscardSheet.svelte
   is the question it asks. */

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

export type LeaveGuardCore = ReturnType<typeof leaveGuardCore>;
