/* The JS side of the fast pick path (phase 9 audit ticket 06): the same
   `WebViewCompat.addWebMessageListener` mechanism android-write-channel.ts
   uses for writes, run in the other direction so a picked file's bytes
   arrive as a structured-clone ArrayBuffer instead of a base64 string
   (PhotoPickChannel.java has the other half and the full protocol).

   Why it matters here and not for a photo: a document is stored exactly as
   it arrived - there is no normalisation path for a PDF (ADR-0065) - so the
   25 MB ceiling is a size scans really reach. Over 25 MB the base64 round
   trip cost 1054ms of blocked main thread on a desktop against 4ms for a
   typed decode, and held the base64 string, atob's intermediate binary
   string and the final array live at once.

   **The other shape, and why not.** The alternative was to have native put
   the picked file into the app-private directory and hand JavaScript a file
   name, so the bytes never enter the JS heap at all - fetched afterwards
   over Capacitor's local server, the way android-file-store.ts already
   reads photos. It loses on two counts. Files at rest here are encrypted
   per-file in JavaScript (encrypted-file-store.ts, ADR-0018/ADR-0020), so a
   name would mean writing a picked file to disk in plaintext and deleting
   it after - a scan of medical paperwork readable on disk for as long as
   the encrypt takes, and past a crash. And the callers need the bytes
   regardless: `acceptDocumentFile` sniffs the PDF signature and
   `normalizePhoto` re-encodes, so a name would be read straight back into
   the heap anyway, for two disk trips instead of none. Its one real
   advantage - working at the WebView floor, where this channel does not -
   is the cost recorded below.

   **What that cost is.** `WEB_MESSAGE_ARRAY_BUFFER` arrives in WebView 105
   and the app's floor is 87 (ADR-0023), so between the two the base64
   fallback is the real path, with the ceiling behaviour PhotosPlugin's
   `readPickedBase64` documents: a 25 MB pick can run out of heap there and
   be refused. Not a regression - that was every WebView's path before this
   ticket - but it is the half the other shape would have fixed.

   `globalThis` rather than `window`, for the reason android-write-channel.ts
   gives: they are the same object in a WebView, and this keeps the module
   reachable from a plain Node test with `vi.stubGlobal`. */

const CHANNEL_NAME = 'androidPhotoPickChannel';

interface PickChannel {
  postMessage(data: string, transfer: Transferable[]): void;
}

interface PickFailure {
  ok: boolean;
  error?: string;
}

function channel(): PickChannel | null {
  const value = (globalThis as Record<string, unknown>)[CHANNEL_NAME];
  return (value as PickChannel | undefined) ?? null;
}

/** Null when the fast channel does not exist - below the WebView versions
    that carry it, or on any platform but Android - so the caller can fall
    back to the base64 bridge call, exactly as `writeOverChannel` does for
    the write direction. Non-null is a promise that settles with the bytes
    of the file `token` names, or rejects with what native said went wrong.

    The reply tells the two apart by its own type rather than by a wrapper:
    a WebMessage carries either bytes or a string, never both, so bytes are
    the success and a string is the failure. */
export function readPickedOverChannel(token: string): Promise<Uint8Array> | null {
  const target = channel();
  if (!target) return null;

  return new Promise<Uint8Array>((resolve, reject) => {
    const { port1, port2 } = new MessageChannel();

    port1.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      port1.close();
      if (typeof event.data !== 'string') {
        resolve(new Uint8Array(event.data));
        return;
      }
      let failure: PickFailure;
      try {
        failure = JSON.parse(event.data) as PickFailure;
      } catch {
        reject(new Error('photo pick channel returned an unparseable reply'));
        return;
      }
      reject(new Error(failure.error ?? 'picked file could not be read'));
    };

    target.postMessage(JSON.stringify({ token }), [port2]);
  });
}
