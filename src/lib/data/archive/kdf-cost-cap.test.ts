import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import * as argon2 from '../../crypto/argon2id.ts';
import { ARCHIVE_ARGON2_PARAMS } from '../../crypto/params.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { emptyArchiveJournal } from '../journal/archiveSections.ts';
import { portablePreferences } from './payload.ts';
import { ARCHIVE_FORMAT_VERSION, CHUNK_SIZE, CorruptArchiveError, byteReader, collect, readArchiveHeader } from './container.ts';
import { archiveFailureKind } from './failure.ts';
import { openArchive, packArchive } from './pack.ts';

async function* oneShot(bytes: Uint8Array) { yield bytes; }

function header(kdf: typeof ARCHIVE_ARGON2_PARAMS): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify({ kdf, salt: btoa('synthetic-salt-24'),
    chunkSize: CHUNK_SIZE, totalChunks: 1 }));
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
  ['the 512 MiB, 24-pass profile the old ceilings allowed', { memorySize: 524288, iterations: 24, parallelism: 1, hashLength: 32 }],
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('hash-wasm');
  vi.resetModules();
});

test('a header at the KDF ceiling with an empty body never reaches the main-thread fallback when the worker fails', async () => {
  const hashWasm = vi.fn(async () => { throw new Error('hash-wasm must not run on the main thread for a header'); });
  vi.resetModules();
  vi.doMock('hash-wasm', () => ({ argon2id: hashWasm }));
  vi.stubGlobal('Worker', class {
    onmessage: unknown = null;
    onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
    terminate = vi.fn();
    postMessage() { queueMicrotask(() => this.onerror?.({ message: 'chunk 404', preventDefault() {} })); }
  });
  const { openArchive: open } = await import('./pack.ts');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await assert.rejects(open(oneShot(header({ memorySize: 65536, iterations: 6, parallelism: 1, hashLength: 32 })), 'synthetic-password'));
    assert.equal(hashWasm.mock.calls.length, 0);
  } finally { warn.mockRestore(); }
});

/* Every KDF profile the app has written. Only one: ARCHIVE_ARGON2_PARAMS has
   not changed since the first archive (git log -S on params.ts), and the
   other numbers in that file belong to keystores, never to a .ttbackup. The
   rc.1 file is a real export from a release build; each format version the
   app wrote must still pass the import budget with that profile. */
test.each([1, 2])('the released KDF profile still passes the import budget under format version %i', async (version) => {
  const json = new TextEncoder().encode(JSON.stringify({ kdf: ARCHIVE_ARGON2_PARAMS, salt: btoa('synthetic-salt-24'),
    chunkSize: CHUNK_SIZE, totalChunks: 8192 }));
  const bytes = new Uint8Array(12 + json.length);
  bytes.set(new TextEncoder().encode('GDIARY'));
  new DataView(bytes.buffer).setUint16(6, version);
  new DataView(bytes.buffer).setUint32(8, json.length);
  bytes.set(json, 12);
  assert.deepEqual((await readArchiveHeader(byteReader(oneShot(bytes)))).header.kdf, ARCHIVE_ARGON2_PARAMS);
});

test('the rc.1 release fixture header carries the released profile and 1 MiB chunks', async () => {
  const { readFileSync } = await import('node:fs');
  const bytes = new Uint8Array(readFileSync(new URL('../../../../fixtures/released/1.0.0-rc.1/archive.ttbackup', import.meta.url)));
  const { header } = await readArchiveHeader(byteReader(oneShot(bytes)));
  assert.deepEqual(header.kdf, ARCHIVE_ARGON2_PARAMS);
  assert.equal(header.chunkSize, CHUNK_SIZE);
});
