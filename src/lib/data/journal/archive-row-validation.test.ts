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
import { assertArchiveRows } from './archiveRowValidation.ts';
import { ARCHIVE_SECTION_NAMES } from './archiveSections.ts';
import { todayEpochDay } from '../epochDay.ts';

const golden = (): ArchiveJournal => JSON.parse(readFileSync(journalPath, 'utf8'));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

for (const mode of ['replace', 'merge'] as const) {
  test(`${mode} drops legacy tryout kinds and keeps their milestones unlinked`, async () => {
    const incoming = golden();
    for (const kind of ['garment', 'presentation_step']) {
      const id = `legacy-${kind}`;
      incoming.tryouts.push({ id, kind, label: kind, description: null, startEpochDay: 10, endEpochDay: null, photos: [] });
      incoming.milestones.push({ ...incoming.milestones[0], id: `${id}-milestone`, name: kind, tryoutId: id, photo: null });
      incoming.feltSenseEntries.push({ id: `${id}-felt`, tryoutId: id, epochDay: 10, mood: 3, note: null });
    }
    const driver = await migratedDb();
    try {
      await restoreArchive(driver, fakeFileStore(), mode, {
        journal: incoming,
        files: (async function* () {})()
      });
      const restored = (await openJournal(driver, fakeFileStore()).archive.snapshot()).journal;
      assert.ok(restored.tryouts.every((row) => row.kind !== 'garment' && row.kind !== 'presentation_step'));
      assert.ok(restored.feltSenseEntries.every((row) => !row.id.startsWith('legacy-')));
      for (const kind of ['garment', 'presentation_step']) {
        const milestone = restored.milestones.find((row) => row.id === `legacy-${kind}-milestone`);
        assert.ok(milestone);
        assert.equal(milestone.tryoutId, null);
      }
    } finally {
      await driver.close();
    }
  });
}

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
  test(`${mode} refuses a document missing targetId before storage access`, async () => {
    const incoming = golden();
    delete (incoming.documents[0] as Partial<typeof incoming.documents[number]>).targetId;
    await refusesWithoutChanges(mode, incoming);
  });

  test(`${mode} refuses missing identity in every current section`, async () => {
    for (const section of ARCHIVE_SECTION_NAMES) {
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
      (j) => { j.entries[0].timestamp = 2 ** 53; },
      (j) => { j.entries[0].timestamp = Infinity; },
      (j) => { j.entries[0].dims = { femininity: 2 ** 53 }; },
      (j) => { j.entries[0].photos[0].id = null as unknown as string; },
      (j) => { j.checklists[0].items[0].id = ''; },
      (j) => { j.roadmapChecks[0].goalKey = null as unknown as string; },
      (j) => { j.doseSchedules[0].weekdays = [2 ** 53]; },
      (j) => { j.importLog[0].counts = { entries: 2 ** 53 }; },
      (j) => { delete (j as Partial<ArchiveJournal>).appointments; j.procedures[0] = null as unknown as typeof j.procedures[number]; }
    ];
    for (const mutate of mutations) {
      const incoming = golden(); mutate(incoming);
      await refusesWithoutChanges(mode, incoming);
    }
  });

  /* row 13: each primitive check and each row-shape and reference refusal below survived
     its own mutants, because no row reached it with the wrong value. One case per check,
     named. */
  test(`${mode} refuses a wrong value at each check, one check at a time`, async () => {
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    const cases: [string, (journal: ArchiveJournal) => void][] = [
      ['text', (j) => { (j.entries[0] as { note: unknown }).note = 1; }],
      ['bool', (j) => { (j.entries[0] as { starred: unknown }).starred = 'true'; }],
      ['numeric type', (j) => { (j.entries[0] as { epochDay: unknown }).epochDay = '20000'; }],
      ['numeric NaN', (j) => { j.entries[0].epochDay = Number.NaN; }],
      ['oneOf type', (j) => { (j.cycleEvents[0] as { kind: unknown }).kind = 1; }],
      ['integerBetween fraction', (j) => { j.sideEffects[0].severity = 2.5; }],
      ['integerBetween low', (j) => { j.sideEffects[0].severity = 0; }],
      ['integerBetween type', (j) => { (j.sideEffects[0] as { severity: unknown }).severity = '3'; }],
      ['clockTime hour', (j) => { j.appointments[0].time = '24:00'; }],
      ['clockTime shape', (j) => { j.appointments[0].time = '9:00'; }],
      ['clockTime type', (j) => { (j.appointments[0] as { time: unknown }).time = 900; }],
      ['record', (j) => { (j.importLog[0] as { counts: unknown }).counts = [5]; }],
      ['numericRecord value', (j) => { (j.entries[0] as { dims: unknown }).dims = { femininity: '60' }; }],
      ['list', (j) => { (j.entries[0] as { tags: unknown }).tags = 'e-happy'; }],
      ['object', (j) => { (j.entries[0] as { photos: unknown[] }).photos = ['x']; }],
      ['instant', (j) => { j.entries[0].trashedAt = -1; }],
      ['stamp', (j) => { j.entries[0].updatedAt = 1.5; }],
      ['costed pair', (j) => { j.labResults[0].costAmount = 10; j.labResults[0].costCurrency = null; }],
      ['side effect resolved before it began', (j) => { j.sideEffects[0].resolvedEpochDay = j.sideEffects[0].epochDay - 1; }],
      ['reminder every-N without its anchor', (j) => { j.reminders[0].anchorEpochDay = null; }],
      ['reminder one-off with a recurrence', (j) => {
        Object.assign(j.reminders[0], { recurrence: 'DAILY', epochDay: 20000, interval: null, anchorEpochDay: null });
      }],
      ['dose schedule every-N without a count', (j) => { j.doseSchedules[0].everyNDays = null; }],
      ['dose event slot without its source', (j) => {
        Object.assign(j.doseEvents[0], { autoLogEpisodeId: 'e', autoLogEpochDay: 1, autoLogIndex: 0 });
      }],
      ['dose event slot below zero', (j) => {
        Object.assign(j.doseEvents[0], { source: 'schedule', autoLogEpisodeId: 'e', autoLogEpochDay: 1, autoLogIndex: -1 });
      }],
      ['document target half set', (j) => { j.documents[0].targetId = null; }],
      ['checklist owner half set', (j) => { j.checklists[0].ownerId = null; }],
      ['repeated preset dimension', (j) => { j.presets[0].dims = [j.presets[0].dims[0], j.presets[0].dims[0]]; }],
      ['repeated schedule weekday', (j) => {
        Object.assign(j.doseSchedules[0], { recurrenceKind: 'weekdays', everyNDays: null, weekdays: [1, 1] });
      }],
      ['repeated tag id', (j) => { j.tagGroups[1].tags.push({ ...clone(j.tagGroups[1].tags[0]), label: 'twin' }); }],
      ['repeated entry photo id', (j) => {
        j.entries[1].photos.push({ ...clone(j.entries[0].photos[0]), fileName: 'twin.jpg' });
      }],
      ['repeated recording id', (j) => {
        const from = j.entries.find((e) => (e.recordings ?? []).length > 0)!;
        j.entries.find((e) => e !== from)!.recordings = [{ ...clone(from.recordings![0]), fileName: 'twin.webm' }];
      }],
      ['repeated video id', (j) => {
        const from = j.entries.find((e) => (e.videos ?? []).length > 0)!;
        j.entries.find((e) => e !== from)!.videos = [{ ...clone(from.videos![0]), fileName: 'twin.webm' }];
      }],
      ['repeated tryout photo id', (j) => { j.tryouts[0].photos.push({ ...clone(j.tryouts[0].photos[0]), fileName: 'twin.jpg' }); }],
      ['repeated procedure photo id', (j) => {
        const from = j.procedures.find((row) => row.photos.length > 0)!;
        from.photos.push({ ...clone(from.photos[0]), fileName: 'twin.jpg' });
      }],
      ['repeated hair removal photo id', (j) => {
        j.hairRemovalSessions[0].photos.push({ ...clone(j.hairRemovalSessions[0].photos[0]), fileName: 'twin.jpg' });
      }],
      ['repeated checklist item id', (j) => { j.checklists[0].items.push({ ...clone(j.checklists[0].items[0]), content: 'twin' }); }],
      ['milestone tryout reference', (j) => { j.milestones[0].tryoutId = 'missing_tryout'; }]
    ];
    for (const [what, mutate] of cases) {
      const incoming = golden(); mutate(incoming);
      await refusesWithoutChanges(mode, incoming).catch((error: unknown) => {
        throw new Error(`${what}: ${(error as Error).message}`);
      });
    }
  });

  test(`${mode} refuses missing reference data before storage access`, async () => {
    const mutations: ((journal: ArchiveJournal) => void)[] = [
      (j) => { j.presets[0].dims[0] = 'missing_dimension'; },
      (j) => { j.entries[0].dims = { missing_dimension: 30 }; },
      (j) => { j.entries[0].tags = ['missing_tag']; },
      (j) => { j.personalEffectTypes[0].categoryKey = 'missing_category'; },
      (j) => { j.milestones[0].procedureId = 'missing_procedure'; },
      (j) => { j.entries[0].presentationId = 'missing_presentation'; }
    ];
    for (const mutate of mutations) {
      const incoming = golden(); mutate(incoming);
      await refusesWithoutChanges(mode, incoming);
    }
  });

  test(`${mode} refuses constrained values before storage access`, async () => {
    const mutations: ((journal: ArchiveJournal) => void)[] = [
      (j) => { j.personalEffectTypes[0].direction = 'sideways' as never; },
      (j) => { j.documents[0].targetKind = 'missing' as never; },
      (j) => { j.hairRemovalSessions[0].area = 'missing' as never; },
      (j) => { j.reminders[0].recurrence = null; },
      (j) => { j.doseSchedules[0].recurrenceKind = 'missing' as never; },
      (j) => { j.doseSchedules[0].weekdays = [8]; },
      (j) => { j.doseSchedules[0].recurrenceKind = 'weekdays'; },
      (j) => { j.entries[0].bodyRegions = { head: 50 }; },
      (j) => { j.sideEffects[0].severity = 6; },
      (j) => { j.checklists[0].ownerKind = 'appointment'; j.checklists[0].ownerId = null; }
    ];
    for (const mutate of mutations) {
      const incoming = golden(); mutate(incoming);
      await refusesWithoutChanges(mode, incoming);
    }
  });

  test(`${mode} refuses duplicate identities and composite keys before storage access`, async () => {
    const mutations: ((journal: ArchiveJournal) => void)[] = [
      (j) => { j.letters.push({ ...j.letters[0] }); },
      (j) => { j.presets[0].dims.push(j.presets[0].dims[0]); },
      (j) => { j.dimensions.push({ ...j.dimensions[0] }); },
      (j) => { j.dimensions.push({ ...j.dimensions[0], id: 'decoy' } as never); },
      (j) => { j.areaStates.push({ ...j.areaStates[0] }); },
      (j) => { j.entries[1].photos.push({ ...j.entries[0].photos[0] }); },
    ];
    for (const mutate of mutations) {
      const incoming = golden(); mutate(incoming);
      await refusesWithoutChanges(mode, incoming);
    }
  });
}


