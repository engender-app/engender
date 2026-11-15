import { beforeEach, describe, expect, test, vi } from 'vitest';

const { filePick, cameraPick, normalizePhoto, toast, FakeUnsupportedImageError, FakeDocumentRefusedError } =
  vi.hoisted(() => {
    class FakeUnsupportedImageError extends Error {
      readonly kind: 'heic' | 'unreadable' | 'too-many-pixels';
      constructor(kind: 'heic' | 'unreadable' | 'too-many-pixels') {
        super(kind);
        this.kind = kind;
      }
    }
    class FakeDocumentRefusedError extends Error {
      readonly kind: 'unsupported' | 'too-large';
      constructor(kind: 'unsupported' | 'too-large') {
        super(kind);
        this.kind = kind;
      }
    }
    return {
      filePick: vi.fn(),
      cameraPick: vi.fn(),
      normalizePhoto: vi.fn(),
      toast: vi.fn(),
      FakeUnsupportedImageError,
      FakeDocumentRefusedError
    };
  });

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    photo_picker_failed: () => 'picker-failed',
    photo_heic: () => 'heic',
    photo_not_an_image: () => 'not-an-image',
    photo_unreadable: () => 'unreadable',
    document_too_large: () => 'too-large',
    image_too_many_pixels: () => 'too-many-pixels',
    photo_selection_too_large: () => 'selection-too-large'
  }
}));
vi.mock('./toasts.svelte', () => ({ toast }));
vi.mock('../data/photos/normalize', () => ({
  normalizePhoto,
  UnsupportedImageError: FakeUnsupportedImageError
}));
vi.mock('../data/media/budget', () => ({
  MediaBudgetError: class MediaBudgetError extends Error {
    kind: string;
    constructor(kind: string, message?: string) {
      super(message);
      this.kind = kind;
    }
  }
}));
vi.mock('../data/documents/accept', () => ({
  DocumentRefusedError: FakeDocumentRefusedError
}));
vi.mock('../data/photos/picker', () => ({
  filePhotoPicker: () => ({ pick: filePick }),
  cameraPhotoPicker: () => ({ pick: cameraPick })
}));

import { capturePhoto, pickPhotos } from './photoPicking';

/** What a selection picker hands back: one reader per file. */
const readers = (...files: number[][]) => files.map((bytes) => async () => new Uint8Array(bytes));

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

  test('toasts the too-large message and returns null when the picker refuses an oversized shot', async () => {
    cameraPick.mockRejectedValue(new FakeDocumentRefusedError('too-large'));

    const photo = await capturePhoto();

    expect(photo).toBeNull();
    expect(toast).toHaveBeenCalledWith('too-large');
  });
});

describe('pickPhotos', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('normalizes every picked photo, in order', async () => {
    filePick.mockResolvedValue(readers([1], [2]));
    normalizePhoto.mockResolvedValue(NORMALIZED);

    const photos = await pickPhotos();

    expect(photos).toEqual([NORMALIZED, NORMALIZED]);
    expect(cameraPick).not.toHaveBeenCalled();
  });

  test('drops an unreadable photo but keeps the rest, and toasts once for it', async () => {
    filePick.mockResolvedValue(readers([1], [2]));
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

  test('toasts the too-large message and returns nothing when the picker refuses an oversized photo', async () => {
    filePick.mockRejectedValue(new FakeDocumentRefusedError('too-large'));

    const photos = await pickPhotos();

    expect(photos).toEqual([]);
    expect(toast).toHaveBeenCalledWith('too-large');
  });

  test('asks the picker for a single photo when the owner holds one', async () => {
    filePick.mockResolvedValue([]);
    await pickPhotos(1);
    expect(filePick).toHaveBeenCalledWith({ multiple: false });
    await pickPhotos();
    expect(filePick).toHaveBeenLastCalledWith({ multiple: true });
  });

  test('reads and normalizes one photo before it reads the next', async () => {
    const order: string[] = [];
    filePick.mockResolvedValue(
      [1, 2].map((n) => async () => {
        order.push(`read ${n}`);
        return new Uint8Array([n]);
      })
    );
    normalizePhoto.mockImplementation(async (bytes: Uint8Array) => {
      order.push(`normalize ${bytes[0]}`);
      return NORMALIZED;
    });

    await pickPhotos();

    expect(order).toEqual(['read 1', 'normalize 1', 'read 2', 'normalize 2']);
  });

  test('says an over-budget image has too many pixels, and keeps the rest', async () => {
    filePick.mockResolvedValue(readers([1], [2]));
    normalizePhoto.mockRejectedValueOnce(new FakeUnsupportedImageError('too-many-pixels')).mockResolvedValueOnce(NORMALIZED);

    expect(await pickPhotos()).toEqual([NORMALIZED]);
    expect(toast).toHaveBeenCalledWith('too-many-pixels');
  });

  test('says a selection over the count or total budget is too much at once', async () => {
    const { MediaBudgetError } = await import('../data/media/budget');
    filePick.mockRejectedValue(new MediaBudgetError('pick-selection', 'too many'));

    expect(await pickPhotos()).toEqual([]);
    expect(toast).toHaveBeenCalledWith('selection-too-large');
  });
});
