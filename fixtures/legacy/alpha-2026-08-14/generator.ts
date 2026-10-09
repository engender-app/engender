import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { migratedDb } from '../src/lib/data/sqlite/test-support/migrated-db.ts';
import { openJournal } from '../src/lib/data/journal/journal.ts';
import { fakeFileStore } from '../src/lib/data/photos/test-support/fake-file-store.ts';
import { PREFERENCE_DEFAULTS } from '../src/lib/data/prefs/catalogue.ts';
import { portablePreferences } from '../src/lib/data/archive/payload.ts';
import { packArchive, openArchive } from '../src/lib/data/archive/pack.ts';
import { collect } from '../src/lib/data/archive/container.ts';

test('exports a provenance fixture with the unchanged alpha producer', async () => {
  const output = '/home/alice/_projekty/priv/gender-diary/.claude/before-release-v2-run/legacy-fixtures/alpha-2026-08-14';
  mkdirSync(output, { recursive: true });
  const driver = await migratedDb();
  try {
    const files = fakeFileStore();
    const journal = openJournal(driver, files);
    await journal.reconcileBuiltIns();
    const dimension = await journal.dimensions.addCustomDimension({ name: 'Legacy fixture', low: 'low', high: 'high', min: 0, max: 10 });
    const entryId = await journal.entries.upsertEntry({ epochDay: 20000, mood: 4, note: 'Alpha compatibility: zażółć gęślą jaźń', dims: { [dimension.key]: 7 }, tags: ['e-happy'] });
    const attachment = new TextEncoder().encode('Invented alpha attachment bytes; format coverage only');
    await journal.photos.attach({ entryId }, { full: attachment, thumb: attachment });
    await journal.milestones.upsertMilestone({ name: 'Legacy milestone', epochDay: 19000 });
    await journal.labs.upsertResult({ epochDay: 20000, analyte: 'estradiol', value: 412.5, unit: 'pmol/L' });
    await journal.reminders.upsertReminder({ title: 'Fixture reminder', type: 'injection', time: '08:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null, enabled: true });
    const snapshot = await journal.archive.snapshot();
    const archive = await collect(packArchive({ ...snapshot, preferences: portablePreferences({ ...PREFERENCE_DEFAULTS, name: 'Legacy fixture', theme: 'dark' }) }, 'a golden horse, stapled'));
    async function* oneShot() { yield archive; }
    const opened = await openArchive(oneShot(), 'a golden horse, stapled');
    assert.equal(opened.payload.journal.entries[0].note, 'Alpha compatibility: zażółć gęślą jaźń');
    for await (const file of opened.files) assert.deepEqual(file.bytes, attachment);
    writeFileSync(join(output, 'archive.ttbackup'), archive, { flag: 'wx' });
    await driver.exec(`VACUUM INTO '${join(output, 'journal.sqlite')}'`);
    const tables = await driver.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const sqliteTables: Record<string, number> = {};
    for (const { name } of tables) {
      const [row] = await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`);
      sqliteTables[name] = row.n;
    }
    const archiveSections = Object.fromEntries(Object.entries(snapshot.journal).map(([name, rows]) => [name, rows.length]));
    writeFileSync(join(output, 'counts.json'), JSON.stringify({ archiveSections, sqliteTables }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ schema: await driver.getUserVersion(), archiveBytes: archive.length, archiveSections, attachmentCount: snapshot.files.length }));
  } finally {
    await driver.close();
  }
});
