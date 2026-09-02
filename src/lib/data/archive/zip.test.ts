/* What the zip reader accepts, what it refuses, and what it produces
   (phase 7 ticket 09). The cases here are the ones a `.daylio` actually
   presents: entry names carrying a leading slash, deflated members beside
   stored ones, and a file that is not a zip at all. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { makeZip } from './test-support/zip.ts';
import { NotAZipError, openZip } from './zip.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (raw: Uint8Array) => new TextDecoder().decode(raw);

/** Where the central directory begins in a `makeZip` archive holding one
    entry: its local header, name and data, and nothing else before it. */
const directoryAt = (name: string, data: string) => 30 + name.length + data.length;

test('a stored entry and a deflated entry read back identically', async () => {
  // Long enough that deflate actually compresses it, so the inflate half is
  // doing work rather than passing a short literal block through.
  const long = 'the same sentence over and over. '.repeat(40);
  const zip = await openZip(
    await makeZip([
      { name: 'stored.txt', bytes: bytes(long) },
      { name: 'deflated.txt', bytes: bytes(long), deflate: true }
    ])
  );

  assert.deepEqual(zip.names(), ['stored.txt', 'deflated.txt']);
  assert.equal(text((await zip.read('stored.txt'))!), long);
  assert.equal(text((await zip.read('deflated.txt'))!), long);
});

test('a leading slash is normalised away, the form Daylio writes', async () => {
  const zip = await openZip(
    await makeZip([
      { name: 'backup.daylio', bytes: bytes('payload') },
      { name: '/assets/photos/2026/9/abc', bytes: bytes('photo bytes') }
    ])
  );

  assert.deepEqual(zip.names(), ['backup.daylio', 'assets/photos/2026/9/abc']);
  assert.equal(text((await zip.read('assets/photos/2026/9/abc'))!), 'photo bytes');
  // The name as written is not a second way in: one entry, one name.
  assert.equal(await zip.read('/assets/photos/2026/9/abc'), null);
});

test('a missing entry reads as null rather than throwing', async () => {
  const zip = await openZip(await makeZip([{ name: 'backup.daylio', bytes: bytes('payload') }]));
  assert.equal(await zip.read('assets/photos/2026/9/nothing-here'), null);
});

test('an empty zip opens with no entries', async () => {
  const zip = await openZip(await makeZip([]));
  assert.deepEqual(zip.names(), []);
});

test('a file that is not a zip is refused by name', async () => {
  await assert.rejects(() => openZip(bytes('full_date,time,mood\n2026-09-01,10:00,good')), NotAZipError);
  await assert.rejects(() => openZip(new Uint8Array(0)), NotAZipError);
});

test('a zip missing its end record is refused rather than read as far as it goes', async () => {
  const whole = await makeZip([{ name: 'backup.daylio', bytes: bytes('payload') }]);
  await assert.rejects(() => openZip(whole.slice(0, whole.length - 8)), NotAZipError);
});

test('an entry the directory points at the wrong place is refused by name', async () => {
  const whole = await makeZip([{ name: 'backup.daylio', bytes: bytes('payload') }]);
  const view = new DataView(whole.buffer);
  // The local header's own signature, corrupted: the directory still says
  // the entry begins here, and it no longer does.
  view.setUint32(0, 0x01020304, true);

  const zip = await openZip(whole);
  await assert.rejects(() => zip.read('backup.daylio'), NotAZipError);
});

test('an entry the directory points past the end of the file is refused by name', async () => {
  const whole = await makeZip([{ name: 'backup.daylio', bytes: bytes('payload') }]);
  const view = new DataView(whole.buffer);
  view.setUint32(directoryAt('backup.daylio', 'payload') + 42, 0xfffffff0, true);

  const zip = await openZip(whole);
  await assert.rejects(() => zip.read('backup.daylio'), NotAZipError);
});

test('an unsupported compression method is refused by name, not silently skipped', async () => {
  const whole = await makeZip([{ name: 'backup.daylio', bytes: bytes('payload') }]);
  const view = new DataView(whole.buffer);
  // Method 14 (LZMA), in the central directory the reader trusts.
  view.setUint16(directoryAt('backup.daylio', 'payload') + 10, 14, true);

  const zip = await openZip(whole);
  await assert.rejects(() => zip.read('backup.daylio'), NotAZipError);
});