test('the backup drill refuses a validly encrypted null-identity body as corrupt', async () => {
  const journal = golden();
  journal.bodyRegions[0].id = null as unknown as string;
  const packed = await collect(packArchive({ journal, files: [], preferences: portablePreferences(PREFERENCE_DEFAULTS),
    readFile: async () => { throw new Error('the fixture has no files'); } }, GOLDEN_PASSWORD, CHEAP_KDF));
  await assert.rejects(verifyArchive(oneShot(packed), GOLDEN_PASSWORD), (error: unknown) => {
    assert.ok(error instanceof CorruptArchiveError);
    assert.equal(archiveFailureKind(error), 'corrupt');
    return true;
  });
});

for (const mode of ['merge', 'replace'] as const) {
  test(`${mode} refuses an id holding a lone surrogate in every section`, async () => {
    for (const section of ['entries', 'doseEvents', 'tagGroups'] as const) {
      const incoming = golden();
      const row = incoming[section][0] as unknown as Record<string, unknown>;
      const field = section === 'entries' ? 'uuid' : section === 'tagGroups' ? 'key' : 'id';
      row[field] = '\ud800';
      await refusesWithoutChanges(mode, incoming);
    }
  });

  // the first Merge stored such an id, and the second
  // could no longer match it and failed on a raw UNIQUE constraint.
  test(`${mode} refuses an id or key holding a NUL character`, async () => {
    const nul = String.fromCharCode(0);
    for (const [section, field] of [
      ['personalEffects', 'effect'], ['dimensions', 'key'], ['marginNotes', 'id'], ['bodyRegions', 'id']
    ] as const) {
      const incoming = golden();
      const row = incoming[section][0] as unknown as Record<string, unknown>;
      assert.equal(typeof row[field], 'string', `golden covers ${section}.${field}`);
      row[field] = nul;
      await refusesWithoutChanges(mode, incoming);
      row[field] = `${row.id ?? 'x'}${nul}`;
      await refusesWithoutChanges(mode, incoming);
    }
  });

  test(`${mode} refuses auto-log fields the dose_event CHECK would reject`, async () => {
    const shapes: Record<string, unknown>[] = [
      { autoLogEpisodeId: 'ep', autoLogEpochDay: null, autoLogIndex: null },
      { autoLogEpisodeId: null, autoLogEpochDay: 20000, autoLogIndex: 0 },
      { autoLogEpisodeId: ' ', autoLogEpochDay: 20000, autoLogIndex: 0 },
      { autoLogEpisodeId: 'ep', autoLogEpochDay: 20000, autoLogIndex: -1 },
      { autoLogEpisodeId: 'ep', autoLogEpochDay: 20000.5, autoLogIndex: 0 },
      { autoLogEpisodeId: 'ep', autoLogEpochDay: 20000, autoLogIndex: 0.5 },
      { autoLogEpisodeId: 'ep', autoLogEpochDay: 20000, autoLogIndex: 0, source: 'manual' }
    ];
    for (const shape of shapes) {
      const incoming = golden();
      Object.assign(incoming.doseEvents[0], shape);
      await refusesWithoutChanges(mode, incoming);
    }
  });
}

