/* Transfer picked bytes as a structured-clone ArrayBuffer through
   WebViewCompat.addWebMessageListener. PhotoPickChannel.java owns the
   native half. This avoids keeping the base64, decoded string and
   byte array together. In a 25 MB desktop measurement, main-thread
   blocking dropped from 1,054ms to 4ms.

   Callers inspect PDF signatures and normalize photos in JavaScript.
   Writing a temporary plaintext file would expose it through a crash
   and still bring its bytes into JS for checking (ADR-0018, ADR-0020).
   WebViews without ArrayBuffer support use the chunked base64 fallback
   in picker.ts to bound allocations. globalThis lets Node tests stub
   the same bridge. */

import { PhotoChannelTimeoutError, PHOTO_CHANNEL_TIMEOUT_MS } from './channel-timeout';

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
    let settled = false;
    const close = () => {
      settled = true;
      clearTimeout(timer);
      port1.onmessage = null;
      port1.close();
      port2.close();
    };
    const timer = setTimeout(() => {
      try {
        port1.postMessage('cancel');
      } finally {
        close();
        reject(new PhotoChannelTimeoutError('pick'));
      }
    }, PHOTO_CHANNEL_TIMEOUT_MS);

    port1.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      if (settled) return;
      if (typeof event.data !== 'string') {
        port1.postMessage('received');
        close();
        resolve(new Uint8Array(event.data));
        return;
      }
      close();
      let failure: PickFailure;
      try {
        failure = JSON.parse(event.data) as PickFailure;
      } catch {
        reject(new Error('photo pick channel returned an unparseable reply'));
        return;
      }
      reject(new Error(failure.error ?? 'picked file could not be read'));
    };

    try {
      target.postMessage(JSON.stringify({ token }), [port2]);
    } catch (error) {
      close();
      reject(error);
    }
  });
}
