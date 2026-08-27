import { describe, expect, it } from 'vitest';

import { DecryptionFailedError } from '../../crypto/aesGcm.ts';
import { UnsupportedArchiveError } from './container.ts';
import { CorruptArchiveError } from './wire.ts';
import { archiveFailureKind } from './failure.ts';

describe('what went wrong with an archive', () => {
  it('reads a failed authentication tag as a wrong password', () => {
    /* A wrong key and a corrupted file fail AES-GCM identically, so this
       is as specific as the crypto can be (aesGcm.ts) - and saying more
       would help an attacker tell a bad guess from a damaged file. */
    expect(archiveFailureKind(new DecryptionFailedError(new Error('tag')))).toBe('wrong-password');
  });

  it("keeps the container's two refusals apart", () => {
    expect(archiveFailureKind(new UnsupportedArchiveError('newer-version', 'format 9'))).toBe('newer-version');
    expect(archiveFailureKind(new UnsupportedArchiveError('not-an-archive', 'bad magic'))).toBe('not-an-archive');
  });

  it('reads a broken frame as corruption', () => {
    expect(archiveFailureKind(new CorruptArchiveError('short chunk'))).toBe('corrupt');
  });

  it('falls back to the unspecific kind for anything else', () => {
    /* A quota error, a revoked file handle, a bug. The screen has one
       sentence for all of them, because there is nothing useful to say. */
    expect(archiveFailureKind(new Error('disk full'))).toBe('failed');
    expect(archiveFailureKind('not an error at all')).toBe('failed');
    expect(archiveFailureKind(undefined)).toBe('failed');
  });
});
