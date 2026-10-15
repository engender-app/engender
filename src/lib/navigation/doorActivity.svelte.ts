import { getContext, setContext } from 'svelte';

const KEY = Symbol('door-activity');

export function provideDoorActivity(active: () => boolean): void {
  setContext(KEY, active);
}

export function useDoorActivity(): () => boolean {
  try {
    return getContext<(() => boolean) | undefined>(KEY) ?? (() => true);
  } catch (error) {
    // Standalone effect roots have no component context or retained door.
    if (!(error instanceof Error) || !error.message.includes('lifecycle_outside_component')) throw error;
    return () => true;
  }
}
