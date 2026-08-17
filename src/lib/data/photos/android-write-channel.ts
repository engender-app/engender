/* The JS side of ticket 19's fast write path: a small MessageChannel
   handshake against `window.androidPhotoWriteChannel`, which native
   registers with `WebViewCompat.addWebMessageListener` when the WebView can
   carry an ArrayBuffer across as a structured clone (PhotoWriteChannel.java
   has the other half and the full protocol).

   `globalThis` rather than `window`: they are the same object in a WebView,
   and this keeps the module reachable from a plain Node test with
   `vi.stubGlobal`, the same way android-file-store.test.ts already stubs
   `fetch`. */

const CHANNEL_NAME = 'androidPhotoWriteChannel';

interface WriteChannel {
  postMessage(data: string, transfer: Transferable[]): void;
}

interface WriteAck {
  ok: boolean;
  error?: string;
}

function channel(): WriteChannel | null {
  const value = (globalThis as Record<string, unknown>)[CHANNEL_NAME];
  return (value as WriteChannel | undefined) ?? null;
}

/** Null when the fast channel does not exist - below the WebView versions
    that carry it, or on any platform but Android - so the caller can fall
    back to the base64 bridge call. Non-null is a promise that only settles
    once native has the bytes on disk, ok or not. */
export function writeOverChannel(name: string, directory: string, bytes: Uint8Array): Promise<void> | null {
  const target = channel();
  if (!target) return null;

  return new Promise<void>((resolve, reject) => {
    const { port1, port2 } = new MessageChannel();

    port1.onmessage = (event: MessageEvent<string>) => {
      port1.close();
      let ack: WriteAck;
      try {
        ack = JSON.parse(event.data) as WriteAck;
      } catch {
        reject(new Error('photo write channel returned an unparseable reply'));
        return;
      }
      if (ack.ok) resolve();
      else reject(new Error(ack.error ?? 'photo write failed'));
    };

    target.postMessage(JSON.stringify({ name, directory }), [port2]);
    // A fresh copy rather than `bytes.buffer` directly: a subarray view's
    // buffer can be larger than the view itself, and transferring it would
    // hand over bytes the write never asked for (and detach them from
    // whatever else still holds that buffer).
    const payload = new Uint8Array(bytes).buffer;
    port1.postMessage(payload, [payload]);
  });
}
