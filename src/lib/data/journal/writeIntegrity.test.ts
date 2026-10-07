import { test, expect } from 'vitest';
import type { SqliteDriver } from '../sqlite/driver';
import { migratedDb } from '../sqlite/test-support/migrated-db';
import { fakeFileStore } from '../photos/test-support/fake-file-store';
import { openJournal } from './journal';

function failStatement(driver: SqliteDriver, refused: RegExp): SqliteDriver {
  return {
    ...driver,
    async run(sql, params) {
      if (refused.test(sql)) throw new Error('forced write failure');
      return driver.run(sql, params);
    },
    transaction: (work) => driver.transaction((scope) => work(failStatement(scope, refused)))
  };
}

test.each(['adoption', 'procedure', 'snapshot', 'trash', 'restore', 'wear'] as const)(
  '%s rolls back every write when its final statement fails', async (operation) => {
    const db = await migratedDb();
    const files = fakeFileStore();
    const journal = openJournal(db, files);
    await journal.reconcileBuiltIns();
    let act!: (target: ReturnType<typeof openJournal>) => Promise<unknown>;
    let refused!: RegExp;
    if (operation === 'adoption') {
      const id = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Robin', startEpochDay: 20000, endEpochDay: null });
      await journal.feltSense.add({ tryoutId: id }, { epochDay: 20001, mood: 4, note: 'comfortable' });
      refused = /INSERT INTO felt_sense/;
      act = (target) => target.tryouts.adoptTryout(id, { endEpochDay: 20002, createMilestone: true });
    } else if (operation === 'procedure') {
      const id = await journal.procedures.upsertProcedure({ name: 'consultation' });
      await journal.procedures.addChecklistItem(id, 'Bring referral');
      const document = await journal.documents.addDocument({ title: 'Referral', epochDay: 20000 }, { full: new Uint8Array([1]), thumb: new Uint8Array([2]) });
      await journal.documents.setDocumentTarget(document, { kind: 'procedure', id });
      refused = /DELETE FROM checklist WHERE/;
      act = (target) => target.procedures.deleteProcedure(id);
    } else if (operation === 'snapshot') {
      const id = await journal.doubtJournal.saveSnapshot(20000, [{ epochDay: 19999, mood: 4, note: 'good day' }]);
      refused = /DELETE FROM doubt_snapshot WHERE/;
      act = (target) => target.doubtJournal.deleteSnapshot(id);
    } else if (operation === 'wear') {
      refused = /INSERT INTO reminder/;
      act = (target) => target.wearSessions.upsertSession({ kind: 'binder', startTimestamp: Date.now(), durationMs: null, reminderHoursAfterStart: 2, reminderTitle: 'Pause' });
    } else {
      const id = await journal.entries.upsertEntry({ epochDay: 20000, note: 'searchable note', mood: 3 });
      if (operation === 'restore') await journal.entries.deleteEntry(id);
      refused = operation === 'trash' ? /DELETE FROM entry_fts/ : /INSERT INTO entry_fts/;
      act = (target) => operation === 'trash' ? target.entries.deleteEntry(id) : target.entries.restoreEntry(id);
    }
    const before = (await journal.archive.snapshot()).journal;
    await expect(act(openJournal(failStatement(db, refused), files))).rejects.toThrow('forced write failure');
    expect((await journal.archive.snapshot()).journal).toEqual(before);
    await db.close();
  }
);
