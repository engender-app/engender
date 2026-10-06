import { test, expect, vi } from 'vitest';
import { deriveKey } from '../../crypto/argon2id';
import { collect, frameArchive, u32 } from '../archive/container';
import { fakeFileStore } from '../photos/test-support/fake-file-store';
import { migratedDb } from '../sqlite/test-support/migrated-db';
import { portablePreferencePatch } from '../prefs/portableShape';
import { openJournal, type Journal } from './journal';
import { runRestore } from './restoreFlow';

const device = vi.hoisted(() => ({ journal: null as Journal | null, preferences: {} }));
vi.mock('../live/journal.svelte', () => ({ get journal() { return device.journal; } }));
vi.mock('../prefs/store.svelte', () => ({
  applyPortablePreferences: (portable: Parameters<typeof portablePreferencePatch>[0]) => {
    Object.assign(device.preferences, portablePreferencePatch(portable));
  }
}));

async function* oneShot(bytes: Uint8Array) { yield bytes; }

test.each([1, 2])('a v%s archive without preferences restores and reports success', async (version) => {
  const sourceDb = await migratedDb();
  const targetDb = await migratedDb();
  try {
    const source = openJournal(sourceDb, fakeFileStore());
    await source.reconcileBuiltIns();
    await source.entries.upsertEntry({ epochDay: 20000, mood: 4, note: 'kept from archive' });
    device.journal = openJournal(targetDb, fakeFileStore());
    await device.journal.reconcileBuiltIns();
    const payload = { journal: (await source.archive.snapshot()).journal, files: [] };
    const json = new TextEncoder().encode(JSON.stringify(payload));
    const body = new Uint8Array(4 + json.length);
    body.set(u32(json.length));
    body.set(json, 4);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kdf = { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 };
    const key = await deriveKey('backup proof', salt, kdf);
    const archive = await collect(frameArchive(key, { formatVersion: version, salt, kdf, chunkSize: 1024 * 1024, totalChunks: 1 }, oneShot(body)));
    await expect(runRestore({ name: 'without-preferences.ttbackup', bytes: () => oneShot(archive) }, 'backup proof', 'replace', () => {})).resolves.toEqual({ ok: true });
    expect((await device.journal.archive.snapshot()).journal.entries[0].note).toBe('kept from archive');
  } finally {
    await sourceDb.close();
    await targetDb.close();
  }
});
