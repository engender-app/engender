import { afterEach, expect, test, vi } from 'vitest';
import { migratedDb } from '../sqlite/test-support/migrated-db';
import { fakeFileStore } from '../photos/test-support/fake-file-store';
import { observeWrites, type TableName } from '../live/writes';
import { openJournal, type Journal } from './journal';
import { sweepOrphanPhotos } from './photos';

const openDatabases: Awaited<ReturnType<typeof migratedDb>>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const db of openDatabases.splice(0)) await db.close();
});

async function setup(kind: 'document' | 'photo', scoped: boolean, rollback = false) {
  const db = await migratedDb();
  openDatabases.push(db);
  const files = fakeFileStore();
  const raw = openJournal(db, files);
  const bytes = { full: new Uint8Array([1, 2]), thumb: new Uint8Array([3]) };
  let id: string;
  if (kind === 'document') {
    id = await raw.documents.addDocument({ epochDay: 20000, title: 'Referral' }, bytes);
  } else {
    const entry = await raw.entries.upsertEntry({ epochDay: 20000, mood: 3, attachPhotos: [bytes] });
    id = (await raw.entries.getEntry(entry))!.photos[0].id;
  }
  const remove = (journal: Journal) => kind === 'document'
    ? journal.documents.deleteDocument(id) : journal.photos.remove(id);
  if (scoped) {
    // Observe the complete mutation, including its outer commit, just as a
    // journal method that owns a transaction does in production.
    const inTransaction = () => db.transaction(async (scope) => {
      await remove(openJournal(scope, files));
      expect(files.names()).toHaveLength(2);
      if (rollback) throw new Error('commit refused');
    });
    if (kind === 'document') raw.documents.deleteDocument = inTransaction;
    else raw.photos.remove = inTransaction;
  }
  const notifications: TableName[][] = [];
  const journal = observeWrites(raw, (tables) => notifications.push(tables));
  const count = async () => (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${kind}`))[0].n;
  return { db, files, notifications, count, remove: () => remove(journal) };
}

for (const kind of ['document', 'photo'] as const) {
  for (const scoped of [false, true]) {
    const path = scoped ? 'outer transaction' : 'root';
    test(`${kind} ${path} delete resolves and invalidates after cleanup fails, then sweep retries`, async () => {
      const fixture = await setup(kind, scoped);
      const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fixture.files.failNthRemove(1);
      await expect(fixture.remove()).resolves.toBeUndefined();
      expect(await fixture.count()).toBe(0);
      expect(fixture.notifications).toEqual([kind === 'document' ? ['document'] : ['photo', 'entry', 'milestone']]);
      expect(warned).toHaveBeenCalledWith('Could not finish post-commit cleanup', expect.any(Error));
      expect(fixture.files.names()).toHaveLength(2);
      await sweepOrphanPhotos(fixture.db, fixture.files);
      expect(fixture.files.names()).toEqual([]);
    });

    test(`${kind} ${path} delete rejects database failure without invalidation or file removal`, async () => {
      const fixture = await setup(kind, scoped);
      await fixture.db.exec(`CREATE TRIGGER refuse_delete BEFORE DELETE ON ${kind}
        BEGIN SELECT RAISE(ABORT, 'delete refused'); END`);
      const names = fixture.files.names();
      await expect(fixture.remove()).rejects.toThrow('delete refused');
      expect(await fixture.count()).toBe(1);
      expect(fixture.notifications).toEqual([]);
      expect(fixture.files.names()).toEqual(names);
    });
  }

  test(`${kind} outer rollback keeps rows and bytes without invalidation`, async () => {
    const fixture = await setup(kind, true, true);
    const names = fixture.files.names();
    await expect(fixture.remove()).rejects.toThrow('commit refused');
    expect(await fixture.count()).toBe(1);
    expect(fixture.notifications).toEqual([]);
    expect(fixture.files.names()).toEqual(names);
  });
}
