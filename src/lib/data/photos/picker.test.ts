import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../fileDialog.ts', () => ({
  chooseFiles: vi.fn()
}));

vi.mock('../../platform.ts', () => ({
  isAndroid: vi.fn()
}));

vi.mock('./android-bridge.ts', () => ({
  androidPhotos: {
    pickImages: vi.fn(),
    captureImage: vi.fn()
  }
}));

import { chooseFiles } from '../fileDialog.ts';
import { isAndroid } from '../../platform.ts';
import { androidPhotos } from './android-bridge.ts';
import { cameraPhotoPicker, filePhotoPicker } from './picker.ts';

describe('filePhotoPicker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('uses Android picker bytes on Android', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickImages).mockResolvedValue({
      images: [btoa(String.fromCharCode(1, 2, 3))]
    });

    const picked = await filePhotoPicker().pick();

    expect(picked).toEqual([new Uint8Array([1, 2, 3])]);
    expect(vi.mocked(chooseFiles)).not.toHaveBeenCalled();
  });

  test('uses file input picker on web', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    vi.mocked(chooseFiles).mockResolvedValue([
      {
        arrayBuffer: async () => new Uint8Array([9, 8]).buffer
      }
    ] as File[]);

    const picked = await filePhotoPicker().pick();

    expect(picked).toEqual([new Uint8Array([9, 8])]);
    expect(vi.mocked(androidPhotos.pickImages)).not.toHaveBeenCalled();
  });
});

describe('cameraPhotoPicker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('uses the Android camera capture bytes on Android', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.captureImage).mockResolvedValue({
      image: btoa(String.fromCharCode(4, 5, 6))
    });

    const picked = await cameraPhotoPicker().pick();

    expect(picked).toEqual([new Uint8Array([4, 5, 6])]);
    expect(vi.mocked(chooseFiles)).not.toHaveBeenCalled();
  });

  test('returns nothing if the Android camera is backed out of', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.captureImage).mockResolvedValue({ image: null });

    const picked = await cameraPhotoPicker().pick();

    expect(picked).toEqual([]);
  });

  test('opens the file input with a camera capture hint on the web', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    vi.mocked(chooseFiles).mockResolvedValue([
      {
        arrayBuffer: async () => new Uint8Array([7]).buffer
      }
    ] as File[]);

    const picked = await cameraPhotoPicker().pick();

    expect(picked).toEqual([new Uint8Array([7])]);
    expect(vi.mocked(chooseFiles)).toHaveBeenCalledWith('image/*', { capture: 'environment' });
    expect(vi.mocked(androidPhotos.captureImage)).not.toHaveBeenCalled();
  });

  test('returns nothing if the web file dialog is dismissed', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    vi.mocked(chooseFiles).mockResolvedValue([]);

    const picked = await cameraPhotoPicker().pick();

    expect(picked).toEqual([]);
  });
});
