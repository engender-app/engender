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
    readPickedChunk: vi.fn(),
    reopenPicked: vi.fn()
  }
}));

vi.mock('./android-pick-channel.ts', () => ({
  readPickedOverChannel: vi.fn()
}));

import { chooseFiles } from '../fileDialog.ts';
import { isAndroid } from '../../platform.ts';
import { androidPhotos } from './android-bridge.ts';
import { PhotoChannelTimeoutError } from './channel-timeout';
import { readPickedOverChannel } from './android-pick-channel.ts';
import {
  PickDeferredError,
  androidPickedBytes,
  cameraPhotoPicker,
  documentPicker,
  filePhotoPicker
} from './picker.ts';
import { DocumentRefusedError } from '../documents/accept.ts';
import { PHOTO_SIZE_CEILING, PhotoTooLargeError } from './limits';
import { DOCUMENT_SIZE_CEILING } from '../documents/limits.ts';
import { MAX_PICK_BYTES, MAX_PICK_COUNT, MediaBudgetError } from '../media/budget';

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

/** The channel is absent and the bridge walks a picked file in pieces, one
    per call, saying so on the last - which is the shape
    PhotosPlugin.readPickedChunk answers in. */
const bridgeAnswers = (chunks: number[][]): void => {
  noChannel();
  let next = 0;
  vi.mocked(androidPhotos.readPickedChunk).mockImplementation(async () => {
    const chunk = chunks[next];
    next += 1;
    return { base64: btoa(String.fromCharCode(...chunk)), done: next === chunks.length };
  });
};

/** Every reader a selection picker handed back, called in order. */
const readAll = async (readers: Array<() => Promise<Uint8Array>>): Promise<Uint8Array[]> => {
  const bytes: Uint8Array[] = [];
  for (const read of readers) bytes.push(await read());
  return bytes;
};

