import { expect, test } from 'vitest';
import { DaylioCsvError } from '../../src/lib/data/archive/daylio.ts';
import { guardPrototype, runDetection, runOn } from './fuzz-cases.ts';

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
