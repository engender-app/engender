import { beforeEach, describe, expect, test, vi } from 'vitest';

const { filePick, cameraPick, cameraRecheck, normalizePhoto, toast, androidPickedBytes, PickDeferredError } = vi.hoisted(() => {
  class PickDeferredError extends Error {
    constructor(readonly tokens: string[]) {
      super('pick-deferred');
    }
  }
  return {
    filePick: vi.fn(),
    cameraPick: vi.fn(),
    cameraRecheck: vi.fn(),
    normalizePhoto: vi.fn(),
    toast: vi.fn(),
    androidPickedBytes: vi.fn(),
    PickDeferredError
  };
});

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    photo_picker_failed: () => 'picker-failed',
    photo_heic: () => 'heic',
    photo_not_an_image: () => 'not-an-image',
    photo_unreadable: () => 'unreadable',
    photo_too_large: () => 'photo-too-large',
    document_too_large: () => 'too-large',
    picked_while_locked_added: () => 'added',
    picked_while_locked_lost: () => 'lost'
  }
}));
vi.mock('./toasts.svelte', () => ({ toast }));
vi.mock('./lock.svelte', () => ({ isSessionLocked: () => false }));
vi.mock('../data/photos/normalize', () => ({ normalizePhoto, UnsupportedImageError: class extends Error {} }));
vi.mock('../data/documents/accept', () => ({ DocumentRefusedError: class extends Error {} }));
vi.mock('../data/photos/picker', () => ({
  filePhotoPicker: () => ({ pick: filePick }),
  cameraPhotoPicker: () => ({ pick: cameraPick, recheck: cameraRecheck }),
  androidPickedBytes,
  PickDeferredError
}));

import { capturePhoto, claimPendingPhotos, pickPhotos } from './photoPicking';
import { dropPending } from './pendingPick';
import { PhotoTooLargeError } from '../data/photos/limits';

const NORMALIZED = { full: new Uint8Array([1]), thumb: new Uint8Array([2]) };

describe('a photo that comes back while the app is locked', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dropPending();
    vi.stubGlobal('location', { pathname: '/entry/new' });
  });

  test.each([
    ['the camera', () => cameraPick, () => capturePhoto('entry')],
    ['the gallery', () => filePick, () => pickPhotos(undefined, 'entry')]
  ] as const)('from %s is not lost: nothing is read, and the editor gets it after unlock', async (_name, picker, ask) => {
    picker().mockRejectedValue(new PickDeferredError(['tok']));
    normalizePhoto.mockResolvedValue(NORMALIZED);
    androidPickedBytes.mockResolvedValue(new Uint8Array([7]));

    const answer = await ask();

    expect(answer === null || (Array.isArray(answer) && answer.length === 0)).toBe(true);
    expect(androidPickedBytes).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();

    expect(await claimPendingPhotos('entry')).toEqual([NORMALIZED]);
    expect(androidPickedBytes).toHaveBeenCalledWith('tok');
    expect(toast).toHaveBeenCalledWith('added');
  });

  test('is not offered to an editor somewhere else', async () => {
    cameraPick.mockRejectedValue(new PickDeferredError(['tok']));
    await capturePhoto('entry');
    vi.stubGlobal('location', { pathname: '/progress' });

    expect(await claimPendingPhotos('entry')).toEqual([]);
  });

  test('a screen that cannot take it back says so rather than losing it silently', async () => {
    cameraPick.mockRejectedValue(new PickDeferredError(['tok']));

    expect(await capturePhoto()).toBeNull();

    expect(toast).toHaveBeenCalledWith('lost');
    expect(await claimPendingPhotos('entry')).toEqual([]);
  });
});

describe('a lock that lands while a picked photo is being normalized', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dropPending();
    vi.stubGlobal('location', { pathname: '/entry/new' });
  });

  test('the normalized photo is dropped and kept by token for the unlock', async () => {
    cameraPick.mockResolvedValue([new Uint8Array([9])]);
    normalizePhoto.mockResolvedValue(NORMALIZED);
    cameraRecheck.mockRejectedValue(new PickDeferredError(['tok']));
    androidPickedBytes.mockResolvedValue(new Uint8Array([9]));

    expect(await capturePhoto('entry')).toBeNull();
    expect(toast).not.toHaveBeenCalled();

    cameraRecheck.mockResolvedValue(undefined);
    expect(await claimPendingPhotos('entry')).toEqual([NORMALIZED]);
  });
});

describe('a too-large file in a pick kept through a lock', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dropPending();
    vi.stubGlobal('location', { pathname: '/entry/new' });
  });

  test('says too large, not unreadable', async () => {
    cameraPick.mockRejectedValue(new PickDeferredError(['tok']));
    await capturePhoto('entry');
    androidPickedBytes.mockRejectedValue(new PhotoTooLargeError());

    expect(await claimPendingPhotos('entry')).toEqual([]);

    expect(toast).toHaveBeenCalledWith('photo-too-large');
    expect(toast).not.toHaveBeenCalledWith('unreadable');
  });
});

describe('a file native cannot give back after a lock', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dropPending();
    vi.stubGlobal('location', { pathname: '/entry/new' });
  });

  test('is reported once, not once per remaining file', async () => {
    const lost = vi.fn().mockRejectedValue(new Error('picked-file-lost'));
    const next = vi.fn();
    filePick.mockResolvedValue([lost, next]);

    expect(await pickPhotos(undefined, 'entry')).toEqual([]);

    expect(next).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('picker-failed');
  });
});
