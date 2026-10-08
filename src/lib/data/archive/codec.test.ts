import assert from 'node:assert/strict';
import v8 from 'node:v8';
import { runInNewContext } from 'node:vm';
import { DOCUMENT_SIZE_CEILING } from '../documents/limits.ts';
import { test, vi } from 'vitest';
import { byteReader, type ByteReader } from './container.ts';
import { decodeArchive, encodeArchive, type ArchiveCodec } from './codec.ts';
import type { ArchivePayload } from './payload.ts';
import type { ArchiveContents } from './pack.ts';
import { u32 } from './wire.ts';

const payload = (name: string): ArchivePayload =>
  ({ journal: { dimensions: [], presets: [], tagGroups: [], entries: [], milestones: [], labResults: [], sideEffects: [], reminders: [] }, preferences: { name }, files: [] }) as unknown as ArchivePayload;

const emptyContents: ArchiveContents = {
  journal: payload('source').journal,
  preferences: payload('source').preferences,
  files: [],
  readFile: async () => new Uint8Array()
};

test('codec imports first in a fresh module graph and encodes an archive', async () => {
  vi.resetModules();
  const codec = await import('./codec.ts');
  const encoded = await codec.encodeArchive(emptyContents);
  const chunks: Uint8Array[] = [];
  for await (const chunk of encoded.body) chunks.push(chunk);

  assert.equal(encoded.formatVersion, 2);
  assert.equal(chunks.reduce((length, chunk) => length + chunk.length, 0), encoded.bodyLength);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(chunks[1])), {
    journal: emptyContents.journal, preferences: emptyContents.preferences, files: []
  });
});

test('write routing uses the newest registered codec', async () => {
  const called: number[] = [];
  const codecs: readonly ArchiveCodec[] = [
    {
      formatVersion: 1,
      async encode() {
        called.push(1);
        return { bodyLength: 1, body: oneChunk() };
      },
      async decode() {
        return { payload: payload('v1'), files: noFiles() };
      }
    },
    {
      formatVersion: 2,
      async encode() {
        called.push(2);
        return { bodyLength: 2, body: oneChunk() };
      },
      async decode() {
        return { payload: payload('v2'), files: noFiles() };
      }
    }
  ];

  const encoded = await encodeArchive(emptyContents, codecs);

  assert.equal(encoded.formatVersion, 2);
  assert.deepEqual(called, [2]);
});

test('older supported payloads decode through the routed version and migration order', async () => {
  const seen: string[] = [];
  const codecs: readonly ArchiveCodec[] = [
    {
      formatVersion: 1,
      async encode() {
        return { bodyLength: 1, body: oneChunk() };
      },
      async decode(plaintext: ByteReader) {
        seen.push('decode v1');
        const jsonLength = new DataView((await plaintext.readExactly(4)).buffer).getUint32(0);
        const raw = JSON.parse(new TextDecoder().decode(await plaintext.readExactly(jsonLength))) as ArchivePayload;
        return { payload: raw, files: noFiles() };
      }
    },
    {
      formatVersion: 2,
      async encode() {
        return { bodyLength: 1, body: oneChunk() };
      },
      async decode() {
        return { payload: payload('v2'), files: noFiles() };
      }
    },
    {
      formatVersion: 3,
      async encode() {
        return { bodyLength: 1, body: oneChunk() };
      },
      async decode() {
        return { payload: payload('v3'), files: noFiles() };
      }
    }
  ];
  const migrations = [
    (raw: ArchivePayload) => {
      seen.push('v1->v2');
      return payload(`${raw.preferences.name}, then v2`);
    },
    (raw: ArchivePayload) => {
      seen.push('v2->v3');
      return payload(`${raw.preferences.name}, then v3`);
    }
  ];
  const json = new TextEncoder().encode(JSON.stringify(payload('v1')));

  const opened = await decodeArchive(byteReader(oneShot(u32(json.length), json)), 1, codecs, migrations);

  assert.equal(opened.payload.preferences.name, 'v1, then v2, then v3');
  assert.deepEqual(seen, ['decode v1', 'v1->v2', 'v2->v3']);
});

test('an unrouted archive version fails loudly', async () => {
  await assert.rejects(decodeArchive({} as ByteReader, 2, [], []), /unsupported archive format version 2/);
});

async function* oneChunk(): AsyncGenerator<Uint8Array> {
  yield new Uint8Array([1]);
}

async function* oneShot(...chunks: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) yield chunk;
}

async function* noFiles(): AsyncGenerator<{ name: string; bytes: Uint8Array<ArrayBuffer> }> {}