/* row 13 after the Stryker rerun: the row-shape checks still let single-condition mutants
   through, because each shape was only ever handed rows its own refusal caught. Each case
   below changes one field of a golden row: the edges a check allows must pass, and each
   other shape must be refused, so no one condition can be dropped. */
test('each row-shape check accepts its edges and refuses each half-shape', () => {
  type Row = Record<string, unknown>;
  const base = golden() as unknown as Record<string, Row[]>;
  const row = (section: string, index: number, change: Row): Row => ({ ...base[section][index], ...change });
  const accepts: [string, string, Row][] = [
    ['side effect resolved the day it began', 'sideEffects', row('sideEffects', 0, { resolvedEpochDay: 20000 })],
    ['side effect not resolved', 'sideEffects', row('sideEffects', 0, { resolvedEpochDay: null })],
    ['dose event in the first slot of day 0', 'doseEvents',
      row('doseEvents', 0, { source: 'schedule', autoLogEpisodeId: 'episode', autoLogEpochDay: 0, autoLogIndex: 0 })],
    ['document with no target', 'documents', row('documents', 0, { targetKind: null, targetId: null })],
    ['checklist with no owner', 'checklists', row('checklists', 0, { ownerKind: null, ownerId: null })]
  ];
  for (const [what, section, value] of accepts) {
    assert.doesNotThrow(() => assertArchiveRows(section as keyof ArchiveJournal, [value]), what);
  }
  const [everyN, daily, oneOff] = [0, 1, 2];
  const refuses: [string, string, Row][] = [
    ['one-off with no day', 'reminders', row('reminders', oneOff, { epochDay: null })],
    ['one-off with an interval', 'reminders', row('reminders', oneOff, { interval: 7 })],
    ['one-off with an anchor', 'reminders', row('reminders', oneOff, { anchorEpochDay: 20000 })],
    ['every-N with no interval', 'reminders', row('reminders', everyN, { interval: null })],
    ['every-N with a day', 'reminders', row('reminders', everyN, { epochDay: 20000 })],
    ['daily with an interval', 'reminders', row('reminders', daily, { interval: 7 })],
    ['daily with an anchor', 'reminders', row('reminders', daily, { anchorEpochDay: 20000 })],
    ['daily with a day', 'reminders', row('reminders', daily, { epochDay: 20000 })],
    ['slot with a blank episode', 'doseEvents',
      row('doseEvents', 0, { source: 'schedule', autoLogEpisodeId: ' ', autoLogEpochDay: 1, autoLogIndex: 0 })],
    ['slot on a fractional day', 'doseEvents',
      row('doseEvents', 0, { source: 'schedule', autoLogEpisodeId: 'e', autoLogEpochDay: 1.5, autoLogIndex: 0 })],
    ['slot with a fractional index', 'doseEvents',
      row('doseEvents', 0, { source: 'schedule', autoLogEpisodeId: 'e', autoLogEpochDay: 1, autoLogIndex: 0.5 })],
    ['slot with only an episode', 'doseEvents',
      row('doseEvents', 0, { source: 'schedule', autoLogEpisodeId: 'e', autoLogEpochDay: null, autoLogIndex: null })],
    ['slot with only a day', 'doseEvents',
      row('doseEvents', 0, { source: 'schedule', autoLogEpisodeId: null, autoLogEpochDay: 1, autoLogIndex: null })],
    ['slot with only an index', 'doseEvents',
      row('doseEvents', 0, { source: 'schedule', autoLogEpisodeId: null, autoLogEpochDay: null, autoLogIndex: 0 })],
    ['document with a target id and no kind', 'documents', row('documents', 0, { targetKind: null })],
    ['checklist with an owner id and no kind', 'checklists', row('checklists', 0, { ownerKind: null })]
  ];
  for (const [what, section, value] of refuses) {
    assert.throws(() => assertArchiveRows(section as keyof ArchiveJournal, [value]), CorruptArchiveError, what);
  }
});