describe('androidPickedBytes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('takes the bytes over the channel, without a bridge call', async () => {
    channelAnswers([1, 2, 3]);

    expect(await androidPickedBytes('a-token')).toEqual(new Uint8Array([1, 2, 3]));
    expect(vi.mocked(readPickedOverChannel)).toHaveBeenCalledWith('a-token');
    expect(vi.mocked(androidPhotos.readPickedChunk)).not.toHaveBeenCalled();
  });

  /* The floor: below the WebView versions that carry a structured clone the
     channel does not exist, and base64 over the bridge is what is left. */
  test('falls back to the base64 bridge call where the channel does not exist', async () => {
    bridgeAnswers([[4, 5, 6]]);

    expect(await androidPickedBytes('a-token')).toEqual(new Uint8Array([4, 5, 6]));
    expect(vi.mocked(androidPhotos.readPickedChunk)).toHaveBeenCalledWith({ token: 'a-token' });
  });

  /* The fallback's whole point after a 25 MB scan crosses as several bounded strings rather
     than one 34 MB allocation, so what arrives has to be the pieces in the order they came. */
  test('joins the fallback chunks in the order the bridge answered them', async () => {
    bridgeAnswers([
      [1, 2],
      [3, 4],
      [5]
    ]);

    expect(await androidPickedBytes('a-token')).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  /* `done` is what ends the loop, not an empty chunk: native ends a file
     that divides evenly by its buffer on an empty last piece, and a reader
     that stopped at the first short one would truncate every other file. */
  test('asks for chunks until the bridge says the file is finished', async () => {
    bridgeAnswers([[1, 2], [3], []]);

    expect(await androidPickedBytes('a-token')).toEqual(new Uint8Array([1, 2, 3]));
    expect(vi.mocked(androidPhotos.readPickedChunk)).toHaveBeenCalledTimes(3);
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

    const picked = await readAll(await filePhotoPicker().pick());

    expect(picked).toEqual([new Uint8Array([1, 2, 3])]);
    expect(vi.mocked(chooseFiles)).not.toHaveBeenCalled();
  });

  /* The web picks several photos in one trip, and Android now does too: the system picker
     is asked for more than one. */
  test('asks the Android picker for several photos, as the web does', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickImages).mockResolvedValue({ tokens: [] });

    await filePhotoPicker().pick();

    expect(vi.mocked(androidPhotos.pickImages)).toHaveBeenCalledWith({ multiple: true });
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

    expect(await readAll(await filePhotoPicker().pick())).toEqual([new Uint8Array([1]), new Uint8Array([2])]);
  });

  test('uses file input picker on web', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    vi.mocked(chooseFiles).mockResolvedValue([
      {
        arrayBuffer: async () => new Uint8Array([9, 8]).buffer
      }
    ] as File[]);

    const picked = await readAll(await filePhotoPicker().pick());

    expect(picked).toEqual([new Uint8Array([9, 8])]);
    expect(vi.mocked(androidPhotos.pickImages)).not.toHaveBeenCalled();
  });

  test('refuses a file over the ceiling without reading it', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    const oversized = fakeFile(PHOTO_SIZE_CEILING + 1);
    vi.mocked(chooseFiles).mockResolvedValue([oversized]);

    await expect(filePhotoPicker().pick()).rejects.toMatchObject({
      constructor: PhotoTooLargeError,
    });
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
  });

  test('refuses the whole batch, none read, if any one of several is over the ceiling', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    const fine = fakeFile(1024);
    const oversized = fakeFile(PHOTO_SIZE_CEILING + 1);
    vi.mocked(chooseFiles).mockResolvedValue([fine, oversized]);

    await expect(filePhotoPicker().pick()).rejects.toThrow(PhotoTooLargeError);
    expect(fine.arrayBuffer).not.toHaveBeenCalled();
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
  });

  test('accepts a file at exactly the ceiling', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    vi.mocked(chooseFiles).mockResolvedValue([fakeFile(PHOTO_SIZE_CEILING, [1])]);

    const picked = await readAll(await filePhotoPicker().pick());

    expect(picked).toEqual([new Uint8Array([1])]);
  });

  /* The Android ceiling is still refused before anything is read, and now
     that is literally true: the refusal comes back from the pick call, so
     no token is ever handed out to fetch bytes with. */
  test('turns the Android too-large refusal into the same error the web ceiling throws', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickImages).mockRejectedValue(new Error('too-large'));

    await expect(filePhotoPicker().pick()).rejects.toMatchObject({
      constructor: PhotoTooLargeError,
    });
    expect(vi.mocked(readPickedOverChannel)).not.toHaveBeenCalled();
    expect(vi.mocked(androidPhotos.readPickedChunk)).not.toHaveBeenCalled();
  });
});

/* The ceiling per file left the count and the total open, and every selected file's bytes
   were held at once. */
