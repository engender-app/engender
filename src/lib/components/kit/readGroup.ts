/* A set of components that each answer their own read, held back together
   until every one of them has (ux-carpet ticket 190).

   The Look back door's reading grid is nine components, each reading its
   own query and each deciding for itself whether it has a tile. Drawn as
   they answered, whichever landed a tick after its neighbours was inserted
   between them, and the tiles after it jumped a cell in one frame - a grid
   reflow no transition can carry, because the grid is not a keyed list.
   Home's fold is the same shape, and Alicja's call for it (ticket 183) is
   the one this implements: hold a placeholder until every read behind the
   group has answered, then fade the whole group in at once.

   The members are the components themselves rather than a list the screen
   keeps, because only a reading knows which of its reads decide whether it
   draws anything. A member calls `joinReadGroup` once, at init, with a
   getter saying whether that decision is final; outside a group the call
   does nothing, so the same component drawn anywhere else is unchanged.

   One-way, the way a read's own `loading` is (readState.ts): once open, a
   group stays open. A member that mounts later - a tile a span change
   brings in, a resurfacing card switched on in Settings - arrives through
   its own panel transition, and must not send an already-drawn grid back
   behind its placeholder. */
import { untrack } from 'svelte';

/** The part of a group that has to be reactive: who has joined, and
    whether the group is showing yet. Plain here; the component side hands
    in a `$state` one (readGroup.svelte.ts). */
export type ReadGroupState = { members: Array<() => boolean>; shown: boolean };

export class ReadGroup {
  #answered = false;
  readonly #own: () => boolean;
  readonly #state: ReadGroupState;

  /** `own` is whatever the group's owner is still waiting on besides its
      members - a read the screen holds and hands down as a prop. */
  constructor(own: () => boolean = () => true, state: ReadGroupState = { members: [], shown: false }) {
    this.#own = own;
    this.#state = state;
  }

  join(answered: () => boolean): void {
    if (this.#answered) return;
    /* Members join while their parent is rendering, and a state write from
       inside a render is refused unless it is untracked. Nothing here
       needs tracking: the write only has to invalidate `answered`. */
    untrack(() => this.#state.members.push(answered));
  }

  /** Every member, and the owner, knows what it draws. Latched: once true,
      it stays true whatever joins or re-reads after. */
  get answered(): boolean {
    if (this.#answered) return true;
    const answered = this.#own() && this.#state.members.every((member) => member());
    if (answered) this.#answered = true;
    return answered;
  }

  /** The group is on screen. Later than `answered` by however long the
      last answers take to finish animating out of sight (ReadGroup.svelte
      says why). */
  get shown(): boolean {
    return this.#state.shown;
  }

  show(): void {
    this.#state.shown = true;
  }
}

/** Whether a panel transition should stand down: the component is being
    drawn inside a group that is not showing yet, so nobody can see it
    arrive, and the group's own fade is the arrival. */
export function heldByReadGroup(group: ReadGroup | undefined): boolean {
  return group !== undefined && !group.shown;
}
