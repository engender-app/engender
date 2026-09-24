/* The last answer each read gave, held in memory so a warm revisit paints
   from it (phase 12 ux-carpet ticket 201).

   Going back to a tab you looked at a minute ago used to show its skeleton
   again while every read made its round trip: 190-340 ms on the Pixel even
   with the bridge pipelined (ticket 200). Nothing had changed in between, so
   the skeleton reported a wait for data the screen had already shown. So a
   query that has answered leaves its answer here, and the same query asked
   again paints it in its first frame and reads fresh underneath.

   Three rules keep that honest:

   - **Only while nothing it read has changed.** An answer is stored with the
     version of every table it depends on (tableVersions.svelte.ts), taken
     when its run started. If any of them has moved since, the answer is not
     handed out: a screen never paints something the journal has already
     overwritten. So the refresh underneath finds the same data unless the
     answer depends on the clock, and journal.svelte.ts skips a refresh that
     came back equal, which leaves nothing on screen to move.
   - **Memory only, and wiped on lock and on reset.** Alicja's decision on
     the ticket: nothing leaves the encrypted database for localStorage, disk
     or anywhere else, and a locked app holds none of the journal in the
     page either. `forgetLastResults()` is called from lockNow() and
     resetApp().
   - **Only an answer the key can tell apart.** A key is the call site plus
     every journal operation the query's closure called before its first
     await, with their arguments. A closure that passes an argument that
     cannot be written down faithfully is not stored; one that calls nothing
     at all is keyed by its call site alone (journal.svelte.ts, NO_CALLS).
     What the key cannot see is a variable the closure uses only after an
     await; two live instances of one call site that ask the same thing
     would be told apart only by that. So an answer is never handed to a new
     instance while the instance that stored it is still alive - a revisit
     is by definition the old screen gone and a new one asking - and a key
     written by two instances alive at once is marked ambiguous and never
     handed out again (until the next forget).

   Rune-free, so the Node tier tests it (lastResults.test.ts). */

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
