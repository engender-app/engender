import { getContext, setContext } from 'svelte';

const KEY = Symbol('door-activity');

export function provideDoorActivity(active: () => boolean): void {
  setContext(KEY, active);
}

export function useDoorActivity(): () => boolean {
  return getContext<(() => boolean) | undefined>(KEY) ?? (() => true);
}
