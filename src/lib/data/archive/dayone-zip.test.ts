import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildZip } from './test-support/zip-builder.ts';
import { DayOneZipError, extractZipEntry, readZipEntries, type ZipEntry } from './dayone-zip.ts';

const enc = new TextEncoder();

test('a stored (uncompressed) entry round-trips byte for byte', async () => {
  const data = enc.encode('hello day one');
  const zip = buildZip([{ name: 'journal.json', data, method: 0 }]);

  const entries = readZipEntries(zip);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'journal.json');
  assert.deepEqual(await extractZipEntry(zip, entries[0]), data);
});

test('a deflated entry decompresses back to its original bytes', async () => {
  const data = enc.encode('x'.repeat(5000)); // compresses well, exercises real deflate
  const zip = buildZip([{ name: 'photos/big.jpg', data, method: 8 }]);

  const entries = readZipEntries(zip);
  assert.deepEqual(await extractZipEntry(zip, entries[0]), data);
});

test('multiple entries are read in the central directory\'s own order', async () => {
  const zip = buildZip([
    { name: 'journal.json', data: enc.encode('{}'), method: 0 },
    { name: 'photos/a.jpg', data: enc.encode('aaa'), method: 8 },
    { name: 'photos/b.jpg', data: enc.encode('bbb'), method: 0 }
  ]);

  const entries = readZipEntries(zip);
  assert.deepEqual(entries.map((e) => e.name), ['journal.json', 'photos/a.jpg', 'photos/b.jpg']);
  assert.deepEqual(await extractZipEntry(zip, entries[1]), enc.encode('aaa'));
  assert.deepEqual(await extractZipEntry(zip, entries[2]), enc.encode('bbb'));
});

test('a file with no end-of-central-directory record is refused by name', () => {
  assert.throws(() => readZipEntries(enc.encode('not a zip at all')), DayOneZipError);
  assert.throws(() => readZipEntries(enc.encode('not a zip at all')), /end-of-central-directory/);
});

test('an unsupported compression method is refused by name', async () => {
  const zip = buildZip([{ name: 'journal.json', data: enc.encode('{}'), method: 0 }]);
  const [entry] = readZipEntries(zip);
  const bzip2: ZipEntry = { ...entry, method: 12 };
  await assert.rejects(extractZipEntry(zip, bzip2), /unsupported compression method/);
});
