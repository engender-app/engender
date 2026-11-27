/* Sniff the PDF signature before image decoding (ADR-0065). Other files
   use the existing photo path, including its UnsupportedImageError for
   HEIC. DocumentRefusedError covers document-specific refusals.

   Check the bytes that will be stored: normalized images and untouched
   PDFs. Try rendering a PDF's first page for the thumbnail at import.
   Keep the original file and export it even if rendering the thumbnail
   fails; the document screen can explain the unavailable preview. */

import type { NormalizedPhoto } from '../journal/photos';
import { normalizePhoto, UnsupportedImageError } from '../photos/normalize';
import { isPdf } from './bytes';
import { DOCUMENT_SIZE_CEILING } from './limits';
import { renderPdfThumbnail } from './pdf';

/** A stored PDF: the bytes exactly as they arrived, and its first page as
    a thumbnail - or null where the renderer could not read the file. */
interface StoredPdf {
  pdfBytes: Uint8Array;
  thumb: Uint8Array | null;
}

/** What a document's own screen and `addDocument` (journal/documents.ts)
    both call this: the shape a document's stored content takes, before it
    has a row or a file name of its own. */
export type DocumentFile = NormalizedPhoto | StoredPdf;

export type DocumentRefusalKind = 'unsupported' | 'too-large' | 'too-many-pixels';

export class DocumentRefusedError extends Error {
  readonly kind: DocumentRefusalKind;

  constructor(kind: DocumentRefusalKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DocumentRefusedError';
    this.kind = kind;
  }
}

const TOO_LARGE_MESSAGE = `That file is too large to store. Up to ${DOCUMENT_SIZE_CEILING / (1024 * 1024)} MB.`;

const TOO_MANY_PIXELS_MESSAGE = 'That image has more pixels than this app will open.';

const UNSUPPORTED_MESSAGE = "This file isn't a PDF or an image this app can read. Try a PDF, a JPEG or a PNG.";

/** The too-large refusal on its own, for a caller that already knows the
    size is over the ceiling without a byte length to hand refuseAboveCeiling
    - Android's picker rejects a size queried from the content provider
    rather than a Uint8Array, so picker.ts's Android branches throw this
    directly once the native side has already refused the pick. */
export function refuseTooLarge(): never {
  throw new DocumentRefusedError('too-large', TOO_LARGE_MESSAGE);
}

/** Refuses a byte length over the document ceiling, the same refusal a
    document over size gets - shared with picker.ts so a picked file is
    refused by its size on disk before it is ever read, rather than only
    after its bytes have already reached the JS heap. */
export function refuseAboveCeiling(byteLength: number): void {
  if (byteLength > DOCUMENT_SIZE_CEILING) refuseTooLarge();
}

export async function acceptDocumentFile(bytes: Uint8Array): Promise<DocumentFile> {
  if (isPdf(bytes)) {
    // The ceiling first: a 40 MB scan is refused before a renderer is
    // ever loaded to draw a page nothing is going to keep.
    refuseAboveCeiling(bytes.byteLength);
    return { pdfBytes: bytes, thumb: await renderPdfThumbnail(bytes) };
  }

  let photo: NormalizedPhoto;
  try {
    photo = await normalizePhoto(bytes);
  } catch (error) {
    // HEIC keeps its own refusal and its own wording (ADR-0065's own
    // instruction) - only "not an image either" is new here.
    if (error instanceof UnsupportedImageError && error.kind === 'heic') throw error;
    // An image declaring more pixels than the budget (media/budget.ts) is
    // a different refusal from "not an image either": it is one, and the
    // person can fix it by choosing a smaller one.
    if (error instanceof UnsupportedImageError && error.kind === 'too-many-pixels') {
      throw new DocumentRefusedError('too-many-pixels', TOO_MANY_PIXELS_MESSAGE, { cause: error });
    }
    throw new DocumentRefusedError('unsupported', UNSUPPORTED_MESSAGE, { cause: error });
  }
  refuseAboveCeiling(photo.full.byteLength);
  return photo;
}
