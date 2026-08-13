import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ByteReader } from './container.ts';
import { decodeArchive, encodeArchive, type ArchiveCodec } from './codec.ts';
import type { ArchivePayload } from './payload.ts';
import type { ArchiveContents } from './pack.ts';

const payload = (name: string): ArchivePayload =>
  ({ journal: { dimensions: [], presets: [], tagGroups: [], entries: [], milestones: [], labResults: [], reminders: [] }, preferences: { name }, files: [] }) as unknown as ArchivePayload;

const emptyContents: ArchiveContents = {
  journal: payload('source').journal,
  preferences: payload('source').preferences,
  files: [],
  readFile: async () => new Uint8Array()
};

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

test('read routing decodes at the archive version then walks migrations in order', async () => {
  const seen: string[] = [];
  const codecs: readonly ArchiveCodec[] = [
    {
      formatVersion: 1,
      async encode() {
        return { bodyLength: 1, body: oneChunk() };
      },
      async decode(_plaintext: ByteReader) {
        seen.push('decode v1');
        return { payload: payload('v1'), files: noFiles() };
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

  const opened = await decodeArchive({} as ByteReader, 1, codecs, migrations);

  assert.equal(opened.payload.preferences.name, 'v1, then v2, then v3');
  assert.deepEqual(seen, ['decode v1', 'v1->v2', 'v2->v3']);
});

test('an unrouted archive version fails loudly', async () => {
  await assert.rejects(decodeArchive({} as ByteReader, 2, [], []), /unsupported archive format version 2/);
});

async function* oneChunk(): AsyncGenerator<Uint8Array> {
  yield new Uint8Array([1]);
}

async function* noFiles(): AsyncGenerator<{ name: string; bytes: Uint8Array<ArrayBuffer> }> {}