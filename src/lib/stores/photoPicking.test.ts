import { beforeEach, describe, expect, test, vi } from 'vitest';

const { filePick, cameraPick, normalizePhoto, toast, FakeUnsupportedImageError } = vi.hoisted(() => {
  class FakeUnsupportedImageError extends Error {
    readonly kind: 'heic' | 'unreadable';
    constructor(kind: 'heic' | 'unreadable') {
      super(kind);
      this.kind = kind;
    }
  }
  return {
    filePick: vi.fn(),
    cameraPick: vi.fn(),
    normalizePhoto: vi.fn(),
    toast: vi.fn(),
    FakeUnsupportedImageError
  };
});

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    photo_picker_failed: () => 'picker-failed',
    photo_heic: () => 'heic',
    photo_not_an_image: () => 'not-an-image',
    photo_unreadable: () => 'unreadable'
  }
}));
vi.mock('./toasts.svelte', () => ({ toast }));
vi.mock('../data/photos/normalize', () => ({
  normalizePhoto,
  UnsupportedImageError: FakeUnsupportedImageError
}));
vi.mock('../data/photos/picker', () => ({
  filePhotoPicker: () => ({ pick: filePick }),
  cameraPhotoPicker: () => ({ pick: cameraPick })
}));

import { capturePhoto, pickPhotos } from './photoPicking';

const NORMALIZED = { full: new Uint8Array([1]), thumb: new Uint8Array([2]) };

describe('capturePhoto', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('normalizes the one shot the camera picker returns', async () => {
    cameraPick.mockResolvedValue([new Uint8Array([9, 9])]);
    normalizePhoto.mockResolvedValue(NORMALIZED);

    const photo = await capturePhoto();

    expect(photo).toBe(NORMALIZED);
    expect(normalizePhoto).toHaveBeenCalledWith(new Uint8Array([9, 9]));
    expect(filePick).not.toHaveBeenCalled();
  });

  test('is null if the camera is backed out of, without toasting', async () => {
    cameraPick.mockResolvedValue([]);

    const photo = await capturePhoto();

    expect(photo).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  test('toasts and returns null if the camera itself fails', async () => {
    cameraPick.mockRejectedValue(new Error('camera app crashed'));

    const photo = await capturePhoto();

    expect(photo).toBeNull();
    expect(toast).toHaveBeenCalledWith('picker-failed');
  });

  test('toasts the HEIC message and returns null for an unreadable HEIC shot', async () => {
    cameraPick.mockResolvedValue([new Uint8Array([9])]);
    normalizePhoto.mockRejectedValue(new FakeUnsupportedImageError('heic'));

    const photo = await capturePhoto();

    expect(photo).toBeNull();
    expect(toast).toHaveBeenCalledWith('heic');
  });
});

describe('pickPhotos', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('normalizes every picked photo, in order', async () => {
    filePick.mockResolvedValue([new Uint8Array([1]), new Uint8Array([2])]);
    normalizePhoto.mockResolvedValue(NORMALIZED);

    const photos = await pickPhotos();

    expect(photos).toEqual([NORMALIZED, NORMALIZED]);
    expect(cameraPick).not.toHaveBeenCalled();
  });

  test('drops an unreadable photo but keeps the rest, and toasts once for it', async () => {
    filePick.mockResolvedValue([new Uint8Array([1]), new Uint8Array([2])]);
    normalizePhoto.mockRejectedValueOnce(new FakeUnsupportedImageError('unreadable')).mockResolvedValueOnce(NORMALIZED);

    const photos = await pickPhotos();

    expect(photos).toEqual([NORMALIZED]);
    expect(toast).toHaveBeenCalledWith('not-an-image');
  });

  test('toasts and returns nothing if the picker itself fails', async () => {
    filePick.mockRejectedValue(new Error('dialog broke'));

    const photos = await pickPhotos();

    expect(photos).toEqual([]);
    expect(toast).toHaveBeenCalledWith('picker-failed');
  });
});
