import { afterEach, expect, test, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  beginFile: vi.fn(async () => ({ transferId: 'transfer' })),
  appendFile: vi.fn(async (_part: { transferId: string; offset: number; base64: string }) => {}),
  finishFile: vi.fn(async () => ({ saved: false })),
  abortFile: vi.fn(async () => {})
}));
vi.mock('./android-file-delivery-bridge', () => ({ androidFileDelivery: bridge }));
vi.mock('../../platform', () => ({ isAndroid: () => true }));
import { deliverBlob, deliverFile } from './deliver';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function webview() {
  const click = vi.fn();
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('document', { createElement: () => ({ click }) });
  return click;
}

test('Android cancellation reaches caller without claiming a WebView download', async () => {
  const click = webview();
  expect(await deliverBlob('backup.ttbackup', new Blob(['complete bytes']))).toBe('cancelled');
  expect(bridge.finishFile).toHaveBeenCalledOnce();
  expect(click).not.toHaveBeenCalled();
});

test('Android streams every exported byte and verifies the final size and digest', async () => {
  webview();
  bridge.finishFile.mockResolvedValueOnce({ saved: true });
  const body = new Uint8Array(1024 * 1024 + 71).fill(65);
  expect(await deliverFile({ fileName: 'backup.ttbackup', type: 'application/octet-stream',
    body: (async function* () { yield body; })() })).toBe('downloaded');
  const chunks = bridge.appendFile.mock.calls.map(([part]) => part);
  expect(chunks.length).toBeGreaterThan(1);
  let offset = 0;
  const delivered: Buffer[] = [];
  for (const part of chunks) {
    expect(part.offset).toBe(offset);
    const bytes = Buffer.from(part.base64, 'base64');
    delivered.push(bytes);
    offset += bytes.length;
  }
  expect(Buffer.concat(delivered)).toEqual(Buffer.from(body));
  const { createHash } = await import('node:crypto');
  expect(bridge.finishFile).toHaveBeenCalledWith({ transferId: 'transfer', byteLength: body.length,
    sha256: createHash('sha256').update(body).digest('hex') });
  expect(bridge.abortFile).toHaveBeenCalledWith({ transferId: 'transfer' });
});

test('Android delivery failure rejects and removes staging instead of reporting downloaded', async () => {
  webview();
  bridge.appendFile.mockRejectedValueOnce(new Error('destination-full'));
  await expect(deliverBlob('backup.ttbackup', new Blob(['complete bytes']))).rejects.toThrow('destination-full');
  expect(bridge.finishFile).not.toHaveBeenCalled();
  expect(bridge.abortFile).toHaveBeenCalledWith({ transferId: 'transfer' });
});
