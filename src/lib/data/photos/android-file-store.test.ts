import { describe, expect, test, vi } from 'vitest';
import { appPrivatePhotoFiles } from './android-file-store.ts';
import { androidPhotos } from './android-bridge.ts';

vi.mock('./android-bridge.ts', () => ({
  androidPhotos: {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    sizeFile: vi.fn(),
    removeFile: vi.fn(),
    listFiles: vi.fn()
  }
}));

describe('appPrivatePhotoFiles', () => {
  test('implements the file-store contract over the bridge, with directory forwarding', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.mocked(androidPhotos.readFile).mockResolvedValue({ base64: btoa(String.fromCharCode(...bytes)) });
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
    expect(vi.mocked(androidPhotos.readFile)).toHaveBeenCalledWith({ name: 'a.jpg', directory: 'probe-dir' });

    expect(await files.size('a.jpg')).toBe(3);
    expect(vi.mocked(androidPhotos.sizeFile)).toHaveBeenCalledWith({ name: 'a.jpg', directory: 'probe-dir' });

    await files.remove('a.jpg');
    expect(vi.mocked(androidPhotos.removeFile)).toHaveBeenCalledWith({ name: 'a.jpg', directory: 'probe-dir' });

    expect(await files.list()).toEqual(['a.jpg', 'b.jpg']);
    expect(vi.mocked(androidPhotos.listFiles)).toHaveBeenCalledWith({ directory: 'probe-dir' });
  });

  test('maps missing files to null', async () => {
    vi.mocked(androidPhotos.readFile).mockResolvedValue({ base64: null });
    vi.mocked(androidPhotos.sizeFile).mockResolvedValue({ size: null });

    const files = appPrivatePhotoFiles();
    expect(await files.read('missing.jpg')).toBeNull();
    expect(await files.size('missing.jpg')).toBeNull();
  });
});
