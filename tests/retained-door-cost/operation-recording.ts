import { untrack } from 'svelte';
import type { Journal } from '../../src/lib/data/journal/journal';

export interface ReadOperation {
  operation: string;
  visible: boolean;
  startedAtMs: number;
  completedAtMs?: number;
}

export const readOperations: ReadOperation[] = [];
let recording = false;
export function setReadRecording(enabled: boolean): void { recording = enabled; }

/** Attributes repository reads to their live-query owner's activity. */
export function recordReadOperations(ready: Journal, active: () => boolean): Journal {
  if (!recording) return ready;
  const wrap = (owner: object, prefix: string): object => new Proxy(owner, {
    get(target, name: string) {
      const value = Reflect.get(target, name);
      if (typeof value === 'function') return (...args: unknown[]) => {
        const event: ReadOperation = {
          operation: prefix + name, visible: untrack(active), startedAtMs: performance.now()
        };
        readOperations.push(event);
        return Promise.resolve(value.apply(target, args)).finally(() => {
          event.completedAtMs = performance.now();
        });
      };
      return value && typeof value === 'object' ? wrap(value, name + '.') : value;
    }
  });
  return wrap(ready, '') as Journal;
}
