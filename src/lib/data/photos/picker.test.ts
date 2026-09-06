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
    pickDocument: vi.fn(),
    readPickedBase64: vi.fn()
  }
}));

vi.mock('./android-pick-channel.ts', () => ({
  readPickedOverChannel: vi.fn()
}));

import { chooseFiles } from '../fileDialog.ts';
import { isAndroid } from '../../platform.ts';
import { androidPhotos } from './android-bridge.ts';
import { readPickedOverChannel } from './android-pick-channel.ts';
import {
  androidPickedBytes,
  cameraPhotoPicker,
  documentPicker,
  filePhotoPicker
} from './picker.ts';
import { DocumentRefusedError } from '../documents/accept.ts';
import { DOCUMENT_SIZE_CEILING } from '../documents/limits.ts';

/* A fake File whose arrayBuffer() is a spy: every ceiling test below asserts
   it was never called, which is the acceptance criterion itself - the bytes
   must never enter the JS heap for a refused pick. */
const fakeFile = (size: number, bytes: number[] = [0]): File => {
  const arrayBuffer = vi.fn(async () => new Uint8Array(bytes).buffer);
  return { size, arrayBuffer } as unknown as File;
};

/** The channel is there and answers `bytes` for any token - the default
    path on any WebView new enough to carry a structured clone, which is
    what every Android test below but the fallback ones exercises. */
const channelAnswers = (bytes: number[]): void => {
  vi.mocked(readPickedOverChannel).mockImplementation(async () => new Uint8Array(bytes));
};

/** The channel is absent, which is how android-pick-channel.ts reports a
    WebView below the versions that carry it. */
const noChannel = (): void => {
  vi.mocked(readPickedOverChannel).mockReturnValue(null);
};

describe('androidPickedBytes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('takes the bytes over the channel, without a bridge call', async () => {
    channelAnswers([1, 2, 3]);

    expect(await androidPickedBytes('a-token')).toEqual(new Uint8Array([1, 2, 3]));
    expect(vi.mocked(readPickedOverChannel)).toHaveBeenCalledWith('a-token');
    expect(vi.mocked(androidPhotos.readPickedBase64)).not.toHaveBeenCalled();
  });

  /* The floor: below the WebView versions that carry a structured clone the
     channel does not exist, and base64 over the bridge is what is left. */
  test('falls back to the base64 bridge call where the channel does not exist', async () => {
    noChannel();
    vi.mocked(androidPhotos.readPickedBase64).mockResolvedValue({
      base64: btoa(String.fromCharCode(4, 5, 6))
    });

    expect(await androidPickedBytes('a-token')).toEqual(new Uint8Array([4, 5, 6]));
    expect(vi.mocked(androidPhotos.readPickedBase64)).toHaveBeenCalledWith({ token: 'a-token' });
  });
});

describe('filePhotoPicker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('uses Android picker bytes on Android', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickImages).mockResolvedValue({ tokens: ['t1'] });
    channelAnswers([1, 2, 3]);

    const picked = await filePhotoPicker().pick();

    expect(picked).toEqual([new Uint8Array([1, 2, 3])]);
    expect(vi.mocked(chooseFiles)).not.toHaveBeenCalled();
  });

  /* Several photos at the ceiling is the shape this guards: fetched one at
     a time, so the heap holds one file rather than the whole multi-pick. */
  test('fetches a multi-pick one file at a time', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickImages).mockResolvedValue({ tokens: ['t1', 't2'] });
    let inFlight = 0;
    vi.mocked(readPickedOverChannel).mockImplementation(async (token) => {
      expect(inFlight).toBe(0);
      inFlight += 1;
      await Promise.resolve();
      inFlight -= 1;
      return new Uint8Array([token === 't1' ? 1 : 2]);
    });

    expect(await filePhotoPicker().pick()).toEqual([new Uint8Array([1]), new Uint8Array([2])]);
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

  /* The Android ceiling is still refused before anything is read, and now
     that is literally true: the refusal comes back from the pick call, so
     no token is ever handed out to fetch bytes with. */
  test('turns the Android too-large refusal into the same error the web ceiling throws', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickImages).mockRejectedValue(new Error('too-large'));

    await expect(filePhotoPicker().pick()).rejects.toMatchObject({
      constructor: DocumentRefusedError,
      kind: 'too-large'
    });
    expect(vi.mocked(readPickedOverChannel)).not.toHaveBeenCalled();
    expect(vi.mocked(androidPhotos.readPickedBase64)).not.toHaveBeenCalled();
  });
});

describe('cameraPhotoPicker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('uses the Android camera capture bytes on Android', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.captureImage).mockResolvedValue({ token: 'shot' });
    channelAnswers([4, 5, 6]);

    const picked = await cameraPhotoPicker().pick();

    expect(picked).toEqual([new Uint8Array([4, 5, 6])]);
    expect(vi.mocked(chooseFiles)).not.toHaveBeenCalled();
  });

  test('returns nothing if the Android camera is backed out of', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.captureImage).mockResolvedValue({ token: null });

    const picked = await cameraPhotoPicker().pick();

    expect(picked).toEqual([]);
    expect(vi.mocked(readPickedOverChannel)).not.toHaveBeenCalled();
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
    vi.mocked(androidPhotos.pickDocument).mockResolvedValue({ token: 'doc' });
    channelAnswers([1, 2, 3]);

    const picked = await documentPicker().pick();

    expect(picked).toEqual([new Uint8Array([1, 2, 3])]);
    expect(vi.mocked(chooseFiles)).not.toHaveBeenCalled();
  });

  /* The one pick that really reaches the 25 MB ceiling, on the WebViews
     that cannot carry a structured clone: a scan still arrives, over the
     bridge, exactly as it did before this ticket. */
  test('falls back to base64 for a document on a WebView without the channel', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickDocument).mockResolvedValue({ token: 'doc' });
    noChannel();
    vi.mocked(androidPhotos.readPickedBase64).mockResolvedValue({
      base64: btoa(String.fromCharCode(7, 7))
    });

    expect(await documentPicker().pick()).toEqual([new Uint8Array([7, 7])]);
  });

  test('returns nothing if the Android picker is backed out of', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickDocument).mockResolvedValue({ token: null });

    const picked = await documentPicker().pick();

    expect(picked).toEqual([]);
    expect(vi.mocked(readPickedOverChannel)).not.toHaveBeenCalled();
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
