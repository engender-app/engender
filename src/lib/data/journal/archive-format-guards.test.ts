import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { UnsupportedArchiveError, collect } from '../archive/container.ts';
import { archiveFailureKind } from '../archive/failure.ts';
import { packArchive } from '../archive/pack.ts';
import { portablePreferences } from '../archive/payload.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { CHEAP_KDF, GOLDEN_PASSWORD, oneShot } from './golden-archive-fixture.ts';
import { verifyArchive } from './restore.ts';

const newerVersion = (error: unknown): boolean => {
  assert.ok(error instanceof UnsupportedArchiveError);
  assert.equal(archiveFailureKind(error), 'newer-version');
  assert.match(error.message, /newer version of the app/);
  return true;
};

for (const mode of ['replace', 'merge'] as const) {
  test(`${mode} refuses unknown archive sections before writing rows or files`, async () => {
    const driver = await migratedDb();
    const files = fakeFileStore();
    const journal = openJournal(driver, files);
    await journal.reconcileBuiltIns();
    await journal.entries.upsertEntry({ epochDay: 20000, mood: 3 });
    const before = await journal.archive.snapshot();
    for (const rows of [[], [{ id: 'future-row' }]]) {
      const contents = {
        journal: { ...before.journal, futureArea: rows },
        files: (async function* () {
          throw new Error('refusal must happen before reading files');
        })()
      };
      await assert.rejects(journal.archive[mode](contents), newerVersion);
      assert.deepEqual((await journal.archive.snapshot()).journal, before.journal);
      assert.deepEqual(await files.list(), []);
    }
    await driver.close();
  });
}

test('the backup drill refuses an unknown section even under the current format number', async () => {
  const driver = await migratedDb();
  const journal = openJournal(driver, fakeFileStore());
  const snapshot = await journal.archive.snapshot();
  const futureJournal = { ...snapshot.journal, futureArea: [] };
  const packed = await collect(packArchive({
    ...snapshot,
    journal: futureJournal,
    preferences: portablePreferences(PREFERENCE_DEFAULTS)
  }, GOLDEN_PASSWORD, CHEAP_KDF));
  await assert.rejects(verifyArchive(oneShot(packed), GOLDEN_PASSWORD), newerVersion);
  await driver.close();
});

test('newer-version refusals explain the update in both catalogues', () => {
  for (const locale of ['en', 'pl']) {
    const messages = JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'));
    for (const key of ['imp_newer_version', 'verify_newer_version']) {
      assert.match(messages[key], locale === 'en' ? /newer version of the app.*Update/ : /nowszej wersji aplikacji.*zaktualizuj/);
    }
  }
});
