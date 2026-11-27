/* Folder sync (folder-sync.ts).

   The plugin's half - which file in the folder, never one of this device's own - is
   FolderArchivesTest.java. This is the other half: a staged archive is opened with the
   saved backup password behind the bridge, merged with Archive Merge's own rules into the
   journal, and its outcome reported so the plugin moves past it. Two devices that share a
   history, as in archive-merge-edits.test.ts: B is A restored from A's archive, then A
   edits an entry, and A's auto-export lands in B's folder. */

import assert from 'node:assert/strict';
import { beforeEach, describe, test, vi } from 'vitest';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { everySectionDevice } from '../journal/golden-archive-fixture.ts';
import { openJournal, type Journal } from '../journal/journal.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { collect } from './container.ts';
import { packArchive, type KeyDerivation } from './pack.ts';
import { portablePreferences } from './payload.ts';
import type { AutoExportStatus } from './android-auto-export-bridge.ts';
import { androidAutoExport } from './android-auto-export-bridge.ts';
import { runFolderSync } from './folder-sync.ts';

let android = true;
vi.mock('../../platform', () => ({ isAndroid: () => android }));
vi.mock('./android-auto-export-bridge.ts', () => ({
  androidAutoExport: {
    deriveKey: vi.fn(),
    stageFolderArchive: vi.fn(),
    finishFolderArchive: vi.fn()
  }
}));

const SAVED_KEY = new Uint8Array(32).fill(7);
const OTHER_KEY = new Uint8Array(32).fill(9);
const CHEAP_KDF = { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 };
const keyOf = (key: Uint8Array): KeyDerivation => async () => new Uint8Array(key) as Uint8Array<ArrayBuffer>;
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const ready: AutoExportStatus = {
  enabled: true,
  schedule: 'weekly',
  destinationUri: 'content://tree/backups',
  destinationLabel: 'backups',
  hasPassword: true,
  nextDueAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureReason: null,
  folderSync: true
};

interface Device { driver: SqliteDriver; journal: Journal }

/** A device's auto-export, as bytes, locked with `key`. */
async function autoExport(device: Device, key: Uint8Array): Promise<Uint8Array> {
  const snapshot = await device.journal.archive.snapshot();
  return collect(packArchive({
    journal: snapshot.journal,
    preferences: portablePreferences(PREFERENCE_DEFAULTS),
    files: snapshot.files,
    readFile: snapshot.readFile
  }, keyOf(key), CHEAP_KDF));
}

async function twoDevices(): Promise<{ a: Device; b: Device }> {
  const a = await everySectionDevice();
  const driver = await migratedDb();
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  const snapshot = await a.journal.archive.snapshot();
  await journal.archive.replace({
    journal: JSON.parse(JSON.stringify(snapshot.journal)),
    files: (async function* () {
      for (const { name } of snapshot.files) yield { name, bytes: await snapshot.readFile(name) };
    })()
  });
  return { a, b: { driver, journal } };
}

const firstEntry = async (driver: SqliteDriver) =>
  (await driver.query<{ uuid: string; note: string }>('SELECT uuid, note FROM entry ORDER BY rowid LIMIT 1'))[0];

/** Stages `bytes` as the folder's archive, modified at `at`. */
function folderHolds(bytes: Uint8Array, at: number) {
  vi.mocked(androidAutoExport.stageFolderArchive).mockResolvedValue({ path: '/cache/folder-sync.ttbackup', modifiedAt: at });
  return (path: string) => {
    assert.equal(path, '/cache/folder-sync.ttbackup');
    return (async function* () { yield bytes; })();
  };
}

