import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, vi } from 'vitest';
import { CorruptArchiveError, collect } from '../archive/container.ts';
import { archiveFailureKind } from '../archive/failure.ts';
import { packArchive } from '../archive/pack.ts';
import { portablePreferences } from '../archive/payload.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import type { ArchiveJournal } from '../archive/payload.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { journalPath, goldenContents, countsOf, CHEAP_KDF, GOLDEN_PASSWORD, oneShot } from './golden-archive-fixture.ts';
import { openJournal } from './journal.ts';
import { restoreArchive, verifyArchive } from './restore.ts';

const golden = (): ArchiveJournal => JSON.parse(readFileSync(journalPath, 'utf8'));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function tableCounts(driver: Awaited<ReturnType<typeof migratedDb>>) {
  const tables = await driver.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'entry_fts%' ORDER BY name`
  );
  const counts: Record<string, number> = {};
  for (const { name } of tables) counts[name] = (await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${name}`))[0].n;
  return counts;
}

async function refusesWithoutChanges(mode: 'merge' | 'replace', incoming: ArchiveJournal) {
  const driver = await migratedDb();
  const files = fakeFileStore(['keep.bin']);
  const journal = openJournal(driver, files);
  try {
    await journal.reconcileBuiltIns();
    await journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'Existing synthetic journal' });
    const before = (await journal.archive.snapshot()).journal;
    const beforeTables = await tableCounts(driver);
    const transaction = vi.spyOn(driver, 'transaction');
    const list = vi.spyOn(files, 'list');
    const write = vi.spyOn(files, 'write');
    let pulled = false;
    await assert.rejects(restoreArchive(driver, files, mode, {
      journal: incoming,
      files: (async function* () { pulled = true; yield { name: 'incoming.bin', bytes: new Uint8Array([2]) }; })()
    }), (error: unknown) => {
      assert.ok(error instanceof CorruptArchiveError);
      assert.equal(archiveFailureKind(error), 'corrupt');
      return true;
    });
    assert.equal(transaction.mock.calls.length, 0, 'refusal precedes transaction admission');
    assert.equal(list.mock.calls.length, 0, 'refusal precedes file-store access');
    assert.equal(write.mock.calls.length, 0);
    assert.equal(pulled, false, 'refusal precedes stream consumption');
    const after = (await journal.archive.snapshot()).journal;
    assert.deepEqual(countsOf(after), countsOf(before));
    assert.deepEqual(await tableCounts(driver), beforeTables);
    assert.equal(hash(after), hash(before));
    assert.deepEqual(files.names(), ['keep.bin']);
    assert.deepEqual(await files.read('keep.bin'), new Uint8Array([1]));
  } finally {
    await driver.close();
  }
}

for (const mode of ['merge', 'replace'] as const) {
  test(`${mode} refuses the original null-affirmation identity without changing counts or content`, async () => {
    const contents = await goldenContents();
    contents.journal.affirmations[1].id = null as unknown as string;
    await refusesWithoutChanges(mode, contents.journal);
  });

  test(`${mode} refuses missing identity in every current section`, async () => {
    for (const section of Object.keys(golden()) as (keyof ArchiveJournal)[]) {
      const incoming = golden();
      const row = incoming[section][0] as unknown as Record<string, unknown>;
      assert.ok(row, `golden covers ${section}`);
      const identity = ['id', 'uuid', 'key', 'packKey', 'track', 'area', 'eraUuid', 'word'].find((key) => Object.hasOwn(row, key));
      assert.ok(identity, `fixture identity for ${section}`);
      row[identity] = null;
      await refusesWithoutChanges(mode, incoming);
    }
  });

  test(`${mode} refuses malformed nested rows, scalar types and unsafe numbers`, async () => {
    const mutations: ((journal: ArchiveJournal) => void)[] = [
      (j) => { j.tagGroups[0].tags[0].id = null as unknown as string; },
      (j) => { j.affirmations[0].text = null as unknown as string; },
      (j) => { j.affirmations[0].hidden = 'false' as unknown as boolean; },
      (j) => { j.entries[0].timestamp = 2 ** 53; },
      (j) => { j.entries[0].timestamp = Infinity; },
      (j) => { j.measurements[0].value = '4' as unknown as number; },
      (j) => { j.entries[0].dims = { femininity: 2 ** 53 }; },
      (j) => { j.entries[0].photos[0].id = null as unknown as string; },
      (j) => { j.checklists[0].items[0].id = ''; },
      (j) => { j.roadmapChecks[0].goalKey = null as unknown as string; },
      (j) => { j.doseSchedules[0].weekdays = [2 ** 53]; },
      (j) => { j.importLog[0].counts = { entries: 2 ** 53 }; },
      (j) => { j.affirmations[0] = null as unknown as typeof j.affirmations[number]; },
      (j) => { delete (j as Partial<ArchiveJournal>).appointments; j.procedures[0].consults = [{ id: null as unknown as string, epochDay: 20000 }]; },
      (j) => { delete (j as Partial<ArchiveJournal>).appointments; j.procedures[0] = null as unknown as typeof j.procedures[number]; }
    ];
    for (const mutate of mutations) {
      const incoming = golden(); mutate(incoming);
      await refusesWithoutChanges(mode, incoming);
    }
  });
}


test('the backup drill refuses a validly encrypted null-identity body as corrupt', async () => {
  const journal = golden();
  journal.affirmations[1].id = null as unknown as string;
  const packed = await collect(packArchive({ journal, files: [], preferences: portablePreferences(PREFERENCE_DEFAULTS),
    readFile: async () => { throw new Error('the fixture has no files'); } }, GOLDEN_PASSWORD, CHEAP_KDF));
  await assert.rejects(verifyArchive(oneShot(packed), GOLDEN_PASSWORD), (error: unknown) => {
    assert.ok(error instanceof CorruptArchiveError);
    assert.equal(archiveFailureKind(error), 'corrupt');
    return true;
  });
});
