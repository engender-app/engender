import type { Journal } from '../journal/journal';

const waiting = new Map<() => boolean, Set<() => void>>();

export function pendingAdmissions(): number {
  return [...waiting.values()].reduce((count, releases) => count + releases.size, 0);
}

export function promoteDoorReads(active: () => boolean): void {
  if (active()) for (const release of waiting.get(active) ?? []) release();
}

/** Give visible reads a 75 ms head start; share admission across one query attempt. */
export function admitHiddenReads(ready: Journal, active: () => boolean, current: () => boolean): Journal {
  if (active()) return ready;
  let admission: Promise<void> | undefined;
  const admit = () => admission ??= new Promise<void>((resolve) => {
    const releases = waiting.get(active) ?? new Set<() => void>();
    waiting.set(active, releases);
    const release = () => {
      clearTimeout(timer);
      releases.delete(release);
      if (releases.size === 0) waiting.delete(active);
      resolve();
    };
    const timer = setTimeout(release, 75);
    releases.add(release);
  });
  const wrap = (owner: object): object => new Proxy(owner, {
    get(target, name: string) {
      const value = Reflect.get(target, name);
      if (typeof value === 'function') return (...args: unknown[]) => admit().then(() => {
        if (!current()) throw new Error('superseded hidden read');
        return value.apply(target, args);
      });
      return value && typeof value === 'object' ? wrap(value) : value;
    }
  });
  return wrap(ready) as Journal;
}
