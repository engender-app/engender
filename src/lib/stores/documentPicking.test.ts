import { beforeEach, describe, expect, test, vi } from 'vitest';

const { pick, acceptDocumentFile, toast, FakeUnsupportedImageError, FakeDocumentRefusedError } = vi.hoisted(() => {
  class FakeUnsupportedImageError extends Error {
    readonly kind: 'heic' | 'unreadable';
    constructor(kind: 'heic' | 'unreadable') {
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
    pick: vi.fn(),
    acceptDocumentFile: vi.fn(),
    toast: vi.fn(),
    FakeUnsupportedImageError,
    FakeDocumentRefusedError
  };
});

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    document_picker_failed: () => 'picker-failed',
    photo_heic: () => 'heic',
    document_too_large: () => 'too-large',
    document_unsupported_file: () => 'unsupported'
  }
}));
vi.mock('./toasts.svelte', () => ({ toast }));
vi.mock('../data/documents/accept', () => ({
  acceptDocumentFile,
  DocumentRefusedError: FakeDocumentRefusedError
}));
vi.mock('../data/photos/normalize', () => ({
  UnsupportedImageError: FakeUnsupportedImageError
}));
vi.mock('../data/photos/picker', () => ({
  documentPicker: () => ({ pick })
}));

import { pickDocument } from './documentPicking';

const ACCEPTED = { pdfBytes: new Uint8Array([1]), thumb: null };

describe('pickDocument', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('accepts the one file the picker returns, whichever platform answered', async () => {
    pick.mockResolvedValue([new Uint8Array([9, 9])]);
    acceptDocumentFile.mockResolvedValue(ACCEPTED);

    const picked = await pickDocument();

    expect(picked).toBe(ACCEPTED);
    expect(acceptDocumentFile).toHaveBeenCalledWith(new Uint8Array([9, 9]));
    expect(toast).not.toHaveBeenCalled();
  });

  test('is null if the picker is backed out of, without toasting', async () => {
    pick.mockResolvedValue([]);

    const picked = await pickDocument();

    expect(picked).toBeNull();
    expect(acceptDocumentFile).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  test('toasts and returns null if the picker itself fails - a refused URI included', async () => {
    // Same shape as an Android URI the content provider will not open:
    // the native side rejects the call, this never throws past pickDocument.
    pick.mockRejectedValue(new Error('could not read selected file'));

    const picked = await pickDocument();

    expect(picked).toBeNull();
    expect(toast).toHaveBeenCalledWith('picker-failed');
  });

  test('toasts the HEIC message and returns null for an unreadable HEIC file', async () => {
    pick.mockResolvedValue([new Uint8Array([9])]);
    acceptDocumentFile.mockRejectedValue(new FakeUnsupportedImageError('heic'));

    const picked = await pickDocument();

    expect(picked).toBeNull();
    expect(toast).toHaveBeenCalledWith('heic');
  });

  test('toasts the too-large message and returns null for an oversized file', async () => {
    pick.mockResolvedValue([new Uint8Array([9])]);
    acceptDocumentFile.mockRejectedValue(new FakeDocumentRefusedError('too-large'));

    const picked = await pickDocument();

    expect(picked).toBeNull();
    expect(toast).toHaveBeenCalledWith('too-large');
  });

  test('toasts the unsupported message and returns null for anything else refused', async () => {
    pick.mockResolvedValue([new Uint8Array([9])]);
    acceptDocumentFile.mockRejectedValue(new FakeDocumentRefusedError('unsupported'));

    const picked = await pickDocument();

    expect(picked).toBeNull();
    expect(toast).toHaveBeenCalledWith('unsupported');
  });
});