v8.setFlagsFromString('--expose-gc');
const collectGarbage = runInNewContext('gc') as () => void;

for (const count of [16, 32]) {
  test(`batched export retains only one oversized document among ${count}`, async () => {
    const files = Array.from({ length: count }, (_, i) => [
      { name: `document-${i}.pdf`, length: DOCUMENT_SIZE_CEILING },
      { name: `document-${i}-thumb.jpg`, length: 128 }
    ]).flat();
    const calls: string[][] = [];
    const contents: ArchiveContents = {
      ...emptyContents, files,
      async readFiles(names) {
        calls.push(names);
        return names.map((name) => new Uint8Array(files.find((file) => file.name === name)!.length));
      }
    };
    collectGarbage();
    collectGarbage();
    const before = process.memoryUsage().arrayBuffers;
    const { body } = await encodeArchive(contents);
    await body.next();
    await body.next();
    let first = await body.next();
    await Promise.resolve();
    collectGarbage();
    collectGarbage();
    const retained = process.memoryUsage().arrayBuffers - before;
    assert.equal(first.value?.length, DOCUMENT_SIZE_CEILING);
    assert.equal(calls.flat().filter((name) => name.endsWith('.pdf')).length, 1);
    first = { done: true, value: undefined };
    let peak = retained;
    while (!(await body.next()).done) {
      collectGarbage();
      collectGarbage();
      peak = Math.max(peak, process.memoryUsage().arrayBuffers - before);
    }
    console.log(JSON.stringify({ count, documentBytes: DOCUMENT_SIZE_CEILING, retainedArrayBufferBytes: retained, peakArrayBufferBytes: peak }));
    assert.ok(peak < DOCUMENT_SIZE_CEILING + 1024 * 1024, `peak retained ${peak} bytes`);
    assert.ok(retained < DOCUMENT_SIZE_CEILING + 1024 * 1024, `retained ${retained} bytes`);
  });
}

for (const batched of [false, true]) {
  test(`archive preserves file order and content with ${batched ? 'batched' : 'single'} reads`, async () => {
    const files = Array.from({ length: 40 }, (_, i) => ({ name: `photo-${i}`, length: 256 * 1024 }));
    const calls: string[][] = [];
    const readFile = async (name: string) => new Uint8Array(files.find((file) => file.name === name)!.length).fill(files.findIndex((file) => file.name === name));
    const contents = { ...emptyContents, files, readFile, ...(batched ? { readFiles: async (names: string[]) => { calls.push(names); return Promise.all(names.map(readFile)); } } : {}) };
    const encoded = await encodeArchive(contents);
    const opened = await decodeArchive(byteReader(encoded.body), encoded.formatVersion);
    let i = 0;
    for await (const file of opened.files) {
      assert.equal(file.name, files[i].name);
      assert.deepEqual(file.bytes, new Uint8Array(files[i].length).fill(i));
      i++;
    }
    assert.equal(i, files.length);
    if (batched) assert.deepEqual(calls.map((call) => call.length), [16, 16, 8]);
  });
}

for (const failure of ['missing', 'length', 'count', 'read', 'pending-read']) {
  test(`batched archive rejects ${failure} failures`, async () => {
    const files = Array.from({ length: 32 }, (_, i) => ({ name: `file-${i}`, length: 1 }));
    let calls = 0;
    const contents: ArchiveContents = { ...emptyContents, files, async readFiles(names) {
      calls++;
      if (failure === 'read' || (failure === 'pending-read' && calls === 2)) throw new Error('batch failed');
      if (failure === 'count') return [];
      return names.map(() => failure === 'missing' ? null : new Uint8Array(failure === 'length' ? 2 : 1));
    } };
    const { body } = await encodeArchive(contents);
    await assert.rejects(async () => { for await (const _ of body) { await new Promise((resolve) => setTimeout(resolve, 0)); } }, /missing|changed length|returned 0 files|batch failed/);
  });
}

test('current and pending photo batches share the byte bound', async () => {
  const files = Array.from({ length: 40 }, (_, i) => ({ name: `photo-${i}`, length: 1024 * 1024 }));
  const calls: string[][] = [];
  const contents: ArchiveContents = { ...emptyContents, files, async readFiles(names) {
    calls.push(names);
    return names.map(() => new Uint8Array(1024 * 1024));
  } };
  const { body } = await encodeArchive(contents);
  await body.next();
  await body.next();
  await body.next();
  await Promise.resolve();
  assert.deepEqual(calls.map((call) => call.length), [4, 4]);
  await body.return(undefined);
});
