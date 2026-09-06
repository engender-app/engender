/* Deciding what a picked file is, and refusing what it isn't (phase 8
   features ticket 53, ADR-0065).

   PDF's signature is checked first, ahead of the image decoder: trying to
   decode a PDF as an image would otherwise reach the same "unreadable"
   refusal an unrecognised file gets, for the wrong reason, and the
   decoder is real work a file already identified has no need of. Anything
   that isn't a PDF goes through the existing photo path unchanged - HEIC
   refused ahead of its own decoder (photos/normalize.ts) exactly as it
   already was, because this widens what a document accepts, not what an
   image is. `DocumentRefusedError` only speaks for the two refusals that
   are new here; a HEIC file keeps raising `UnsupportedImageError`, which
   already carries the wording a document's own picker shows for it.

   The size ceiling is checked against what will actually be stored: the
   normalised bytes for an image (photos/normalize.ts already shrinks
   before this ever runs), the untouched bytes for a PDF (there is no
   normalisation path for one - ADR-0065).

   A PDF's first page is drawn here too (ticket 55), for the same reason
   an image is normalised here: this is the one place a picked file is
   turned into the pair of things a document is stored as, and the
   thumbnail is the half a screen can show immediately. It is the only
   moment the renderer is woken by anything but somebody opening a
   document. Failing to draw it is not a refusal - the file is still
   filed, still exported, and its own screen says it has no page to
   show. */

import type { NormalizedPhoto } from '../journal/photos';
import { normalizePhoto, UnsupportedImageError } from '../photos/normalize';
import { isPdf } from './bytes';
import { DOCUMENT_SIZE_CEILING } from './limits';
import { renderPdfThumbnail } from './pdf';

/** A stored PDF: the bytes exactly as they arrived, and its first page as
    a thumbnail - or null where the renderer could not read the file. */
export interface StoredPdf {
  pdfBytes: Uint8Array;
  thumb: Uint8Array | null;
}

/** What a document's own screen and `addDocument` (journal/documents.ts)
    both call this: the shape a document's stored content takes, before it
    has a row or a file name of its own. */
export type DocumentFile = NormalizedPhoto | StoredPdf;

export type DocumentRefusalKind = 'unsupported' | 'too-large';

export class DocumentRefusedError extends Error {
  readonly kind: DocumentRefusalKind;

  constructor(kind: DocumentRefusalKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DocumentRefusedError';
    this.kind = kind;
  }
}

const TOO_LARGE_MESSAGE = `This file is too large to store. Up to ${DOCUMENT_SIZE_CEILING / (1024 * 1024)} MB.`;

const UNSUPPORTED_MESSAGE = "This file isn't a PDF or an image this app can read. Try a PDF, a JPEG or a PNG.";

function refuseAboveCeiling(byteLength: number): void {
  if (byteLength > DOCUMENT_SIZE_CEILING) throw new DocumentRefusedError('too-large', TOO_LARGE_MESSAGE);
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
    throw new DocumentRefusedError('unsupported', UNSUPPORTED_MESSAGE, { cause: error });
  }
  refuseAboveCeiling(photo.full.byteLength);
  return photo;
}
