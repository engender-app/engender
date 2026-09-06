/* Choosing a photo to add.

   One seam, two platforms. On the web this is a file input; on Android it
   is Capacitor's photo picker, which hands back the one photo the user
   chose without ever asking for the read-the-whole-gallery permission
   (ticket 11). The Android half lands with the shell - what matters now is
   that the call sites above never learn which one they got.

   Bytes, not File objects or URIs: a File is a web type and a content://
   URI is an Android one, and normalize() takes neither. On Android the
   bytes arrive in two steps - the pick answers with a token and the bytes
   follow over the pick channel - and that is internal to this module too:
   a token is an Android type as much as a content:// URI is. */

import { chooseFiles } from '../fileDialog';
import { isAndroid } from '../../platform';
import { androidPhotos } from './android-bridge';
import { readPickedOverChannel } from './android-pick-channel';
import { refuseAboveCeiling, refuseTooLarge } from '../documents/accept';

interface PhotoPicker {
  /** The bytes of everything the user chose, or an empty array if they
      backed out. Cancelling is an ordinary outcome, not an error. */
  pick(): Promise<Uint8Array[]>;
}

// The fallback transport's own decode: a bridge response crosses as JSON,
// so on a WebView too old for the pick channel a picked file is still a
// base64 string and this is still what it costs (phase 9 audit ticket 06).
function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** The floor's transport, a piece at a time (phase 9 audit ticket 14). A
    plugin response is one JSON string by construction, so asking for a
    whole 25 MB scan meant native building a 34 MB String for it - one
    allocation the heap can simply refuse, which is how a pick at the
    ceiling used to fail on a WebView too old for the channel. Native walks
    the file instead and says `done` on the last piece.

    Each piece is decoded on its own rather than the strings joined first.
    Joining would work - the native chunk is a multiple of three, so no
    piece carries padding - but it would put the whole encoding back in one
    string, which is the allocation this exists to avoid.

    The pieces are still joined at the end, because every caller wants one
    array. That copy is the peak here: the pieces and the joined array are
    both live for it, against the base64 string, atob's intermediate binary
    string and the array all being live at once before. */
async function pickedBytesInChunks(token: string): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;

  for (;;) {
    const { base64, done } = await androidPhotos.readPickedChunk({ token });
    const chunk = base64ToBytes(base64);
    chunks.push(chunk);
    length += chunk.length;
    if (done) break;
  }

  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

/** The bytes of one file an Android pick handed back a token for.

    Two transports, chosen the same way android-file-store.ts chooses one
    for a write: the message channel when the WebView can carry a
    structured clone, the chunked base64 bridge call when it cannot
    (android-pick-channel.ts returns null to say so). The fast path is the
    default and the slow one is the floor's - a 25 MB scan measured 1054ms
    of blocked main thread through base64 against 4ms through a typed
    decode, and held three copies of itself live while it did it.

    Exported because the OCR lab picks an image through the same bridge
    without going through the pickers below (labs/ocr-adapters.ts), and
    one place deciding which transport a token is read over is the point. */
export async function androidPickedBytes(token: string): Promise<Uint8Array> {
  const viaChannel = readPickedOverChannel(token);
  if (viaChannel) return viaChannel;
  return pickedBytesInChunks(token);
}

/** Runs an Android bridge pick, turning the native side's own too-large
    refusal into the same DocumentRefusedError the web ceiling check throws
    - PhotosPlugin.java queries the content provider's declared size and
    rejects before it ever opens the file, the same "before it is read" this
    ceiling means on the web. Anything else the bridge rejects with is
    rethrown unchanged. */
async function pickOnAndroid<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof Error && error.message.includes('too-large')) refuseTooLarge();
    throw error;
  }
}

/** The single-file half of documentPicker() and cameraPhotoPicker() on the
    web: open the same file input, refuse by size before reading, read if
    not. `chooseFiles`'s own arguments are the only difference between the
    two callers. */
async function pickOneFile(...args: Parameters<typeof chooseFiles>): Promise<Uint8Array[]> {
  const [file] = await chooseFiles(...args);
  if (!file) return [];
  refuseAboveCeiling(file.size);
  return [new Uint8Array(await file.arrayBuffer())];
}

export function filePhotoPicker(): PhotoPicker {
  return {
    async pick() {
      if (isAndroid()) {
        const { tokens } = await pickOnAndroid(() => androidPhotos.pickImages());
        // One at a time rather than all at once: a multi-pick can be
        // several files at the ceiling, and fetching them concurrently
        // would hold every one of them in the heap together. The fallback
        // transport needs it too now - PickedFiles keeps one chunked read
        // open at a time, so a second token's first chunk ends the first
        // file's read wherever it had got to (phase 9 audit ticket 14).
        const picked: Uint8Array[] = [];
        for (const token of tokens) picked.push(await androidPickedBytes(token));
        return picked;
      }

      // Whatever the OS decides matches "image/*", HEIC included: the bytes
      // still go through normalize(). An entry holds several photos, so one
      // trip through the dialog can bring back several.
      const files = await chooseFiles('image/*', { multiple: true });
      // Every file's size is checked before any of them is read, so one
      // oversized photo in a multi-pick refuses the batch before the others
      // are read too - not partway through it.
      for (const file of files) refuseAboveCeiling(file.size);
      return Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())));
    }
  };
}

/** A document to file, one at a time - PDF or image (ticket 54). Same split
    as filePhotoPicker(): Capacitor's native `ACTION_OPEN_DOCUMENT` pick on
    Android, so a document never takes the WebView file input's crash path
    (ticket 66); the same web file input elsewhere. Bytes only, same as
    every other picker here - accept.ts is what tells a PDF from an image. */
export function documentPicker(): PhotoPicker {
  return {
    async pick() {
      if (isAndroid()) {
        const { token } = await pickOnAndroid(() => androidPhotos.pickDocument());
        return token ? [await androidPickedBytes(token)] : [];
      }

      return pickOneFile('application/pdf,image/*');
    }
  };
}

/** Bytes straight from the device camera rather than the gallery, one shot
    at a time. Same PhotoPicker shape as above, so photoPicking.ts's
    normalize step doesn't need to know which one supplied the bytes.

    On Android this is android-bridge.ts's captureImage(), which opens the
    camera app through an implicit intent with no output URI - nothing is
    ever written to MediaStore, so there is no gallery write to undo. On the
    web, the file input's `capture` hint opens the device camera instead of
    the usual chooser (ticket 12). */
export function cameraPhotoPicker(): PhotoPicker {
  return {
    async pick() {
      if (isAndroid()) {
        const { token } = await androidPhotos.captureImage();
        return token ? [await androidPickedBytes(token)] : [];
      }

      return pickOneFile('image/*', { capture: 'environment' });
    }
  };
}
