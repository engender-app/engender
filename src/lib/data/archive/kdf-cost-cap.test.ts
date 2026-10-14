import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import * as argon2 from '../../crypto/argon2id.ts';
import { ARCHIVE_ARGON2_PARAMS } from '../../crypto/params.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { emptyArchiveJournal } from '../journal/archiveSections.ts';
import { portablePreferences } from './payload.ts';
import { ARCHIVE_FORMAT_VERSION, CorruptArchiveError, byteReader, collect, readArchiveHeader } from './container.ts';
import { archiveFailureKind } from './failure.ts';
import { openArchive, packArchive } from './pack.ts';

async function* oneShot(bytes: Uint8Array) { yield bytes; }

function header(kdf: typeof ARCHIVE_ARGON2_PARAMS): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify({ kdf, salt: btoa('synthetic-salt-24'),
    chunkSize: 1024, totalChunks: 1 }));
  const bytes = new Uint8Array(12 + json.length);
  bytes.set(new TextEncoder().encode('GDIARY'));
  new DataView(bytes.buffer).setUint16(6, ARCHIVE_FORMAT_VERSION);
  new DataView(bytes.buffer).setUint32(8, json.length);
  bytes.set(json, 12);
  return bytes;
}

test.each([
  ['one KiB above maximum memory', { memorySize: 65537, iterations: 6, parallelism: 1, hashLength: 32 }],
  ['one pass above maximum iterations', { memorySize: 65536, iterations: 7, parallelism: 1, hashLength: 32 }],
  ['a second parallel lane', { memorySize: 65536, iterations: 3, parallelism: 2, hashLength: 32 }],
  ['both cost dimensions doubled', { memorySize: 131072, iterations: 6, parallelism: 1, hashLength: 32 }],
  ['the former accepted sixteen-times profile', { memorySize: 262144, iterations: 12, parallelism: 1, hashLength: 32 }]
])('openArchive refuses %s as corrupt without deriving a key', async (_label, kdf) => {
  const derive = vi.spyOn(argon2, 'deriveKey').mockRejectedValue(new Error('unexpected KDF derivation'));
  try {
    await assert.rejects(openArchive(oneShot(header(kdf)), 'synthetic-password'), (error: unknown) => {
      assert.ok(error instanceof CorruptArchiveError);
      assert.equal(archiveFailureKind(error), 'corrupt');
      return true;
    });
    assert.equal(derive.mock.calls.length, 0);
  } finally { derive.mockRestore(); }
});

test('the released default profile still packs and opens a complete Archive', async () => {
  assert.deepEqual(ARCHIVE_ARGON2_PARAMS, { memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32 });
  const journal = emptyArchiveJournal();
  const preferences = portablePreferences(PREFERENCE_DEFAULTS);
  const packed = await collect(packArchive({ journal, preferences, files: [], readFile: async () => new Uint8Array() },
    'synthetic-default-password'));
  assert.deepEqual((await readArchiveHeader(byteReader(oneShot(packed)))).header.kdf, ARCHIVE_ARGON2_PARAMS);
  const opened = await openArchive(oneShot(packed), 'synthetic-default-password');
  assert.deepEqual(opened.payload.journal, journal);
  assert.deepEqual(opened.payload.preferences, preferences);
  assert.deepEqual(await collect((async function* () {
    for await (const file of opened.files) yield file.bytes;
  })()), new Uint8Array());
});
