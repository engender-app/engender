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
    captureImage: vi.fn(),
    pickDocument: vi.fn()
  }
}));

import { chooseFiles } from '../fileDialog.ts';
import { isAndroid } from '../../platform.ts';
import { androidPhotos } from './android-bridge.ts';
import { cameraPhotoPicker, documentPicker, filePhotoPicker } from './picker.ts';
import { DocumentRefusedError } from '../documents/accept.ts';
import { DOCUMENT_SIZE_CEILING } from '../documents/limits.ts';

/* A fake File whose arrayBuffer() is a spy: every ceiling test below asserts
   it was never called, which is the acceptance criterion itself - the bytes
   must never enter the JS heap for a refused pick. */
const fakeFile = (size: number, bytes: number[] = [0]): File => {
  const arrayBuffer = vi.fn(async () => new Uint8Array(bytes).buffer);
  return { size, arrayBuffer } as unknown as File;
};

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

  test('refuses a file over the ceiling without reading it', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    const oversized = fakeFile(DOCUMENT_SIZE_CEILING + 1);
    vi.mocked(chooseFiles).mockResolvedValue([oversized]);

    await expect(filePhotoPicker().pick()).rejects.toMatchObject({
      constructor: DocumentRefusedError,
      kind: 'too-large'
    });
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
  });

  test('refuses the whole batch, none read, if any one of several is over the ceiling', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    const fine = fakeFile(1024);
    const oversized = fakeFile(DOCUMENT_SIZE_CEILING + 1);
    vi.mocked(chooseFiles).mockResolvedValue([fine, oversized]);

    await expect(filePhotoPicker().pick()).rejects.toThrow(DocumentRefusedError);
    expect(fine.arrayBuffer).not.toHaveBeenCalled();
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
  });

  test('accepts a file at exactly the ceiling', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    vi.mocked(chooseFiles).mockResolvedValue([fakeFile(DOCUMENT_SIZE_CEILING, [1])]);

    const picked = await filePhotoPicker().pick();

    expect(picked).toEqual([new Uint8Array([1])]);
  });

  test('turns the Android too-large refusal into the same error the web ceiling throws', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickImages).mockRejectedValue(new Error('too-large'));

    await expect(filePhotoPicker().pick()).rejects.toMatchObject({
      constructor: DocumentRefusedError,
      kind: 'too-large'
    });
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

  test('refuses a shot over the ceiling without reading it', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    const oversized = fakeFile(DOCUMENT_SIZE_CEILING + 1);
    vi.mocked(chooseFiles).mockResolvedValue([oversized]);

    await expect(cameraPhotoPicker().pick()).rejects.toMatchObject({
      constructor: DocumentRefusedError,
      kind: 'too-large'
    });
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe('documentPicker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('uses the Android document pick on Android', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickDocument).mockResolvedValue({
      bytes: btoa(String.fromCharCode(1, 2, 3))
    });

    const picked = await documentPicker().pick();

    expect(picked).toEqual([new Uint8Array([1, 2, 3])]);
    expect(vi.mocked(chooseFiles)).not.toHaveBeenCalled();
  });

  test('returns nothing if the Android picker is backed out of', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickDocument).mockResolvedValue({ bytes: null });

    const picked = await documentPicker().pick();

    expect(picked).toEqual([]);
  });

  test('opens the file input for both PDFs and images on the web', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    vi.mocked(chooseFiles).mockResolvedValue([
      {
        arrayBuffer: async () => new Uint8Array([9]).buffer
      }
    ] as File[]);

    const picked = await documentPicker().pick();

    expect(picked).toEqual([new Uint8Array([9])]);
    expect(vi.mocked(chooseFiles)).toHaveBeenCalledWith('application/pdf,image/*');
    expect(vi.mocked(androidPhotos.pickDocument)).not.toHaveBeenCalled();
  });

  test('returns nothing if the web file dialog is dismissed', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    vi.mocked(chooseFiles).mockResolvedValue([]);

    const picked = await documentPicker().pick();

    expect(picked).toEqual([]);
  });

  test('refuses a file over the ceiling without reading it', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    const oversized = fakeFile(DOCUMENT_SIZE_CEILING + 1);
    vi.mocked(chooseFiles).mockResolvedValue([oversized]);

    await expect(documentPicker().pick()).rejects.toMatchObject({
      constructor: DocumentRefusedError,
      kind: 'too-large'
    });
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
  });

  test('accepts a file at exactly the ceiling', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    vi.mocked(chooseFiles).mockResolvedValue([fakeFile(DOCUMENT_SIZE_CEILING, [2])]);

    const picked = await documentPicker().pick();

    expect(picked).toEqual([new Uint8Array([2])]);
  });

  test('turns the Android too-large refusal into the same error the web ceiling throws', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickDocument).mockRejectedValue(new Error('too-large'));

    await expect(documentPicker().pick()).rejects.toMatchObject({
      constructor: DocumentRefusedError,
      kind: 'too-large'
    });
  });
});
