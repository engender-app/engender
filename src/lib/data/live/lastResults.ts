/* Reuse a prior result on a warm revisit, then refresh in the
   background. Store dependency versions from the start of the read.
   Serve the result only when every version still matches. Equal
   refresh results leave the screen alone.

   Keep results in memory and clear them on lock and reset. A key
   combines the call site with operations and arguments observed before
   the first await. Skip arguments that cannot be serialized faithfully.

   A later closure value may be outside the key. Share a result only
   after its writer is gone. If two live instances write one key, mark
   it ambiguous until the cache clears. */

import { forgetOnLock } from '../../lock/forget-content';

type Entry = {
  value: unknown;
  versions: [table: string, version: number][];
  writer: number;
};

/** About ten screens' worth of reads: Today makes ~31, Look back ~26. */
const MAX_ENTRIES = 400;

const entries = new Map<string, Entry>();
const ambiguous = new Set<string>();

/** Stores `value` under `key`, stamped with the versions its run started at.
    `writer` is the query instance storing it and `isAlive` says whether an
    instance still exists, for the ambiguity rule above. */
export function remember(
  key: string,
  value: unknown,
  versions: [string, number][],
  writer: number,
  isAlive: (instance: number) => boolean
): void {
  if (ambiguous.has(key)) return;
  const previous = entries.get(key);
  if (previous && previous.writer !== writer && isAlive(previous.writer)) {
    entries.delete(key);
    ambiguous.add(key);
    return;
  }
  entries.delete(key);
  entries.set(key, { value, versions, writer });
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
}

/** The answer stored under `key`, if every table it was read over is still at
    the version it was read at and the instance that stored it is gone.
    `undefined` otherwise, including when the stored answer was itself
    `undefined` - there is nothing to paint then. */
export function recall(
  key: string,
  currentVersion: (table: string) => number,
  isAlive: (instance: number) => boolean
): unknown {
  const entry = entries.get(key);
  if (!entry || isAlive(entry.writer)) return undefined;
  if (entry.versions.some(([table, version]) => currentVersion(table) !== version)) {
    entries.delete(key);
    return undefined;
  }
  // Touched, so the least recently used answer is the one evicted.
  entries.delete(key);
  entries.set(key, entry);
  return entry.value;
}

/** Drops every stored answer. The lock and the reset call this. */
export function forgetLastResults(): void {
  entries.clear();
  ambiguous.clear();
}
forgetOnLock(forgetLastResults);

/** How many answers are held, for the tests. */
export function lastResultCount(): number {
  return entries.size;
}

/** One operation call as the key writes it, or null when an argument cannot
    be written down so that two different values never read the same. */
export function callKey(area: string, operation: string, args: unknown[]): string | null {
  try {
    return `${area}.${operation}(${JSON.stringify(args, faithful)})`;
  } catch {
    return null;
  }
}

/* Plain data only. A Set or Map would stringify as {} and collide with every
   other one, so they are written out; anything else that is not a plain
   object, array or Date refuses the key rather than guess at its contents. */
function faithful(this: unknown, _key: string, value: unknown): unknown {
  if (value === undefined) return '__undefined';
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new Error('unkeyable');
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Set) return { __set: [...value] };
  if (value instanceof Map) return { __map: [...value] };
  if (Array.isArray(value)) return value;
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) return value;
  throw new Error('unkeyable');
}

/** Structural equality over what a read answers with: plain objects,
    arrays, typed arrays, Dates, Maps, Sets and primitives. */
export function sameAnswer(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Date) return a.getTime() === (b as Date).getTime();
  if (ArrayBuffer.isView(a)) {
    const x = a as unknown as ArrayLike<number>;
    const y = b as unknown as ArrayLike<number>;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  if (a instanceof Map || a instanceof Set) return sameAnswer([...a], [...(b as Map<unknown, unknown> | Set<unknown>)]);
  if (Array.isArray(a)) {
    const y = b as unknown[];
    if (a.length !== y.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameAnswer(a[i], y[i])) return false;
    return true;
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  for (const key of keys) if (!(key in y) || !sameAnswer(x[key], y[key])) return false;
  return true;
}
