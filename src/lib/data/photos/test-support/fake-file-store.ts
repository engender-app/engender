/* An in-memory PhotoFileStore for the Node tier.

   The point of the file store being injected (ADR-0017) is that the rules
   about files - delete takes them along, the sweep reclaims what no row
   references - are testable without a browser, OPFS or a real disk. This
   is the fake that makes that true; the browser tier exercises the OPFS
   adapter against the same interface. */

import type { PhotoFileStore } from '../../journal/journal.ts';

export interface FakeFileStore extends PhotoFileStore {
  /** What is on "disk", for assertions. */
  names(): string[];
  /** Makes the nth write from now throw, standing in for a crash or a full
      disk partway through storing a photo. Counted rather than named
      because the uuid a photo is stored under is minted inside the
      journal, where a test cannot predict it. */
  failNthWrite(n: number): void;
  /** Makes the nth removal from now throw, standing in for cleanup failing
      after an owner save has committed. */
  failNthRemove(n: number): void;
}

export function fakeFileStore(initial: string[] = []): FakeFileStore {
  const files = new Map<string, Uint8Array>(initial.map((name) => [name, new Uint8Array([1])]));
  let writes = 0;
  let failAt = 0;
  let removes = 0;
  let failRemoveAt = 0;

  return {
    async write(name, bytes) {
      writes += 1;
      if (writes === failAt) throw new Error('disk full');
      files.set(name, bytes);
    },
    async read(name) {
      return files.get(name) ?? null;
    },
    async size(name) {
      return files.get(name)?.length ?? null;
    },
    async remove(name) {
      removes += 1;
      if (removes === failRemoveAt) throw new Error('file remove failed');
      files.delete(name);
    },
    async list() {
      return [...files.keys()];
    },
    names() {
      return [...files.keys()].sort();
    },
    failNthWrite(n) {
      failAt = writes + n;
    },
    failNthRemove(n) {
      failRemoveAt = removes + n;
    }
  };
}
