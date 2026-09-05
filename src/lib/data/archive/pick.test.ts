import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../fileDialog.ts', () => ({
  chooseFiles: vi.fn()
}));

import { chooseFiles } from '../fileDialog.ts';
import { EmptyArchiveFileError, pickArchive } from './pick.ts';

describe('pickArchive', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('asks for the archive extension with a MIME fallback (ticket 66)', async () => {
    vi.mocked(chooseFiles).mockResolvedValue([]);

    await pickArchive();

    expect(vi.mocked(chooseFiles)).toHaveBeenCalledWith('.ttbackup,application/octet-stream');
  });

  test('returns null when nothing was picked', async () => {
    vi.mocked(chooseFiles).mockResolvedValue([]);

    expect(await pickArchive()).toBeNull();
  });

  test('refuses a file with nothing in it', async () => {
    vi.mocked(chooseFiles).mockResolvedValue([new File([], 'empty.ttbackup')]);

    await expect(pickArchive()).rejects.toThrow(EmptyArchiveFileError);
  });

  test('returns the picked file, readable from the start', async () => {
    vi.mocked(chooseFiles).mockResolvedValue([new File([new Uint8Array([1, 2, 3])], 'journal.ttbackup')]);

    const picked = await pickArchive();

    expect(picked?.name).toBe('journal.ttbackup');
    const chunks: Uint8Array[] = [];
    for await (const chunk of picked!.bytes()) chunks.push(chunk);
    expect(chunks).toEqual([new Uint8Array([1, 2, 3])]);
  });
});