/* A row can be well-typed and still hold a value no screen survives. Each case below is one
   crafted archive, refused whole before any write, through Replace and Merge alike. */
const FUTURE_BOUND = 36525;
const scalarDomainRefusals: [string, (journal: ArchiveJournal) => void][] = [
  ['entry day below the first day', (j) => { j.entries[0].epochDay = -1; }],
  ['entry day near the minimum JS date', (j) => { j.entries[0].epochDay = -100_000_000; }],
  ['entry day fractional', (j) => { j.entries[0].epochDay = 20000.5; }],
  ['entry day past the future bound', (j) => { j.entries[0].epochDay = todayEpochDay() + FUTURE_BOUND + 1; }],
  ['milestone day extreme', (j) => { j.milestones[0].epochDay = -100_000_000; }],
  ['era start extreme', (j) => { j.eras[0].startEpochDay = -100_000_000; }],
  ['side-effect day extreme', (j) => { j.sideEffects[0].epochDay = -100_000_000; }],
  ['side-effect resolved day past the bound', (j) => { j.sideEffects[0].resolvedEpochDay = 2 ** 40; }],
  ['taper start extreme', (j) => { j.taper[0].startEpochDay = 2 ** 52; }],
  ['taper stages not JSON', (j) => { j.taper[0].stagesJson = '{'; }],
  ['taper stages not a list', (j) => { j.taper[0].stagesJson = '{"days":3}'; }],
  ['taper stage with a non-number', (j) => { j.taper[0].stagesJson = '[{"everyNDays":"1","days":14}]'; }],
  ['taper stage with a negative step', (j) => { j.taper[0].stagesJson = '[{"everyNDays":-1,"days":14}]'; }],
  ['taper stage with no days', (j) => { j.taper[0].stagesJson = '[{"everyNDays":1,"days":0}]'; }],
  ['taper with too many stages', (j) => {
    j.taper[0].stagesJson = JSON.stringify(Array.from({ length: 201 }, () => ({ everyNDays: 1, days: 1 })));
  }],
  ['taper stage too long', (j) => { j.taper[0].stagesJson = '[{"everyNDays":1,"days":40000}]'; }],
  ['taper times a day over the ceiling', (j) => { j.taper[0].stagesJson = '[{"everyNDays":1,"timesPerDay":11,"days":3}]'; }],
  ['doses a day over the maximum', (j) => { j.doseSchedules[0].dosesPerDay = 25; }],
  ['doses a day fractional', (j) => { j.doseSchedules[0].dosesPerDay = 1.5; }],
  ['doses a day zero', (j) => { j.doseSchedules[0].dosesPerDay = 0; }],
  ['pitch track over the point limit', (j) => { j.voiceBenchmarks[0].pitchTrack = '100.0,'.repeat(4800) + '100.0'; }],
  ['pitch track a million points', (j) => { j.voiceBenchmarks[0].pitchTrack = ','.repeat(1_000_000); }],
  ['pitch track not a number', (j) => { j.voiceBenchmarks[0].pitchTrack = '178.5,abc'; }],
  ['pitch track Infinity', (j) => { j.voiceBenchmarks[0].pitchTrack = '178.5,Infinity'; }],
  ['pitch track exponent form', (j) => { j.voiceBenchmarks[0].pitchTrack = '178.5,1e999'; }],
  ['pitch track above the range', (j) => { j.voiceBenchmarks[0].pitchTrack = '178.5,9000.0'; }],
  ['pitch track below the range', (j) => { j.voiceBenchmarks[0].pitchTrack = '178.5,0.0'; }]
];
for (const mode of ['merge', 'replace'] as const) {
  for (const [name, mutate] of scalarDomainRefusals) {
    test(`${mode} refuses ${name} before any write`, async () => {
      const incoming = golden(); mutate(incoming);
      await refusesWithoutChanges(mode, incoming);
    });
  }

  test(`${mode} accepts the scalar-domain boundaries`, async () => {
    const incoming = golden();
    incoming.entries[0].epochDay = 0;
    incoming.entries[1].epochDay = todayEpochDay() + FUTURE_BOUND;
    incoming.doseSchedules[0].dosesPerDay = 24;
    incoming.taper[0].stagesJson = JSON.stringify(Array.from({ length: 200 }, (_, i) =>
      i === 0 ? { everyNDays: 0, days: 36525 - 199 } : { everyNDays: 1, timesPerDay: 10, days: 1 }));
    // What the editor has always let through: fractions.
    incoming.taper[1] = { ...incoming.taper[0], id: 'fractional-taper', stagesJson: '[{"everyNDays":1.5,"days":2.5}]' };
    incoming.voiceBenchmarks[0].pitchTrack = ['60.0', '500.0', '', '178.5'].join(',');
    const driver = await migratedDb();
    try {
      await restoreArchive(driver, fakeFileStore(), mode, { journal: incoming, files: (async function* () {})() });
      const restored = (await openJournal(driver, fakeFileStore()).archive.snapshot()).journal;
      assert.equal(restored.doseSchedules.find((row) => row.id === incoming.doseSchedules[0].id)?.dosesPerDay, 24);
      assert.equal(restored.voiceBenchmarks[0].pitchTrack, '60.0,500.0,,178.5');
    } finally {
      await driver.close();
    }
  });
}