describe('filePhotoPicker selection budget', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('refuses a selection over the count budget before any file is read', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    const files = Array.from({ length: MAX_PICK_COUNT + 1 }, () => fakeFile(1024));
    vi.mocked(chooseFiles).mockResolvedValue(files);

    await expect(filePhotoPicker().pick()).rejects.toBeInstanceOf(MediaBudgetError);
    for (const file of files) expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  test('refuses a selection over the total-bytes budget before any file is read', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    const each = PHOTO_SIZE_CEILING;
    const files = Array.from({ length: Math.floor(MAX_PICK_BYTES / each) + 1 }, () => fakeFile(each));
    vi.mocked(chooseFiles).mockResolvedValue(files);

    await expect(filePhotoPicker().pick()).rejects.toBeInstanceOf(MediaBudgetError);
    for (const file of files) expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  test('refuses an Android selection over the count budget before any token is read', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickImages).mockResolvedValue({
      tokens: Array.from({ length: MAX_PICK_COUNT + 1 }, (_, i) => `t${i}`)
    });
    channelAnswers([1]);

    await expect(filePhotoPicker().pick()).rejects.toBeInstanceOf(MediaBudgetError);
    expect(vi.mocked(readPickedOverChannel)).not.toHaveBeenCalled();
  });

  test('a selection of exactly the count budget is accepted', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    vi.mocked(chooseFiles).mockResolvedValue(Array.from({ length: MAX_PICK_COUNT }, () => fakeFile(1024)));

    const picked = await filePhotoPicker().pick();

    expect(picked).toHaveLength(MAX_PICK_COUNT);
  });

  test('reads nothing until a file is asked for, and one at a time', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    const [a, b] = [fakeFile(10, [1]), fakeFile(10, [2])];
    vi.mocked(chooseFiles).mockResolvedValue([a, b]);

    const picked = await filePhotoPicker().pick();

    expect(a.arrayBuffer).not.toHaveBeenCalled();
    expect(b.arrayBuffer).not.toHaveBeenCalled();
    expect(await picked[0]()).toEqual(new Uint8Array([1]));
    expect(b.arrayBuffer).not.toHaveBeenCalled();
  });

  test('asks the web file input for one photo when single selection is asked for', async () => {
    vi.mocked(isAndroid).mockReturnValue(false);
    vi.mocked(chooseFiles).mockResolvedValue([]);

    await filePhotoPicker().pick({ multiple: false });

    expect(vi.mocked(chooseFiles)).toHaveBeenCalledWith('image/*', { multiple: false });
  });

  test('asks the Android picker for one photo when single selection is asked for', async () => {
    vi.mocked(isAndroid).mockReturnValue(true);
    vi.mocked(androidPhotos.pickImages).mockResolvedValue({ tokens: [] });

    await filePhotoPicker().pick({ multiple: false });

    expect(vi.mocked(androidPhotos.pickImages)).toHaveBeenCalledWith({ multiple: false });
  });
});

test('a 45 MiB photo passes the raw photo ceiling before normalization', async () => {
  vi.resetAllMocks();
  vi.mocked(isAndroid).mockReturnValue(false);
  const file = fakeFile(45 * 1024 * 1024, [137, 80, 78, 71]);
  vi.mocked(chooseFiles).mockResolvedValue([file]);
  expect(await readAll(await filePhotoPicker().pick())).toEqual([new Uint8Array([137, 80, 78, 71])]);
  expect(file.arrayBuffer).toHaveBeenCalledOnce();
});

test('an unknown-size Android photo refused during reading keeps photo wording', async () => {
  vi.resetAllMocks();
  vi.mocked(isAndroid).mockReturnValue(true);
  vi.mocked(androidPhotos.pickImages).mockResolvedValue({ tokens: ['unknown-size'] });
  vi.mocked(readPickedOverChannel).mockRejectedValue(new Error('too-large'));
  const [read] = await filePhotoPicker().pick();
  await expect(read()).rejects.toThrow(PhotoTooLargeError);
});

