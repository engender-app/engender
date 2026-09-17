/* zipReader.ts's own tests (phase 8 audit ticket 11).

   fflate allocates its output buffer from the central directory's declared
   uncompressed size before it decompresses anything (`new u8(su)` in
   unzipSync), so a member never has to be a real bomb to force a huge
   synchronous allocation - a forged central directory entry does it with a
   handful of real bytes on disk. `declaring` below builds exactly that: a
   real, tiny deflate member whose declared uncompressed size is patched
   after the fact. The ceiling has to refuse it from inside the filter,
   before fflate ever calls `new u8(...)` on the forged number - that is
   the property every test here is checking. */

import assert from 'node:assert/strict';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { test } from 'vitest';
import { openZip, ZipTooLargeError } from './zipReader.ts';

/** A real one-member deflate zip whose central directory is then patched to
    declare `declaredSize` bytes of uncompressed content - far more than the
    handful of real bytes on disk. Central directory layout (zh() in
    fflate): signature 'PK\x01\x02', then uncompressed size at offset+24
    from the signature. Only that field is patched; the real compressed
    size at offset+20 is left alone, so fflate still reads the true (short)
    byte range for decompression and only over-allocates its *output*
    buffer from the forged number - which is exactly the shape of the real
    attack the ticket describes. */
function declaring(name: string, content: string, declaredSize: number): Uint8Array {
  const real = zipSync({ [name]: [strToU8(content), { level: 6 }] });
  const forged = real.slice();
  const signature = [0x50, 0x4b, 0x01, 0x02];
  for (let i = 0; i + 4 <= forged.length; i++) {
    if (signature.every((byte, j) => forged[i + j] === byte)) {
      const view = new DataView(forged.buffer, forged.byteOffset + i + 24, 4);
      view.setUint32(0, declaredSize, true);
      return forged;
    }
  }
  throw new Error('test fixture: no central directory record found');
}

test('a member declaring an enormous uncompressed size is refused, not allocated', () => {
  // Comfortably past any real ceiling and past what a genuine decompress of
  // a few bytes could ever produce - the 200-byte-zip-claims-4GiB shape the
  // ticket names.
  const bytes = declaring('huge.json', 'not actually huge', 4_000_000_000);
  const reader = openZip(bytes, 1_000_000);
  assert.throws(() => reader.read('huge.json'), ZipTooLargeError);
});

test('a member under the ceiling still reads normally', () => {
  const bytes = declaring('fine.json', 'small enough', 100);
  const reader = openZip(bytes, 1_000_000);
  const read = reader.read('fine.json');
  assert.equal(new TextDecoder().decode(read!), 'small enough');
});

test('members individually under the ceiling are refused once their running total crosses it', () => {
  const bytes = zipSync({
    'a.json': [strToU8('a'.repeat(200)), { level: 0 }],
    'b.json': [strToU8('b'.repeat(200)), { level: 0 }],
    'c.json': [strToU8('c'.repeat(200)), { level: 0 }]
  });
  const reader = openZip(bytes, 500);

  assert.equal(reader.read('a.json')!.length, 200);
  assert.equal(reader.read('b.json')!.length, 200);
  // 200 + 200 + 200 = 600 > 500: the third member is individually tiny and
  // well under the ceiling on its own, so this only fails on the running
  // total.
  assert.throws(() => reader.read('c.json'), ZipTooLargeError);
});

test('names() walks the central directory without decompressing anything, whatever a member declares', () => {
  const bytes = declaring('huge.json', 'not actually huge', 4_000_000_000);
  const reader = openZip(bytes, 1_000_000);
  assert.deepEqual(reader.names(), ['huge.json']);
});

test('read() of a name the zip does not carry is null, not a refusal', () => {
  const bytes = zipSync({ 'a.json': [strToU8('a'), { level: 0 }] });
  const reader = openZip(bytes, 1_000_000);
  assert.equal(reader.read('missing.json'), null);
});

test('reading the same member twice bills the running total once, not twice', () => {
  // The real shape this guards: daylioBackup.ts's preview sniffs an
  // asset's bytes once (to pick an extension), and a later commit reads
  // the same asset again to write it - through the same reader, since the
  // preview's own closures are what the commit calls. A ceiling that
  // billed both reads would refuse a backup for double what it actually
  // holds.
  const bytes = zipSync({
    'a.json': [strToU8('a'.repeat(200)), { level: 0 }],
    'b.json': [strToU8('b'.repeat(200)), { level: 0 }]
  });
  const reader = openZip(bytes, 500);

  const first = reader.read('a.json')!;
  assert.equal(first.length, 200);
  // Would be 200 + 200 + 200 = 600 > 500 if the first member were billed
  // again here - it must not be, so the real total (200 + 200 = 400)
  // stays under the ceiling.
  assert.strictEqual(reader.read('a.json'), first);
  assert.equal(reader.read('b.json')!.length, 200);
});

/** Rename b.txt in both ZIP headers; zipSync's object input cannot encode duplicates. */
function duplicateMembers(): Uint8Array {
  const bytes = zipSync({
    'a.txt': [strToU8('aaaaaaaa'), { level: 6 }],
    'b.txt': [strToU8('bbbbbbbb'), { level: 6 }],
    'c.txt': [strToU8('c'), { level: 6 }]
  });
  for (let i = 0; i + 46 < bytes.length; i++) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + i);
    const signature = view.getUint32(0, true);
    const nameOffset = signature === 0x04034b50 ? 30 : signature === 0x02014b50 ? 46 : 0;
    if (nameOffset && bytes[i + nameOffset] === 0x62) bytes[i + nameOffset] = 0x61;
  }
  return bytes;
}

test('two duplicate eight-byte members are rejected before any read under a ten-byte ceiling', () => {
  assert.throws(() => openZip(duplicateMembers(), 10), /duplicate ZIP member name/);
});

for (const requestedName of ['a.txt', 'c.txt', 'missing.txt']) {
  test(`duplicates reject reads starting with ${requestedName}, even above their total size`, () => {
    assert.throws(() => openZip(duplicateMembers(), 100).read(requestedName), /duplicate ZIP member name/);
  });
}

test('duplicate validation precedes decompression of either duplicate payload', () => {
  const bytes = duplicateMembers();
  // Unsupported compression would throw if either duplicate reached decompression.
  for (let i = 0; i + 46 < bytes.length; i++) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + i);
    if (view.getUint32(0, true) === 0x02014b50 && bytes[i + 46] === 0x61) {
      view.setUint16(10, 99, true);
    }
  }
  assert.throws(() => unzipSync(bytes), /unknown compression type/);
  assert.throws(() => openZip(bytes, 100), /duplicate ZIP member name/);
});

test('many distinct members exhaust the shared budget without charging cached reads again', () => {
  const bytes = zipSync(Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [`${i}.txt`, strToU8('12345678')])
  ));
  const reader = openZip(bytes, 10 * 8);
  assert.equal(reader.names().length, 100);
  for (let i = 0; i < 10; i++) {
    const first = reader.read(`${i}.txt`)!;
    assert.equal(first.length, 8);
    assert.strictEqual(reader.read(`${i}.txt`), first);
  }
  assert.throws(() => reader.read('10.txt'), ZipTooLargeError);
  assert.throws(() => reader.read('99.txt'), ZipTooLargeError);
});