describe('runFolderSync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    android = true;
    vi.mocked(androidAutoExport.deriveKey).mockResolvedValue({ key: base64(SAVED_KEY) });
    vi.mocked(androidAutoExport.finishFolderArchive).mockResolvedValue(ready);
  });

  test('a newer archive from the other device is merged, and its outcome recorded', async () => {
    const { a, b } = await twoDevices();
    const { uuid } = await firstEntry(a.driver);
    await a.driver.run("UPDATE entry SET note = 'written on the other phone', updated_at = ? WHERE uuid = ?", [Date.now() + 60_000, uuid]);
    const read = folderHolds(await autoExport(a, SAVED_KEY), 5000);

    const result = await runFolderSync(ready, { merge: (contents) => b.journal.archive.merge(contents), read });

    assert.deepEqual(result, { outcome: 'merged', modifiedAt: 5000 });
    assert.equal((await firstEntry(b.driver)).note, 'written on the other phone');
    assert.deepEqual(vi.mocked(androidAutoExport.finishFolderArchive).mock.calls, [[{ modifiedAt: 5000, outcome: 'merged' }]]);
  });

  test("a muted era the other device stamped later is merged, so sync does not stop on it", async () => {
    const { a, b } = await twoDevices();
    const stamp = Date.now() + 60_000;
    const [{ era_uuid }] = await a.driver.query<{ era_uuid: string }>('SELECT era_uuid FROM era_mute ORDER BY rowid LIMIT 1');
    await a.driver.run('UPDATE era_mute SET updated_at = ? WHERE era_uuid = ?', [stamp, era_uuid]);
    const read = folderHolds(await autoExport(a, SAVED_KEY), 5500);

    const result = await runFolderSync(ready, { merge: (contents) => b.journal.archive.merge(contents), read });

    assert.deepEqual(result, { outcome: 'merged', modifiedAt: 5500 });
    const [row] = await b.driver.query<{ updated_at: number }>('SELECT updated_at FROM era_mute WHERE era_uuid = ?', [era_uuid]);
    assert.equal(row.updated_at, stamp);
  });

  test('an archive locked with another password is reported and moved past, and nothing is written', async () => {
    const { a, b } = await twoDevices();
    const before = await firstEntry(b.driver);
    await a.driver.run("UPDATE entry SET note = 'changed', updated_at = ? WHERE uuid = ?", [Date.now() + 60_000, before.uuid]);
    const read = folderHolds(await autoExport(a, OTHER_KEY), 6000);

    const result = await runFolderSync(ready, { merge: (contents) => b.journal.archive.merge(contents), read });

    assert.deepEqual(result, { outcome: 'wrong-password', modifiedAt: 6000 });
    assert.equal((await firstEntry(b.driver)).note, before.note);
    assert.deepEqual(vi.mocked(androidAutoExport.finishFolderArchive).mock.calls, [[{ modifiedAt: 6000, outcome: 'wrong-password' }]]);
  });

  /* finding 1: a Merge that filled the device was recorded as "could not be read", and the
     folder moved past an archive that would merge fine once space was freed. */
  test('a Merge that runs out of space is reported as such and left to be tried again', async () => {
    const { a } = await twoDevices();
    const read = folderHolds(await autoExport(a, SAVED_KEY), 6500);
    const merge = vi.fn(async () => { throw new Error('write failed: ENOSPC (No space left on device)'); });

    const result = await runFolderSync(ready, { merge, read });

    assert.deepEqual(result, { outcome: 'no-space', modifiedAt: 6500 });
    assert.deepEqual(vi.mocked(androidAutoExport.finishFolderArchive).mock.calls, [[{ modifiedAt: 6500, outcome: 'no-space' }]]);
  });

  /* Finding 2: copying the archive out of the folder filled the device, and
     the rejection only reached the console. */
  test('a copy out of the folder that runs out of space is reported, with nothing staged to move past', async () => {
    vi.mocked(androidAutoExport.stageFolderArchive).mockRejectedValue(new Error('write failed: ENOSPC (No space left on device)'));
    const merge = vi.fn();

    const result = await runFolderSync(ready, { merge, read: vi.fn() });

    assert.deepEqual(result, { outcome: 'no-space', modifiedAt: 0 });
    assert.equal(merge.mock.calls.length, 0);
    assert.deepEqual(vi.mocked(androidAutoExport.finishFolderArchive).mock.calls, [[{ modifiedAt: 0, outcome: 'no-space' }]]);
  });

  test('a copy out of the folder that fails some other way still throws', async () => {
    vi.mocked(androidAutoExport.stageFolderArchive).mockRejectedValue(new Error('destination-unavailable'));
    await assert.rejects(runFolderSync(ready, { merge: vi.fn(), read: vi.fn() }), /destination-unavailable/);
    assert.equal(vi.mocked(androidAutoExport.finishFolderArchive).mock.calls.length, 0);
  });

  test('nothing new in the folder merges nothing', async () => {
    vi.mocked(androidAutoExport.stageFolderArchive).mockResolvedValue({ path: null });
    const merge = vi.fn();
    assert.deepEqual(await runFolderSync(ready, { merge, read: vi.fn() }), { outcome: 'none' });
    assert.equal(merge.mock.calls.length, 0);
    assert.equal(vi.mocked(androidAutoExport.finishFolderArchive).mock.calls.length, 0);
  });

  test('switched off, or with no folder or password, the folder is not looked at', async () => {
    for (const status of [
      { ...ready, folderSync: false },
      { ...ready, destinationUri: null },
      { ...ready, hasPassword: false }
    ]) {
      assert.deepEqual(await runFolderSync(status, { merge: vi.fn(), read: vi.fn() }), { outcome: 'none' });
    }
    assert.equal(vi.mocked(androidAutoExport.stageFolderArchive).mock.calls.length, 0);
  });

  test('the web build has no folder sync: no bridge call at all', async () => {
    android = false;
    assert.deepEqual(await runFolderSync(ready, { merge: vi.fn(), read: vi.fn() }), { outcome: 'none' });
    assert.equal(vi.mocked(androidAutoExport.stageFolderArchive).mock.calls.length, 0);
  });

  test('a lock before Merge begins leaves the archive to be tried again', async () => {
    const { a } = await twoDevices();
    const read = folderHolds(await autoExport(a, SAVED_KEY), 7000);
    const stop = new AbortController();
    const merge = vi.fn();
    vi.mocked(androidAutoExport.deriveKey).mockImplementation(async () => {
      stop.abort();
      return { key: base64(SAVED_KEY) };
    });

    await assert.rejects(runFolderSync(ready, { merge, read, signal: stop.signal }), { name: 'AbortError' });
    assert.equal(merge.mock.calls.length, 0);
    assert.deepEqual(vi.mocked(androidAutoExport.finishFolderArchive).mock.calls, [[{ modifiedAt: 7000, outcome: 'cancelled' }]]);
  });

  test('a lock while the archive is being opened leaves it to be tried again, even when opening then fails', async () => {
    const { a } = await twoDevices();
    const read = folderHolds(await autoExport(a, OTHER_KEY), 8000);
    const stop = new AbortController();
    vi.mocked(androidAutoExport.deriveKey).mockImplementation(async () => {
      stop.abort();
      return { key: base64(SAVED_KEY) };
    });

    await assert.rejects(runFolderSync(ready, { merge: vi.fn(), read, signal: stop.signal }));
    assert.deepEqual(vi.mocked(androidAutoExport.finishFolderArchive).mock.calls, [[{ modifiedAt: 8000, outcome: 'cancelled' }]]);
  });
});
