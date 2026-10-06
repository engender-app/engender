import { afterEach, describe, expect, test, vi } from 'vitest';
import { writeOverChannel } from './android-write-channel.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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


test('a native write reply that never arrives times out and closes both ports', async () => {
  vi.useFakeTimers();
  const close = vi.fn();
  vi.stubGlobal('MessageChannel', class {
    port1 = { onmessage: null, postMessage() {}, close };
    port2 = { close };
  });
  vi.stubGlobal('androidPhotoWriteChannel', { postMessage() {} });
  const answer = writeOverChannel('a.jpg', 'photos', new Uint8Array([1]));
  const rejected = expect(answer).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  expect(close).toHaveBeenCalledTimes(2);
});


test('a late write reply after timeout is ignored', async () => {
  vi.useFakeTimers();
  let reply: (event: { data: unknown }) => void;
  const port = { onmessage: null as unknown, postMessage() {}, close: vi.fn() };
  vi.stubGlobal('MessageChannel', class { port1 = port; port2 = { close: vi.fn() }; });
  vi.stubGlobal('androidPhotoWriteChannel', { postMessage() { reply = port.onmessage as typeof reply; } });
  const answer = writeOverChannel('a.jpg', 'photos', new Uint8Array([1]));
  const rejected = expect(answer).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  reply!({ data: "{\"ok\":true}" });
  expect(port.onmessage).toBeNull();
  expect(port.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
