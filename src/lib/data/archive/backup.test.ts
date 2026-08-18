import assert from 'node:assert/strict';
import { test } from 'vitest';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import type { ArchiveSnapshot } from '../journal/archive.ts';
import { EXPORT_PATHS, runExport, type Delivery, type OutgoingFile, type ExportSource } from './backup.ts';

const emptySnapshot: ArchiveSnapshot = {
  journal: {
    dimensions: [],
    presets: [],
    tagGroups: [],
    entries: [],
    milestones: [],
    labResults: [],
    measurements: [],
    reminders: [],
    tallyEvents: [],
    regimenEpisodes: [],
    doseEvents: [],
    doseSchedules: [],
    dosePauses: [],
    medicationStock: []
  },
  files: [],
  readFile: async () => {
    throw new Error('the fixture has no photos');
  }
};

const source: ExportSource = {
  snapshot: emptySnapshot,
  preferences: { ...PREFERENCE_DEFAULTS, name: 'Alicja' },
  password: 'correct horse',
  naming: { dimensionName: (key) => key, tagLabel: (id) => id }
};

/* The bodies are async generators, so nothing is produced until they are
   pulled. Not pulling the encrypted one is what keeps this file in the
   Node tier's budget: its first chunk costs a real Argon2id derivation, a
   second by design (ADR-0013), and what is under test here is the
   dispatch and the timestamp rather than the packing pack.test.ts
   already covers. */
function fakeDelivery(delivery: Delivery = 'downloaded') {
  const delivered: OutgoingFile[] = [];
  return {
    delivered,
    deliver: async (file: OutgoingFile) => {
      delivered.push(file);
      return delivery;
    }
  };
}

const collect = async (file: OutgoingFile) => {
  let text = '';
  const decoder = new TextDecoder();
  for await (const piece of file.body) text += decoder.decode(piece, { stream: true });
  return text + decoder.decode();
};

/* Enumerated, not listed by hand: an export path that gets added without
   stamping the timestamp fails here rather than shipping a journal whose
   Home screen says it was backed up when it wasn't (F21). */
for (const path of EXPORT_PATHS) {
  test(`the ${path} export records a backup`, async () => {
    const { deliver, delivered } = fakeDelivery();
    let recorded: number | null = null;
    const before = Date.now();

    const delivery = await runExport(path, source, { deliver, recordBackup: (at) => (recorded = at) });

    assert.equal(delivery, 'downloaded');
    assert.equal(delivered.length, 1);
    // Epoch millis, not an epoch day: the demo store mixed the two and the
    // Home notice then read a 2026 backup as 56 years stale.
    assert.ok(recorded !== null && recorded >= before, `${path} recorded ${recorded}`);
  });

  test(`the ${path} export records nothing when the share sheet is cancelled`, async () => {
    const { deliver } = fakeDelivery('cancelled');
    let recorded: number | null = null;

    await runExport(path, source, { deliver, recordBackup: (at) => (recorded = at) });

    assert.equal(recorded, null);
  });
}

test('each path names the file it delivers after the journal and the day', async () => {
  const extensions: Record<string, string> = { encrypted: '.ttbackup', csv: '.csv', json: '.json' };
  for (const path of EXPORT_PATHS) {
    const { deliver, delivered } = fakeDelivery();
    await runExport(path, source, { deliver, recordBackup: () => {} });
    assert.match(delivered[0].fileName, new RegExp(`^alicja-journal-\\d{4}-\\d{2}-\\d{2}\\${extensions[path]}$`));
  }
});

test('the plain paths deliver the journal in the format they name', async () => {
  const csv = fakeDelivery();
  await runExport('csv', source, { deliver: csv.deliver, recordBackup: () => {} });
  assert.equal(csv.delivered[0].type, 'text/csv');
  assert.equal(await collect(csv.delivered[0]), 'date,time,mood,tags,note\n');

  const json = fakeDelivery();
  await runExport('json', source, { deliver: json.deliver, recordBackup: () => {} });
  assert.equal(json.delivered[0].type, 'application/json');
  assert.deepEqual(JSON.parse(await collect(json.delivered[0])).journal, emptySnapshot.journal);
});
