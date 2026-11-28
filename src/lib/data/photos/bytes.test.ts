import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isHeic } from './bytes.ts';
import { ascii, jpegWith, metadataMarkers, segmentBody } from './test-support/jpeg-metadata.ts';

const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 0x18, ...ascii('ftyp'), ...ascii(brand)]);

test('every HEIC brand a phone camera writes is recognised', () => {
  // The brand sits at offset 8, inside the ftyp box - not at the start of
  // the file, which is where the box length is.
  for (const brand of ['heic', 'heix', 'hevc', 'heim', 'mif1', 'msf1']) {
    assert.equal(isHeic(ftyp(brand)), true, brand);
  }
});

test('an MP4 shares the ftyp box but is not a HEIC', () => {
  assert.equal(isHeic(ftyp('isom')), false);
});

test('formats the decoder handles are not turned away here', () => {
  // Left for createImageBitmap() rather than whitelisted: rejecting these
  // would refuse photos Chromium renders perfectly well.
  const avif = ftyp('avif');
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const bytes of [avif, jpeg, png]) assert.equal(isHeic(bytes), false);
});

test('junk and truncated buffers are not mistaken for HEIC', () => {
  assert.equal(isHeic(new Uint8Array()), false);
  assert.equal(isHeic(new Uint8Array([0xff])), false);
  assert.equal(isHeic(ascii('not an image at all')), false);
  assert.equal(isHeic(ascii('ftyp')), false, 'the brand is past the end');
});

/* The metadata reader checks what normalization removes from canvas output. These
   tests exercise the reader on built JPEGs. */

test('reports EXIF, XMP and comment segments by name', () => {
  const jpeg = jpegWith([
    { marker: 0xe1, body: new Uint8Array([...ascii('Exif'), 0x00, 0x00, 0x2a, 0x2a]) },
    { marker: 0xe1, body: ascii('http://ns.adobe.com/xap/1.0/\0') },
    { marker: 0xed, body: ascii('Photoshop 3.0\0') },
    { marker: 0xfe, body: ascii('a comment') }
  ]);
  assert.deepEqual(metadataMarkers(jpeg), [
    'APP1/Exif',
    'APP1/http://ns.adobe.com/xap/1.0/',
    'APP13/Photoshop 3.0',
    'COM'
  ]);
});

test('a JFIF header alone is not metadata', () => {
  const jpeg = jpegWith([{ marker: 0xe0, body: ascii('JFIF\0') }]);
  assert.deepEqual(metadataMarkers(jpeg), []);
});

test('stops at the compressed data instead of reading it as segments', () => {
  // 0xffe1 appearing inside entropy-coded data must not read as an APP1.
  const jpeg = new Uint8Array([...jpegWith([]), 0xff, 0xe1, 0x00, 0x08, ...ascii('Exif')]);
  assert.deepEqual(metadataMarkers(jpeg), []);
});

test('a segment body reads back, so a test can tell two profiles apart', () => {
  const jpeg = jpegWith([{ marker: 0xe2, body: ascii('ICC_PROFILE\0made up') }]);
  assert.deepEqual(segmentBody(jpeg, 'APP2/ICC_PROFILE'), ascii('ICC_PROFILE\0made up'));
  assert.equal(segmentBody(jpeg, 'APP1/Exif'), null);
});
