import { test, expect } from 'vitest';
import { clearBrowserMirrors, wipeLocalData, type LocalDataTargets } from './reset.ts';
import { RECOVERY_KEY_FILE } from './recovery-key-file.ts';
import { BOOT_CACHE_KEY } from './prefs/boot-cache.ts';
import type { ListableDirectory } from './photos/opfs-file-store.ts';

function targets(
  options: {
    entries?: string[];
    closeFails?: boolean;
    removeFails?: string;
    platform?: boolean;
    platformFails?: boolean;
    device?: boolean;
    deviceFails?: boolean;
  } = {}
) {
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
    wipePlatformStorage: options.platform
      ? async () => {
          log.push('wipe platform storage');
          if (options.platformFails) throw new Error('the database file is still held');
        }
      : undefined,
    wipeDeviceState: options.device
      ? async () => {
          log.push('wipe device state');
          if (options.deviceFails) throw new Error('an alarm is still scheduled');
        }
      : undefined,
    clearBrowserMirrors: () => log.push('clear mirrors'),
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
    'clear mirrors',
    'clear cache'
  ]);
});

test('a database that will not close is no reason to leave the data', async () => {
  const { deps, log } = targets({ closeFails: true });
  await wipeLocalData(deps);
  expect(log).toContain('remove photos (recursive)');
  expect(log).toContain('clear cache');
});

/* The recovery key is swept by the same recursive walk and by no line of
   its own (ADR-0054, ticket sec-01), which is worth a test precisely
   because there is nothing in reset.ts naming it: a reset that left the
   file behind would leave a written key that opens a journal the person
   asked to be rid of - and, once a new journal is set up on the same
   device, a stale wrap sitting next to it. Whoever narrows this sweep to a
   list of known names has to fail here. */
test('a reset takes the recovery key with everything else under the root', async () => {
  const { deps, log } = targets({
    entries: ['gender-diary.sqlite3', 'keystore.json', RECOVERY_KEY_FILE, '.opfs-sahpool']
  });
  await wipeLocalData(deps);

  expect(log).toContain(`remove ${RECOVERY_KEY_FILE} (recursive)`);
  expect(log).toContain('remove keystore.json (recursive)');
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

test('a platform with storage of its own has it wiped too, after the close', async () => {
  /* Android (ticket 13): the journal and the Keystore-wrapped data key live
     in app-private storage, which the OPFS root does not reach. A reset that
     emptied only OPFS would leave the whole journal behind. */
  const { deps, log } = targets({ platform: true });
  await wipeLocalData(deps);

  expect(log.indexOf('close')).toBeLessThan(log.indexOf('wipe platform storage'));
  expect(log).toContain('wipe platform storage');
  expect(log.at(-1)).toBe('clear cache');
});

test('a platform with device state of its own has it wiped before the files go', async () => {
  /* Android: the reminder, auto-export and quick-exit preference files, the
     alarms scheduled off the first of them, and the Keystore alias the
     backup password is wrapped under. Before the journal rather than after,
     so a wipe that fails leaves the journal to try again on instead of
     taking it and leaving the reminders. */
  const { deps, log } = targets({ platform: true, device: true });
  await wipeLocalData(deps);

  expect(log.indexOf('wipe device state')).toBeLessThan(log.indexOf('remove photos (recursive)'));
  expect(log.at(-1)).toBe('clear cache');
});

test('device state that will not go stops the reset with the journal intact', async () => {
  const { deps, log } = targets({ platform: true, device: true, deviceFails: true });
  await expect(wipeLocalData(deps)).rejects.toThrow('still scheduled');
  expect(log).not.toContain('remove photos (recursive)');
  expect(log).not.toContain('clear cache');
});

test('platform storage that will not go stops the reset before the mirror', async () => {
  /* The same rule the OPFS failure follows, and for the same reason: the
     mirror is what tells the next cold start there is a PIN at all, so
     dropping it over data that survived hands the journal back unlocked. */
  const { deps, log } = targets({ platform: true, platformFails: true });
  await expect(wipeLocalData(deps)).rejects.toThrow('still held');
  expect(log).not.toContain('clear cache');
});

/** localStorage as far as the sweep is concerned: enumerable by index, and
    removable by name. */
function fakeStorage(entries: Record<string, string>): Storage {
  const values = new Map(Object.entries(entries));
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => void values.set(name, value),
    removeItem: (name: string) => void values.delete(name),
    clear: () => values.clear()
  } as Storage;
}

test('a completed reset leaves no key of this app behind in localStorage', async () => {
  /* The real ports rather than fakes of them, because what this asserts is
     the sweep itself: the draft mirror holds the note text, mood, tags and
     body regions of the entry the process died on, and the whole claim of
     the reset screen is that none of that is still here afterwards. */
  const storage = fakeStorage({
    'gender-diary-entry-draft': '{"note":"first day on the patch"}',
    'gender-diary-pin-attempts': '{"failures":3}',
    [BOOT_CACHE_KEY]: '{"theme":"dark"}',
    'unrelated-app-key': 'not ours to take'
  });

  const { deps } = targets();
  await wipeLocalData({
    ...deps,
    clearBrowserMirrors: () => clearBrowserMirrors(storage),
    clearBootCache: () => storage.removeItem(BOOT_CACHE_KEY)
  });

  const left = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  expect(left.filter((key) => key?.startsWith('gender-diary-'))).toEqual([]);
  expect(left).toEqual(['unrelated-app-key']);
});

test('the sweep leaves the boot mirror for clearBootCache to take last', async () => {
  /* Not tidiness: the sweep runs while the reset can still fail, and the
     mirror is the one key whose early removal would hand the journal back
     unlocked. */
  const storage = fakeStorage({
    'gender-diary-entry-draft': '{}',
    [BOOT_CACHE_KEY]: '{"theme":"dark"}'
  });

  clearBrowserMirrors(storage);

  expect(storage.getItem('gender-diary-entry-draft')).toBeNull();
  expect(storage.getItem(BOOT_CACHE_KEY)).not.toBeNull();
});
