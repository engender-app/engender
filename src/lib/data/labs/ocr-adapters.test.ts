import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../platform', () => ({ isAndroid: vi.fn() }));
vi.mock('../photos/android-bridge', () => ({
  androidPhotos: { pickImages: vi.fn(), captureImage: vi.fn() }
}));
vi.mock('../photos/picker', () => ({ androidPickedBytes: vi.fn() }));
vi.mock('../fileDialog', () => ({ chooseFiles: vi.fn() }));
vi.mock('./ocr-engine', () => ({ tesseractLabOcrEngine: vi.fn() }));

import { isAndroid } from '../../platform';
import { androidPhotos } from '../photos/android-bridge';
import { chooseFiles } from '../fileDialog';
import { PHOTO_SIZE_CEILING, PhotoTooLargeError } from '../photos/limits';
import { platformImageSource } from './ocr-adapters';

const fakeFile = (size: number): File =>
  ({ size, arrayBuffer: vi.fn(async () => new Uint8Array([1]).buffer) }) as unknown as File;

describe('platformImageSource', () => {
  beforeEach(() => vi.resetAllMocks());

  /* The lab read whatever it was given whole, with no byte limit. */
  test('refuses a web file over the photo ceiling without reading it', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    const big = fakeFile(PHOTO_SIZE_CEILING + 1);
    vi.mocked(chooseFiles).mockResolvedValue([big]);

    await expect(platformImageSource().pickImage('gallery')).rejects.toBeInstanceOf(PhotoTooLargeError);
    expect(big.arrayBuffer).not.toHaveBeenCalled();
  });

  test('reads a web file at exactly the ceiling', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    const file = fakeFile(PHOTO_SIZE_CEILING);
    vi.mocked(chooseFiles).mockResolvedValue([file]);

    expect(await platformImageSource().pickImage('gallery')).toEqual(new Uint8Array([1]));
  });

  test('says too-large for the native refusal the same way', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickImages).mockRejectedValue(new Error('too-large'));

    await expect(platformImageSource().pickImage('gallery')).rejects.toBeInstanceOf(PhotoTooLargeError);
  });

  test('asks the Android picker for one image', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickImages).mockResolvedValue({ tokens: [] });

    await platformImageSource().pickImage('gallery');

    expect(androidPhotos.pickImages).toHaveBeenCalledWith({ multiple: false });
  });
});
