import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isPdf } from './bytes.ts';

const ascii = (text: string): Uint8Array => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

test('a real PDF header is recognised', () => {
  assert.equal(isPdf(ascii('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n1 0 obj')), true);
});

test('a lying extension does not change what the bytes are', () => {
  // The whole point of reading bytes rather than a name: a file called
  // scan.jpg with a PDF's own signature is a PDF.
  const bytes = ascii('%PDF-1.4\n...');
  assert.equal(isPdf(bytes), true, 'the caller\'s claimed name never enters this function at all');
});

test('an image is not a PDF', () => {
  assert.equal(isPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), false);
  assert.equal(isPdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), false);
});

test('junk and truncated buffers are not mistaken for a PDF', () => {
  assert.equal(isPdf(new Uint8Array()), false);
  assert.equal(isPdf(new Uint8Array([0x25])), false);
  assert.equal(isPdf(ascii('not a pdf at all')), false);
});

test('the signature has to be at the very start, not merely present', () => {
  assert.equal(isPdf(ascii('junk before it %PDF-1.4')), false);
});
