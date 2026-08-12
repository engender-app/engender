import { test, expect } from 'vitest';
import { wipeLocalData, type LocalDataTargets } from './reset.ts';
import type { ListableDirectory } from './photos/opfs-file-store.ts';

function targets(options: { entries?: string[]; closeFails?: boolean; removeFails?: string } = {}) {
  const log: string[] = [];
  const entries = options.entries ?? ['gender-diary.sqlite3', 'gender-diary.sqlite3.pre-migration-backup', 'photos'];

  const root = {
    async *keys() {
      yield* entries;
    },
    async removeEntry(name: string, opts?: { recursive?: boolean }) {
      if (options.removeFails === name) throw new Error('still open');
      log.push(`remove ${name}${opts?.recursive ? ' (recursive)' : ''}`);
    }
  } as unknown as ListableDirectory;

  const deps: LocalDataTargets = {
    closeDatabase: async () => {
      log.push('close');
      if (options.closeFails) throw new Error('worker gone');
    },
    storageRoot: async () => root,
    clearBootCache: () => log.push('clear cache')
  };

  return { deps, log };
}

test('closes the database, empties its storage, then drops the mirror', async () => {
  const { deps, log } = targets();
  await wipeLocalData(deps);

  expect(log).toEqual([
    'close',
    'remove gender-diary.sqlite3 (recursive)',
    'remove gender-diary.sqlite3.pre-migration-backup (recursive)',
    'remove photos (recursive)',
    'clear cache'
  ]);
});

test('a database that will not close is no reason to leave the data', async () => {
  const { deps, log } = targets({ closeFails: true });
  await wipeLocalData(deps);
  expect(log).toContain('remove photos (recursive)');
  expect(log).toContain('clear cache');
});

test('a reset during an interrupted conversion takes the plaintext journal and the marker too', async () => {
  /* The one path where "everything under the root" is doing real work
     rather than being tidy (ticket 10): mid-conversion the root holds the
     plaintext journal, the keystore for a journal that does not exist yet
     and the marker saying how far it got. Leaving any of them would hand
     the next boot either readable entries the person asked to be rid of,
     or a conversion to resume with no key to resume it under. */
  const { deps, log } = targets({
    entries: [
      'gender-diary.sqlite3',
      'gender-diary.sqlite3.pre-migration-backup',
      'photos',
      'keystore.json',
      'conversion.json',
      '.opfs-sahpool'
    ]
  });
  await wipeLocalData(deps);

  expect(log).toContain('remove gender-diary.sqlite3 (recursive)');
  expect(log).toContain('remove conversion.json (recursive)');
  expect(log).toContain('remove keystore.json (recursive)');
  expect(log).toContain('remove .opfs-sahpool (recursive)');
  expect(log.at(-1)).toBe('clear cache');
});

test('storage that will not empty fails loudly, with the mirror left alone', async () => {
  const { deps, log } = targets({ removeFails: 'gender-diary.sqlite3' });
  await expect(wipeLocalData(deps)).rejects.toThrow('still open');
  expect(log).not.toContain('clear cache');
});
