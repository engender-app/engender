import { describe, expect, test, vi } from 'vitest';
import { appPrivatePhotoFiles } from './android-file-store.ts';
import { androidPhotos } from './android-bridge.ts';

vi.mock('./android-bridge.ts', () => ({
  androidPhotos: {
    writeFile: vi.fn(),
    sizeFile: vi.fn(),
    sizeFiles: vi.fn(),
    removeFile: vi.fn(),
    listFiles: vi.fn(),
    directoryPath: vi.fn()
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { convertFileSrc: (path: string) => `https://localhost/_capacitor_file_${path}` }
}));

/** Files by name, served the way Capacitor's local server serves them: the
    bytes for a name that is there, 404 for one that is not. Returns the URLs
    fetched, in order. */
function servedFiles(files: Record<string, Uint8Array>): string[] {
  vi.clearAllMocks();
  vi.mocked(androidPhotos.directoryPath).mockResolvedValue({ path: '/data/user/0/app/files/probe-dir' });
  const fetched: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetched.push(url);
      const bytes = files[decodeURIComponent(url.slice(url.lastIndexOf('/') + 1))];
      if (!bytes) return { ok: false, status: 404 } as unknown as Response;
      return { ok: true, arrayBuffer: async () => bytes.buffer } as unknown as Response;
    })
  );
  return fetched;
}

describe('appPrivatePhotoFiles', () => {
  test('implements the file-store contract over the bridge, with directory forwarding', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    servedFiles({ 'a.jpg': bytes });
    vi.mocked(androidPhotos.sizeFile).mockResolvedValue({ size: 3 });
    vi.mocked(androidPhotos.listFiles).mockResolvedValue({ names: ['a.jpg', 'b.jpg'] });

    const files = appPrivatePhotoFiles('probe-dir');
    await files.write('a.jpg', bytes);

    expect(vi.mocked(androidPhotos.writeFile)).toHaveBeenCalledWith({
      name: 'a.jpg',
      base64: btoa(String.fromCharCode(...bytes)),
      directory: 'probe-dir'
    });

    expect(await files.read('a.jpg')).toEqual(bytes);

    expect(await files.size('a.jpg')).toBe(3);
    expect(vi.mocked(androidPhotos.sizeFile)).toHaveBeenCalledWith({ name: 'a.jpg', directory: 'probe-dir' });

    await files.remove('a.jpg');
    expect(vi.mocked(androidPhotos.removeFile)).toHaveBeenCalledWith({ name: 'a.jpg', directory: 'probe-dir' });

    expect(await files.list()).toEqual(['a.jpg', 'b.jpg']);
    expect(vi.mocked(androidPhotos.listFiles)).toHaveBeenCalledWith({ directory: 'probe-dir' });
  });

  test('maps missing files to null', async () => {
    servedFiles({});
    vi.mocked(androidPhotos.sizeFile).mockResolvedValue({ size: null });

    const files = appPrivatePhotoFiles();
    expect(await files.read('missing.jpg')).toBeNull();
    expect(await files.size('missing.jpg')).toBeNull();
  });

  /* Why reads left the bridge (ticket 07). A plugin response crosses into the
     WebView as a JSON string, which moved photo bytes at 0.8MB/s on a Pixel
     10a - seven minutes to read a decade of photos for an Archive export. If a
     read ever goes back through the bridge this fails here, rather than a
     half-hour benchmark noticing later. */
  test('reads fetch from the local server rather than crossing the bridge', async () => {
    const fetched = servedFiles({ 'a.jpg': new Uint8Array([1]), 'b.jpg': new Uint8Array([2]) });

    const files = appPrivatePhotoFiles('probe-dir');
    expect(await files.readMany!(['a.jpg', 'b.jpg'])).toEqual([new Uint8Array([1]), new Uint8Array([2])]);

    expect(fetched).toEqual([
      'https://localhost/_capacitor_file_/data/user/0/app/files/probe-dir/a.jpg',
      'https://localhost/_capacitor_file_/data/user/0/app/files/probe-dir/b.jpg'
    ]);
  });

  /* Ticket 19: when the fast channel exists, a write must use it instead of
     the base64 bridge call - otherwise every device that can carry the
     channel still pays the cost the channel exists to avoid. */
  test('writes over the channel instead of the bridge when the channel exists', async () => {
    servedFiles({});
    vi.stubGlobal('androidPhotoWriteChannel', {
      postMessage(_data: string, transfer: Transferable[]) {
        const port = transfer[0] as MessagePort;
        port.onmessage = () => port.postMessage('{"ok":true}');
      }
    });

    const files = appPrivatePhotoFiles('probe-dir');
    await files.write('a.jpg', new Uint8Array([1, 2, 3]));

    expect(vi.mocked(androidPhotos.writeFile)).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  /* One bridge call for the directory however many files are read - asking per
     read would put a crossing back in front of every photo. */
  test('asks for the directory once and reuses it', async () => {
    servedFiles({ 'a.jpg': new Uint8Array([1]), 'b.jpg': new Uint8Array([2]) });

    const files = appPrivatePhotoFiles('probe-dir');
    await Promise.all([files.read('a.jpg'), files.read('b.jpg')]);
    await files.read('a.jpg');

    expect(vi.mocked(androidPhotos.directoryPath)).toHaveBeenCalledTimes(1);
  });

  /* The plugin makes the directory on demand, so asking can fail while storage
     is full or still locked. Remembering that failure would leave the store
     unable to read for the rest of the run. */
  test('asks again after the directory failed', async () => {
    servedFiles({ 'a.jpg': new Uint8Array([1]) });
    vi.mocked(androidPhotos.directoryPath).mockRejectedValueOnce(new Error('could not create photo directory'));

    const files = appPrivatePhotoFiles('probe-dir');
    await expect(files.read('a.jpg')).rejects.toThrow('could not create photo directory');

    expect(await files.read('a.jpg')).toEqual(new Uint8Array([1]));
  });
});
