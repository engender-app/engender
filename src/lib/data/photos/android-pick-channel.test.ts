import { afterEach, describe, expect, test, vi } from 'vitest';
import { readPickedOverChannel } from './android-pick-channel.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A fake of the native side of the protocol: reads the header off the
    transferred port and replies on it with whatever the test asks for -
    an ArrayBuffer for a successful read, a JSON string for a failure.
    Returns what the header was, so a test can assert on it too. */
function fakeNativeChannel(reply: () => ArrayBuffer | string) {
  const seen: { header?: { token: string } } = {};
  vi.stubGlobal('androidPhotoPickChannel', {
    postMessage(data: string, transfer: Transferable[]) {
      seen.header = JSON.parse(data);
      const port = structuredClone(transfer[0], { transfer: [transfer[0]] }) as MessagePort;
      const answer = reply();
      if (typeof answer === 'string') port.postMessage(answer);
      else port.postMessage(answer, [answer]);
    }
  });
  return seen;
}

describe('readPickedOverChannel', () => {
  test('is null when the channel does not exist, so the caller can fall back', () => {
    expect(readPickedOverChannel('a-token')).toBeNull();
  });

  /* The whole point of this ticket: the bytes arrive as a real ArrayBuffer
     rather than a base64 string, so a test that only checked the length
     would miss a regression that quietly re-encoded them along the way. */
  test('carries the token to the native side and resolves with the exact bytes', async () => {
    const seen = fakeNativeChannel(() => new Uint8Array([1, 2, 3]).buffer);

    const bytes = await readPickedOverChannel('picked-42');

    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(seen.header).toEqual({ token: 'picked-42' });
  });

  test('resolves with an empty array for an empty file rather than treating it as a failure', async () => {
    fakeNativeChannel(() => new ArrayBuffer(0));

    expect(await readPickedOverChannel('empty')).toEqual(new Uint8Array([]));
  });

  test('rejects with the native error when the token cannot be read', async () => {
    fakeNativeChannel(() => '{"ok":false,"error":"unknown picked file"}');

    await expect(readPickedOverChannel('stale')).rejects.toThrow('unknown picked file');
  });

  test('rejects if native replies with something that is not JSON', async () => {
    fakeNativeChannel(() => 'not json');

    await expect(readPickedOverChannel('a-token')).rejects.toThrow('unparseable reply');
  });
});


test('a native pick reply that never arrives times out and closes both ports', async () => {
  vi.useFakeTimers();
  const close = vi.fn();
  vi.stubGlobal('MessageChannel', class {
    port1 = { onmessage: null, postMessage() {}, close };
    port2 = { close };
  });
  vi.stubGlobal('androidPhotoPickChannel', { postMessage() {} });
  const answer = readPickedOverChannel('token');
  const rejected = expect(answer).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  expect(close).toHaveBeenCalledTimes(2);
});


test('a late pick reply after timeout is ignored', async () => {
  vi.useFakeTimers();
  let reply: (event: { data: unknown }) => void;
  const port = { onmessage: null as unknown, postMessage() {}, close: vi.fn() };
  vi.stubGlobal('MessageChannel', class { port1 = port; port2 = { close: vi.fn() }; });
  vi.stubGlobal('androidPhotoPickChannel', { postMessage() { reply = port.onmessage as typeof reply; } });
  const answer = readPickedOverChannel('token');
  const rejected = expect(answer).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  reply!({ data: new Uint8Array([9]).buffer });
  expect(port.onmessage).toBeNull();
  expect(port.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});


test('receipt acknowledgement reaches native even when JS closes its port immediately', async () => {
  let received: (value: string) => void;
  const acknowledgement = new Promise<string>((resolve) => { received = resolve; });
  vi.stubGlobal('androidPhotoPickChannel', {
    postMessage(_data: string, transfer: Transferable[]) {
      const port = structuredClone(transfer[0], { transfer: [transfer[0]] }) as MessagePort;
      port.onmessage = (event: MessageEvent<string>) => {
        received(event.data);
        port.close();
      };
      port.postMessage(new Uint8Array([1, 2, 3]).buffer);
    }
  });
  expect(await readPickedOverChannel('received')).toEqual(new Uint8Array([1, 2, 3]));
  expect(await acknowledgement).toBe('received');
});

test('timeout cancellation reaches native before the JS port closes', async () => {
  vi.useFakeTimers();
  let cancelled: (value: string) => void;
  const cancellation = new Promise<string>((resolve) => { cancelled = resolve; });
  vi.stubGlobal('androidPhotoPickChannel', {
    postMessage(_data: string, transfer: Transferable[]) {
      const port = structuredClone(transfer[0], { transfer: [transfer[0]] }) as MessagePort;
      port.onmessage = (event: MessageEvent<string>) => {
        cancelled(event.data);
        port.close();
      };
    }
  });
  const answer = readPickedOverChannel('cancelled');
  const rejected = expect(answer).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  expect(await cancellation).toBe('cancel');
});
