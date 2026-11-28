/* Hold one placeholder until every reading decides whether it has a tile,
   then fade in the group. Drawing queries as they answer lets a late tile
   shift an already-painted grid.

   Each member calls joinReadGroup at initialization with its readiness
   getter. The call is a no-op outside a group. Once revealed, keep the
   group open; later readings enter with their own transitions. */
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
