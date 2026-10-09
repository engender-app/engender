import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { openArchive } from '../src/lib/data/archive/pack.ts';
import { migratedDb } from '../src/lib/data/sqlite/test-support/migrated-db.ts';
import { fakeFileStore } from '../src/lib/data/photos/test-support/fake-file-store.ts';
import { openJournal } from '../src/lib/data/journal/journal.ts';

test('imports alpha producer output through the current public Archive boundary', async () => {
  const path = new URL('../fixtures/legacy/alpha-2026-08-14/archive.ttbackup', import.meta.url);
  const bytes = new Uint8Array(readFileSync(path));
  async function* oneShot() { yield bytes; }
  const opened = await openArchive(oneShot(), 'a golden horse, stapled');
  const expected = opened.payload.journal;
  const driver = await migratedDb();
  try {
    const files = fakeFileStore();
    const journal = openJournal(driver, files);
    await journal.reconcileBuiltIns();
    await journal.archive.replace({ journal: expected, files: opened.files, fileCount: opened.payload.files.length });
    const entries = await journal.entries.entriesForDay(20000);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].note, 'Alpha compatibility: zażółć gęślą jaźń');
    assert.equal(entries[0].mood, 4);
    const actual = await journal.archive.snapshot();
    for (const section of ['entries', 'dimensions', 'presets', 'tagGroups', 'milestones', 'labResults', 'reminders'] as const) {
      if (!['dimensions', 'tagGroups'].includes(section)) assert.equal(actual.journal[section].length, expected[section].length, section);
      for (const row of expected[section]) {
        const identity = row as unknown as Record<string, unknown>;
        const key = 'uuid' in row ? 'uuid' : 'key' in row ? 'key' : 'id';
        const restored = actual.journal[section].find((candidate) => (candidate as unknown as Record<string, unknown>)[key] === identity[key]) as unknown as Record<string, unknown>;
        assert.ok(restored, `${section} ${identity[key]}`);
        for (const [key, value] of Object.entries(row)) {
          if (key === 'photos') {
            assert.deepEqual((restored.photos as { id: string; fileName: string }[]).map(({ id, fileName }) => ({ id, fileName })), value);
          } else if (key === 'photo' && value) {
            const photo = restored.photo as { id: string; fileName: string };
            assert.deepEqual({ id: photo.id, fileName: photo.fileName }, value);
          } else if (key === 'tags' && section === 'tagGroups') {
            for (const tag of value as { id: string }[]) assert.deepEqual((restored.tags as { id: string }[]).find((candidate) => candidate.id === tag.id), tag);
          } else assert.deepEqual(restored[key], value, `${section}.${key}`);
        }
      }
    }
    assert.equal(entries[0].starred, false);
    assert.deepEqual(entries[0].recordings, []);
    assert.deepEqual(entries[0].videos, []);
    assert.equal(actual.files.length, 2);
    for (const file of actual.files) {
      assert.equal(new TextDecoder().decode(await files.read(file.name)), 'Invented alpha attachment bytes; format coverage only');
    }
    assert.deepEqual(new Uint8Array(readFileSync(path)), bytes);
  } finally {
    await driver.close();
  }
});

test('alpha SQLite remains below baseline and legacy fixture bytes remain immutable', async () => {
  const { copyFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createHash } = await import('node:crypto');
  const { runMigrations, JournalBelowBaselineError } = await import('../src/lib/data/sqlite/migration-runner.ts');
  const { migrations } = await import('../src/lib/data/sqlite/migrations.ts');
  const { noopFileOps } = await import('../src/lib/data/sqlite/test-support/migrated-db.ts');
  const { makeNodeSqliteDb } = await import('../src/lib/data/sqlite/test-support/node-sqlite-driver.ts');
  const root = new URL('../fixtures/legacy/alpha-2026-08-14/', import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL('provenance.json', root), 'utf8'));
  for (const [name, digest] of Object.entries(provenance.fixture_sha256)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(name, root))).digest('hex'), digest);
  }
  const temporary = mkdtempSync(join(tmpdir(), 'engender-alpha-'));
  const path = join(temporary, 'journal.sqlite');
  copyFileSync(new URL('journal.sqlite', root), path);
  const before = readFileSync(path);
  const driver = makeNodeSqliteDb(path);
  try {
    await assert.rejects(runMigrations(driver, noopFileOps(), migrations), (error: unknown) =>
      error instanceof JournalBelowBaselineError && error.foundVersion === 3 && error.baselineVersion === 88);
    assert.deepEqual(readFileSync(path), before);
  } finally {
    await driver.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});
