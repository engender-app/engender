import { afterEach, describe, expect, test, vi } from 'vitest';
import { readPickedOverChannel } from './android-pick-channel.ts';

afterEach(() => {
  vi.unstubAllGlobals();
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
      const port = transfer[0] as MessagePort;
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