test('an unknown-size Android document refused during reading keeps document wording', async () => {
  vi.resetAllMocks();
  vi.mocked(isAndroid).mockReturnValue(true);
  vi.mocked(androidPhotos.pickDocument).mockResolvedValue({ token: 'unknown-size' });
  vi.mocked(readPickedOverChannel).mockRejectedValue(new Error('too-large'));
  await expect(documentPicker().pick()).rejects.toMatchObject({ constructor: DocumentRefusedError, kind: 'too-large' });
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
    const oversized = fakeFile(PHOTO_SIZE_CEILING + 1);
    vi.mocked(chooseFiles).mockResolvedValue([oversized]);

    await expect(cameraPhotoPicker().pick()).rejects.toMatchObject({
      constructor: PhotoTooLargeError,
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
    bridgeAnswers([[7], [7]]);

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


test('a stalled pick channel falls back to chunked reads of the same token', async () => {
  bridgeAnswers([[4, 5, 6]]);
  vi.mocked(readPickedOverChannel).mockReturnValue(Promise.reject(new PhotoChannelTimeoutError('pick')));
  expect(await androidPickedBytes('stalled')).toEqual(new Uint8Array([4, 5, 6]));
  expect(androidPhotos.readPickedChunk).toHaveBeenCalledWith({ token: 'stalled' });
});

test('a native pick failure propagates without trying the fallback', async () => {
  vi.mocked(androidPhotos.readPickedChunk).mockClear();
  vi.mocked(readPickedOverChannel).mockReturnValue(Promise.reject(new Error('read failed')));
  await expect(androidPickedBytes('broken')).rejects.toThrow('read failed');
  expect(androidPhotos.readPickedChunk).not.toHaveBeenCalled();
});

/* A pick that comes back while the app is locked must not be read into the
   page: the locked route is gone, and the bytes would be journal content the
   lock is meant to leave nowhere in the page. The tokens are all that is kept. */
describe('a pick that returns while the app is locked', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isAndroid).mockReturnValue(true);
    channelAnswers([1, 2, 3]);
  });

  test.each([
    ['photos', () => filePhotoPicker({ deferIf: () => true }), () => vi.mocked(androidPhotos.pickImages).mockResolvedValue({ tokens: ['a', 'b'] }), ['a', 'b']],
    ['the camera', () => cameraPhotoPicker({ deferIf: () => true }), () => vi.mocked(androidPhotos.captureImage).mockResolvedValue({ token: 'c' }), ['c']],
    ['a document', () => documentPicker({ deferIf: () => true }), () => vi.mocked(androidPhotos.pickDocument).mockResolvedValue({ token: 'd' }), ['d']]
  ] as const)('keeps only the tokens of %s', async (_name, make, answer, tokens) => {
    answer();

    const error = await make().pick().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PickDeferredError);
    expect((error as PickDeferredError).tokens).toEqual(tokens);
    expect(vi.mocked(readPickedOverChannel)).not.toHaveBeenCalled();
    expect(vi.mocked(androidPhotos.readPickedChunk)).not.toHaveBeenCalled();
  });

  test('reads as before while unlocked', async () => {
    vi.mocked(androidPhotos.captureImage).mockResolvedValue({ token: 'c' });

    expect(await cameraPhotoPicker({ deferIf: () => false }).pick()).toEqual([new Uint8Array([1, 2, 3])]);
  });

  test('a backed-out pick has nothing to keep', async () => {
    vi.mocked(androidPhotos.captureImage).mockResolvedValue({ token: null });

    expect(await cameraPhotoPicker({ deferIf: () => true }).pick()).toEqual([]);
  });
});

/* The lock can land after the native answer and before the screen gets the
   bytes (the grace ran out, so the page locks as the person returns). The bytes
   must not go to a screen about to unmount: native gives the file back under
   the same token and the page keeps only the token. */
