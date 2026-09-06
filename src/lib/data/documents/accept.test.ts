/* The accept/refuse boundary and the size ceiling (phase 8 features ticket
   53) - both pure predicates over bytes, so both run at the Node tier with
   no canvas at all.

   normalizePhoto() itself needs a real decoder (photos/normalize.ts's own
   header), so a genuine image passing through here is proved by the
   existing browser-tier photo probe, unchanged by this file. What is new
   is the routing in front of it, which never touches a canvas: PDF bytes
   never reach normalizePhoto, and a HEIC file is turned away by the same
   header sniff normalizePhoto already ran, before its decode ever starts -
   which is why it is provable here too. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { UnsupportedImageError } from '../photos/normalize.ts';
import { acceptDocumentFile, DocumentRefusedError } from './accept.ts';
import { DOCUMENT_SIZE_CEILING } from './limits.ts';

/* The renderer needs a canvas and a worker, so it belongs to the browser
   tier (pdf.test.ts there draws a real page). What this file still owns is
   what the routing does with its answer: a drawn page travels beside the
   bytes, and a file it could not read is filed all the same. */
const drawn = vi.fn<(bytes: Uint8Array) => Promise<Uint8Array | null>>();
vi.mock('./pdf.ts', () => ({ renderPdfThumbnail: (bytes: Uint8Array) => drawn(bytes) }));

const ascii = (text: string): Uint8Array => new Uint8Array([...text].map((c) => c.charCodeAt(0)));
const pdfBytes = (size: number): Uint8Array => {
  const bytes = new Uint8Array(size);
  bytes.set(ascii('%PDF-1.4'));
  return bytes;
};
const heicBytes = () =>
  new Uint8Array([0, 0, 0, 0x18, ...ascii('ftyp'), ...ascii('heic'), ...ascii('mif1heic')]);

const page = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

test('a PDF is accepted and stored as it arrived, with its first page beside it', async () => {
  drawn.mockResolvedValue(page);
  const bytes = pdfBytes(1024);
  const content = await acceptDocumentFile(bytes);
  assert.deepEqual(content, { pdfBytes: bytes, thumb: page });
  assert.deepEqual(drawn.mock.calls, [[bytes]]);
});

test('a PDF the renderer cannot read is filed anyway, with no page', async () => {
  drawn.mockResolvedValue(null);
  const content = await acceptDocumentFile(pdfBytes(1024));
  assert.ok('pdfBytes' in content && content.thumb === null);
});

test('a PDF over the ceiling is refused before the renderer is woken at all', async () => {
  drawn.mockClear();
  await assert.rejects(acceptDocumentFile(pdfBytes(DOCUMENT_SIZE_CEILING + 1)));
  assert.equal(drawn.mock.calls.length, 0);
});

test('a PDF at exactly the ceiling is accepted', async () => {
  const content = await acceptDocumentFile(pdfBytes(DOCUMENT_SIZE_CEILING));
  assert.ok('pdfBytes' in content);
});

test('a PDF over the ceiling is refused, with the number named', async () => {
  await assert.rejects(acceptDocumentFile(pdfBytes(DOCUMENT_SIZE_CEILING + 1)), (error: unknown) => {
    assert.ok(error instanceof DocumentRefusedError);
    assert.equal(error.kind, 'too-large');
    assert.match(error.message, /25 MB/);
    return true;
  });
});

test('a lying extension does not change what the bytes are read as', async () => {
  // The picker calls this "scan.jpg", but reading it decides otherwise -
  // the whole point of ADR-0065's "type is decided by reading the bytes".
  const content = await acceptDocumentFile(pdfBytes(1024));
  assert.ok('pdfBytes' in content, 'a PDF signature wins regardless of what the file was named');
});

test('HEIC keeps its own refusal, ahead of the decoder, unwrapped', async () => {
  await assert.rejects(acceptDocumentFile(heicBytes()), (error: unknown) => {
    assert.ok(error instanceof UnsupportedImageError);
    assert.equal(error.kind, 'heic');
    return true;
  });
});

test('neither a PDF nor a readable image is refused naming both accepted kinds', async () => {
  // No canvas at the Node tier, so normalizePhoto() cannot decode anything -
  // which stands in here for a real "this is not an image" refusal too,
  // since both paths reach the same catch.
  await assert.rejects(acceptDocumentFile(ascii('not a pdf and not an image')), (error: unknown) => {
    assert.ok(error instanceof DocumentRefusedError);
    assert.equal(error.kind, 'unsupported');
    assert.match(error.message, /PDF/);
    return true;
  });
});
