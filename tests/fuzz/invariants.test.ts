import { expect, test, vi } from 'vitest';
import { DaylioCsvError } from '../../src/lib/data/archive/daylio.ts';
import { freshDevice, fingerprint, guardPrototype, runDetection, runOn } from './fuzz-cases.ts';
import * as databaseFixture from '../../src/lib/data/sqlite/test-support/migrated-db.ts';
import { fakeFileStore } from '../../src/lib/data/photos/test-support/fake-file-store.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { seedCompleteArchiveJournal } from '../../src/lib/data/journal/test-support/complete-archive-journal.ts';
import { bytes } from '../../src/lib/data/journal/golden-archive-fixture.ts';

test('a typed refusal cannot hide a write with unchanged row counts', async () => {
  const result = await runOn(async ({ raw }) => {
    raw.exec("UPDATE entry SET note = 'planted partial write'");
    throw new DaylioCsvError('planted refusal');
  });
  expect(result.kind).toBe('state-changed');
});

test('a typed refusal cannot hide changed existing file bytes', async () => {
  const result = await runOn(async ({ files }) => {
    await files.write(files.names()[0], new Uint8Array([9, 8, 7]));
    throw new DaylioCsvError('planted refusal');
  });
  expect(result.kind).toBe('state-changed');
  expect(result.sig).toBe('file content changed after refusal');
});

test('the sweep reclaims a file written before a refused transaction', async () => {
  const result = await runOn(async ({ files }) => {
    await files.write('unowned.jpg', new Uint8Array([1]));
    throw new DaylioCsvError('planted refusal');
  });
  expect(result.kind).toBe('typed');
});

test('a refusal cannot hide existing file damage during the orphan sweep', async () => {
  const result = await runOn(async ({ files }) => {
    const existing = files.names()[0];
    const remove = files.remove;
    await files.write('unowned.jpg', new Uint8Array([1]));
    files.remove = async (name) => {
      await remove(name);
      await files.write(existing, new Uint8Array([9, 8, 7]));
    };
    throw new DaylioCsvError('planted refusal');
  });
  expect(result.kind).toBe('state-changed');
  expect(result.sig).toBe('file content changed after refusal');
});

test.each(['refused', 'accepted'])('an orphan surviving the sweep fails a %s case', async (mode) => {
  const result = await runOn(async ({ files }) => {
    await files.write('unowned.jpg', new Uint8Array([1]));
    files.remove = async () => {};
    if (mode === 'refused') throw new DaylioCsvError('planted refusal');
  });
  expect(result.kind).toBe('orphans-survive-sweep');
});

test('an accepted row with an unreadable affirmation identity fails', async () => {
  const result = await runOn(async ({ raw }) => {
    raw.exec('UPDATE affirmation SET uuid = NULL WHERE key IS NULL');
  });
  expect(result.kind).toBe('unreadable-after-import');
});

test('an accepted import with a broken foreign key fails', async () => {
  const result = await runOn(async ({ raw }) => {
    raw.exec('PRAGMA foreign_keys = OFF');
    raw.exec('UPDATE photo SET entry_id = 999999 WHERE entry_id IS NOT NULL');
  });
  expect(result.kind).toBe('invariant');
});

test('a throwing sniffer is a defect rather than an untyped refusal', async () => {
  const result = await runDetection(() => { throw new Error('planted sniffer throw'); });
  expect(result.kind).toBe('detect-threw');
});

test('prototype guards include non-enumerable sniffer pollution and restore it', async () => {
  const key = Symbol('planted pollution');
  const result = await guardPrototype(() => runDetection(() => {
    Object.defineProperty(Object.prototype, key, { value: 42, configurable: true });
  }));
  expect(result.kind).toBe('prototype-polluted');
  expect(Object.hasOwn(Object.prototype, key)).toBe(false);
});


test('fresh cached seeds match original rows and files and stay isolated', async () => {
  let id = 0;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() =>
    `00000000-0000-4000-8000-${(++id).toString(16).padStart(12, '0')}`);
  const devices: Awaited<ReturnType<typeof freshDevice>>[] = [];
  try {
    const db = await databaseFixture.migratedDb();
    const files = fakeFileStore();
    const journal = openJournal(db, files);
    const original = { driver: db, raw: db.raw, journal, files };
    devices.push(original);
    await seedCompleteArchiveJournal(db, journal, bytes);
    const before = await fingerprint(original);
    for (let i = 0; i < 2; i++) {
      id = 0;
      const cached = await freshDevice();
      devices.push(cached);
      expect(cached.raw.prepare).toBe(db.raw.prepare);
      expect(await fingerprint(cached)).toEqual(before);
      expect(cached.driver.getUserVersion()).toBe(db.getUserVersion());
      cached.raw.exec("UPDATE entry SET note = 'changed cached seed'");
      await cached.files.write(cached.files.names()[0], new Uint8Array([9]));
      expect(await fingerprint(original)).toEqual(before);
    }
  } finally {
    for (const d of devices) await d.driver.close();
    clock.mockRestore();
    uuid.mockRestore();
  }
});

test('a seed failure restores the connection prepare function', async () => {
  const db = await databaseFixture.migratedDb();
  const original = db.raw.prepare;
  const failure = new Error('planted seed preparation failure');
  const prepare = () => { throw failure; };
  db.raw.prepare = prepare;
  const fixture = vi.spyOn(databaseFixture, 'migratedDb').mockResolvedValue(db);
  try {
    await expect(freshDevice()).rejects.toBe(failure);
    expect(db.raw.prepare).toBe(prepare);
  } finally {
    fixture.mockRestore();
    db.raw.prepare = original;
    await db.close();
  }
});
