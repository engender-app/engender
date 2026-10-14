import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import * as argon2 from '../../crypto/argon2id';
import { ARCHIVE_FORMAT_VERSION, CorruptArchiveError, UnsupportedArchiveError } from './container';
import { archiveFailureKind } from './failure';
import { openArchive } from './pack';

async function* oneShot(bytes: Uint8Array) { yield bytes; }

function frame(json: unknown, version = ARCHIVE_FORMAT_VERSION): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const bytes = new Uint8Array(12 + encoded.length);
  bytes.set(new TextEncoder().encode('GDIARY'));
  new DataView(bytes.buffer).setUint16(6, version);
  new DataView(bytes.buffer).setUint32(8, encoded.length);
  bytes.set(encoded, 12);
  return bytes;
}

test.each([
  ['null', null], ['true', true], ['false', false], ['zero', 0],
  ['number', 42], ['string', 'header'], ['empty array', []], ['array', [{}]]
])('openArchive classifies a %s header as corrupt before deriving a key', async (_label, json) => {
  const derive = vi.spyOn(argon2, 'deriveKey').mockRejectedValue(new Error('unexpected KDF derivation'));
  try {
    await assert.rejects(openArchive(oneShot(frame(json)), 'synthetic-password'), (error: unknown) => {
      assert.ok(error instanceof CorruptArchiveError);
      assert.equal(archiveFailureKind(error), 'corrupt');
      return true;
    });
    assert.equal(derive.mock.calls.length, 0);
  } finally { derive.mockRestore(); }
});

test('the retained null-header frame is unchanged', () => {
  assert.equal(Buffer.from(frame(null)).toString('hex'), '4744494152590002000000046e756c6c');
});

test.each([
  ['newer-version', ARCHIVE_FORMAT_VERSION + 1], ['not-an-archive', 0]
] as const)('a null header preserves the %s version refusal', async (kind, version) => {
  const derive = vi.spyOn(argon2, 'deriveKey').mockRejectedValue(new Error('unexpected KDF derivation'));
  try {
    await assert.rejects(openArchive(oneShot(frame(null, version)), 'synthetic-password'), (error: unknown) => {
      assert.ok(error instanceof UnsupportedArchiveError);
      assert.equal(archiveFailureKind(error), kind);
      return true;
    });
    assert.equal(derive.mock.calls.length, 0);
  } finally { derive.mockRestore(); }
});