describe('a lock that lands while the picked file is being read', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isAndroid).mockReturnValue(true);
    channelAnswers([1, 2, 3]);
    vi.mocked(androidPhotos.reopenPicked).mockResolvedValue({ reopened: true });
  });

  const flipsAfterTheAnswer = () => {
    let asked = 0;
    return () => ++asked > 1;
  };

  /** What a pick ends in: its error, from the pick itself or from reading a
      lazy photo selection's files one after another. */
  const outcome = async (pick: () => Promise<unknown>) => {
    try {
      const picked = await pick();
      if (Array.isArray(picked)) for (const read of picked) if (typeof read === 'function') await read();
      return picked;
    } catch (caught: unknown) {
      return caught;
    }
  };

  test.each([
    ['photos', (deferIf: () => boolean) => filePhotoPicker({ deferIf }), () => vi.mocked(androidPhotos.pickImages).mockResolvedValue({ tokens: ['a', 'b'] }), ['a', 'b'], ['a']],
    ['the camera', (deferIf: () => boolean) => cameraPhotoPicker({ deferIf }), () => vi.mocked(androidPhotos.captureImage).mockResolvedValue({ token: 'c' }), ['c'], ['c']],
    ['a document', (deferIf: () => boolean) => documentPicker({ deferIf }), () => vi.mocked(androidPhotos.pickDocument).mockResolvedValue({ token: 'd' }), ['d'], ['d']]
  ] as const)('hands %s back to native and keeps only the tokens', async (_name, make, answer, tokens, read) => {
    answer();

    const error = await outcome(() => make(flipsAfterTheAnswer()).pick());

    expect(error).toBeInstanceOf(PickDeferredError);
    expect((error as PickDeferredError).tokens).toEqual(tokens);
    for (const token of read) expect(vi.mocked(androidPhotos.reopenPicked)).toHaveBeenCalledWith({ token });
    expect(vi.mocked(androidPhotos.reopenPicked)).toHaveBeenCalledTimes(read.length);
  });

  test('a lock that lands after the first of several files stops the reading and defers them all', async () => {
    vi.mocked(androidPhotos.pickImages).mockResolvedValue({ tokens: ['a', 'b', 'c'] });
    let asked = 0;

    const error = await outcome(() => filePhotoPicker({ deferIf: () => ++asked > 2 }).pick());

    expect(error).toBeInstanceOf(PickDeferredError);
    expect((error as PickDeferredError).tokens).toEqual(['a', 'b', 'c']);
    expect(vi.mocked(readPickedOverChannel)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(androidPhotos.reopenPicked)).toHaveBeenCalledTimes(2);
  });

  test('a token native can no longer redeem is reported lost, not deferred', async () => {
    vi.mocked(androidPhotos.captureImage).mockResolvedValue({ token: 'c' });
    vi.mocked(androidPhotos.reopenPicked).mockResolvedValue({ reopened: false });
    let asked = 0;

    const error = await cameraPhotoPicker({ deferIf: () => ++asked > 1 }).pick().catch((caught: unknown) => caught);

    expect(error).not.toBeInstanceOf(PickDeferredError);
    expect((error as Error).message).toBe('picked-file-lost');
  });

  test('a lock that never lands hands the bytes over as before', async () => {
    vi.mocked(androidPhotos.captureImage).mockResolvedValue({ token: 'c' });

    expect(await cameraPhotoPicker({ deferIf: () => false }).pick()).toEqual([new Uint8Array([1, 2, 3])]);
    expect(vi.mocked(androidPhotos.reopenPicked)).not.toHaveBeenCalled();
  });
});

/* The last place the lock can land: after the bytes were read and while the
   screen's own normalizing runs. The caller asks once more before it hands the
   result to the screen; if the app locked, the files go back to native. */
describe('a lock that lands while the picked photo is being normalized', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isAndroid).mockReturnValue(true);
    channelAnswers([1, 2, 3]);
    vi.mocked(androidPhotos.reopenPicked).mockResolvedValue({ reopened: true });
  });

  test('recheck hands the files of the last pick back and defers it', async () => {
    vi.mocked(androidPhotos.captureImage).mockResolvedValue({ token: 'c' });
    let locked = false;
    const camera = cameraPhotoPicker({ deferIf: () => locked });
    expect(await camera.pick()).toEqual([new Uint8Array([1, 2, 3])]);

    locked = true;
    const error = await camera.recheck!().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PickDeferredError);
    expect((error as PickDeferredError).tokens).toEqual(['c']);
    expect(vi.mocked(androidPhotos.reopenPicked)).toHaveBeenCalledWith({ token: 'c' });
  });

  test('recheck does nothing while unlocked, and only once per pick', async () => {
    vi.mocked(androidPhotos.captureImage).mockResolvedValue({ token: 'c' });
    const camera = cameraPhotoPicker({ deferIf: () => false });
    await camera.pick();

    await camera.recheck!();
    expect(vi.mocked(androidPhotos.reopenPicked)).not.toHaveBeenCalled();
  });
});
