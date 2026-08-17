import { afterEach, describe, expect, test, vi } from 'vitest';
import { writeOverChannel } from './android-write-channel.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fake of the native side of the protocol: reads the header off the
    transferred port, waits for the ArrayBuffer, then replies however the
    test asks. Returns what the header and the bytes were, so a test can
    assert on them too. */
function fakeNativeChannel(reply: (bytes: Uint8Array) => string) {
  const seen: { header?: { name: string; directory: string } } = {};
  vi.stubGlobal('androidPhotoWriteChannel', {
    postMessage(data: string, transfer: Transferable[]) {
      seen.header = JSON.parse(data);
      const port = transfer[0] as MessagePort;
      port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        port.postMessage(reply(new Uint8Array(event.data)));
      };
    }
  });
  return seen;
}

describe('writeOverChannel', () => {
  test('is null when the channel does not exist, so the caller can fall back', () => {
    expect(writeOverChannel('a.jpg', 'photos', new Uint8Array([1]))).toBeNull();
  });

  /* The whole point of ticket 19: the bytes cross as a real ArrayBuffer, not
     a base64 string, so a test that only checked the ack would miss a
     regression that quietly re-encoded them along the way. */
  test('carries the header and the exact bytes to the native side, and resolves on ok', async () => {
    const seen = fakeNativeChannel((bytes) => {
      expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
      return '{"ok":true}';
    });

    await writeOverChannel('a.jpg', 'probe-dir', new Uint8Array([1, 2, 3]));

    expect(seen.header).toEqual({ name: 'a.jpg', directory: 'probe-dir' });
  });

  test('rejects with native error on a failed write', async () => {
    fakeNativeChannel(() => '{"ok":false,"error":"disk full"}');

    await expect(writeOverChannel('a.jpg', 'photos', new Uint8Array([1]))).rejects.toThrow('disk full');
  });

  test('rejects if native replies with something that is not JSON', async () => {
    fakeNativeChannel(() => 'not json');

    await expect(writeOverChannel('a.jpg', 'photos', new Uint8Array([1]))).rejects.toThrow(
      'unparseable reply'
    );
  });

  /* A view into a larger buffer (the normal shape a caller hands over,
     since Uint8Array.subarray shares the backing buffer) must not leak
     bytes outside itself onto the wire. */
  test('sends only the view, not whatever else its backing buffer holds', async () => {
    const backing = new Uint8Array([9, 1, 2, 3, 9]);
    const view = backing.subarray(1, 4);
    fakeNativeChannel((bytes) => {
      expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
      return '{"ok":true}';
    });

    await writeOverChannel('a.jpg', 'photos', view);
  });
});
