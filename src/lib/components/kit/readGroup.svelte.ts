/* The component side of readGroup.ts: the context a group's members find it
   through, and the reactive list they join. */
import { getContext, setContext } from 'svelte';
import { ReadGroup, type ReadGroupState } from './readGroup';

export { ReadGroup, heldByReadGroup } from './readGroup';

const KEY = Symbol('read-group');

/** The group the calling component's children join. */
export function provideReadGroup(own?: () => boolean): ReadGroup {
  const state = $state<ReadGroupState>({ members: [], shown: false });
  return setContext(KEY, new ReadGroup(own, state));
}

/** The group this component sits in, if any. */
export function readGroup(): ReadGroup | undefined {
  return getContext<ReadGroup | undefined>(KEY);
}

/** Join the enclosing group, if there is one. `answered` is true once this
    component knows whether it draws anything. */
export function joinReadGroup(answered: () => boolean): void {
  readGroup()?.join(answered);
}

