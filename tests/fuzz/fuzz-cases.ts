/* The retained testing-11 targets, corpora and outcome invariants.
   child.mjs loads real source modules unchanged through Vite SSR. */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { StatementSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

import { openArchive } from '../../src/lib/data/archive/pack.ts';
import { CHUNK_SIZE, chunkCountFor, collect, frameArchive, UnsupportedArchiveError } from '../../src/lib/data/archive/container.ts';
import { CorruptArchiveError } from '../../src/lib/data/archive/wire.ts';
import { archiveFailureKind } from '../../src/lib/data/archive/failure.ts';
import { DecryptionFailedError } from '../../src/lib/crypto/aesGcm.ts';
import { deriveKey, randomSalt } from '../../src/lib/crypto/argon2id.ts';
import { verifyArchive } from '../../src/lib/data/journal/restore.ts';
import { readFileOwnership } from '../../src/lib/data/journal/fileOwnership.ts';
import { sweepOrphanPhotos } from '../../src/lib/data/journal/photos.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { seedCompleteArchiveJournal } from '../../src/lib/data/journal/test-support/complete-archive-journal.ts';
import { archivePath, bytes as textBytes, CHEAP_KDF, GOLDEN_PASSWORD, oneShot } from '../../src/lib/data/journal/golden-archive-fixture.ts';
import { fakeFileStore, type FakeFileStore } from '../../src/lib/data/photos/test-support/fake-file-store.ts';
import { migratedDb } from '../../src/lib/data/sqlite/test-support/migrated-db.ts';
import { makeDaylioBackup } from '../../src/lib/data/archive/test-support/daylio-backup.ts';
import { makeDayOneExport } from '../../src/lib/data/archive/test-support/dayone.ts';
import { DaylioCsvError } from '../../src/lib/data/archive/daylio.ts';
import { DaylioBackupError, detectDaylioBackup } from '../../src/lib/data/archive/daylioBackup.ts';
import { DayOneImportError, detectDayOne } from '../../src/lib/data/archive/dayone.ts';
import { TransTracksBackupError, detectTransTracks } from '../../src/lib/data/archive/transtracks.ts';
import { TrackAndGraphCsvError, detectTrackAndGraph } from '../../src/lib/data/archive/trackAndGraph.ts';
import { PixelsBackupError, detectPixels } from '../../src/lib/data/archive/pixels.ts';
import { detectDaylio } from '../../src/lib/data/archive/daylio.ts';
import { ZipTooLargeError } from '../../src/lib/data/archive/zipReader.ts';
import { UnrecognizedArchiveSourceError, recognizeSource } from '../../src/lib/data/archive/sources.ts';
import { isPdf } from '../../src/lib/data/documents/bytes.ts';
import { isHeic } from '../../src/lib/data/photos/bytes.ts';

import {
  BYTE_MUTATIONS, JSON_MUTATIONS, TEXT_MUTATIONS, ZIP_MUTATIONS, concat, fnv1a, inflateAt, int,
  mapZipMember, mulberry32, mutate, mutateJsonValue, pick, weighted,
  type Mutation, type Rng
} from './fuzz-lib.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const fixture = (name: string) => new Uint8Array(readFileSync(here(`../../src/lib/data/archive/fixtures/${name}`)));

/* ------------------------------------------------------------------ */
/* Outcomes                                                            */

export type OutcomeKind =
  | 'typed' // refused with a typed failure; journal untouched
  | 'accepted' // imported; integrity checks pass
  | 'guard' // refused by the UI-level guard the real flow runs before commit (unmapped mood)
  | 'untyped' // refused with an error that is not a typed failure
  | 'state-changed' // refused, but rows or content hash changed
  | 'invariant' // accepted, but integrity_check / foreign_key_check complained
  | 'async-hang'
  | 'prototype-polluted'
  | 'unsafe-file-name'
  | 'orphans-survive-sweep'
  | 'unreadable-after-import'
  | 'detect-threw';

export interface Outcome {
  kind: OutcomeKind;
  sig: string;
  errName?: string;
  errMsg?: string;
  filesLeft?: string[];
  ms: number;
}

const TYPED = [
  DecryptionFailedError, UnsupportedArchiveError, CorruptArchiveError,
  DaylioCsvError, DaylioBackupError, DayOneImportError, TransTracksBackupError,
  TrackAndGraphCsvError, PixelsBackupError, ZipTooLargeError, UnrecognizedArchiveSourceError
];

function typed(error: unknown): boolean {
  return TYPED.some((C) => error instanceof C);
}

export function signature(error: unknown): string {
  const e = error as Error;
  const name = e?.name ?? typeof error;
  const msg = String(e?.message ?? error).replace(/[0-9]+/g, '#').replace(/"[^"]*"/g, '"…"').slice(0, 90);
  const frame = (e?.stack ?? '').split('\n').find((l) => l.includes('/src/') || l.includes('node_modules/fflate'));
  const where = frame ? frame.trim().replace(/^at /, '').replace(/.*\/src\//, 'src/').replace(/:\d+\)?$/, '') : '';
  return `${name}: ${msg} @ ${where}`;
}

/* ------------------------------------------------------------------ */
/* Fresh journal and its fingerprint                                   */

export interface Device {
  driver: any;
  raw: import('node:sqlite').DatabaseSync;
  journal: Awaited<ReturnType<typeof openJournal>>;
  files: FakeFileStore;
}

/** The real stores refuse these names (OPFS cannot hold a '/', PhotoFiles.fileFor
    throws on '/', backslash, '..' and empty); the fake accepts anything, so wrap it. */
function androidRuleStore(store: FakeFileStore): FakeFileStore {
  const check = (name: string) => {
    const t = name.trim();
    if (!t || t.includes('/') || t.includes('\\') || t.includes('..')) throw new Error('invalid photo file name');
  };
  return { ...store, write: async (n, b) => { check(n); return store.write(n, b); } } as FakeFileStore;
}

export async function freshDevice(): Promise<Device> {
  const db = await migratedDb();
  const files = androidRuleStore(fakeFileStore());
  const journal = openJournal(db, files);
  // Reuse seed statements within this fresh connection; import calls use the unmodified driver.
  const prepare = db.raw.prepare;
  const statements = new Map<string, StatementSync>();
  db.raw.prepare = function (sql: string) {
    let statement = statements.get(sql);
    if (!statement) {
      statement = prepare.call(this, sql);
      statements.set(sql, statement);
    }
    return statement;
  };
  try { await seedCompleteArchiveJournal(db, journal, textBytes); }
  finally { db.raw.prepare = prepare; }
  return { driver: db, raw: (db as any).raw, journal, files };
}

function cell(v: unknown): string {
  if (v instanceof Uint8Array) return 'x' + Buffer.from(v).toString('hex');
  if (typeof v === 'bigint') return v.toString() + 'n';
  return JSON.stringify(v);
}

/** Row counts per table and one hash over every row of every table, plus the file store. */
export async function fingerprint(d: Device): Promise<{ counts: Record<string, number>; hash: string; files: string; fileHash: string }> {
  const tables = (d.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  const hash = createHash('sha256');
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const stmt = d.raw.prepare(`SELECT * FROM "${t}"`);
    stmt.setReadBigInts(true);
    const rows = stmt.all() as Record<string, unknown>[];
    counts[t] = rows.length;
    const lines = rows.map((r) => Object.keys(r).sort().map((k) => `${k}=${cell(r[k])}`).join('|')).sort();
    hash.update(`#${t}\n${lines.join('\n')}\n`);
  }
  const fileHash = createHash('sha256');
  for (const name of d.files.names()) {
    const bytes = (await d.files.read(name))!;
    fileHash.update(JSON.stringify([name, bytes.length]));
    fileHash.update(bytes);
  }
  return { counts, hash: hash.digest('hex'), files: d.files.names().join(','), fileHash: fileHash.digest('hex') };
}

function integrity(d: Device): string | null {
  const ic = d.raw.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
  if (!(ic.length === 1 && ic[0].integrity_check === 'ok')) return 'integrity_check: ' + JSON.stringify(ic).slice(0, 120);
  const fk = d.raw.prepare('PRAGMA foreign_key_check').all();
  if (fk.length) return 'foreign_key_check: ' + JSON.stringify(fk[0]).slice(0, 120);
  return null;
}

/* ------------------------------------------------------------------ */
/* Running one case                                                    */

export const CASE_TIMEOUT_MS = Math.min(Number(process.env.FUZZ_CASE_TIMEOUT_MS ?? 20000), 30000);

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: NodeJS.Timeout;
  const t = new Promise<'timeout'>((res) => { timer = setTimeout(() => res('timeout'), ms); });
  try { return await Promise.race([p, t]); } finally { clearTimeout(timer!); }
}

/** `body` does the import against a fresh device and throws on refusal; it
    may return 'guard' for a refusal the real UI makes before committing. */
export async function runOn(
  body: (d: Device) => Promise<void | 'guard'>
): Promise<Outcome> {
  const start = performance.now();
  const d = await freshDevice();
  try {
    const before = await fingerprint(d);
    let error: unknown;
    let failed = false;
    let guard = false;
    const done = await withTimeout(
      body(d).then((r) => { if (r === 'guard') guard = true; }, (e) => { failed = true; error = e; }),
      CASE_TIMEOUT_MS
    );
    const ms = performance.now() - start;
    if (done === 'timeout') return { kind: 'async-hang', sig: 'async-hang', ms };
    const after = await fingerprint(d);
    let fileHash = after.fileHash;
    let filesLeft = after.files === before.files ? undefined : d.files.names().filter((n) => !before.files.split(',').includes(n));
    const sameRows = after.hash === before.hash;
    if (failed || guard) {
      if (sameRows && filesLeft?.length) {
        // Files written ahead of the transaction wait for the orphan sweep (ADR-0011): prove it reclaims them.
        await sweepOrphanPhotos((d as any).driver, d.files);
        if (d.files.names().join(',') !== before.files) return { kind: 'orphans-survive-sweep', sig: 'orphans-survive-sweep', filesLeft: d.files.names(), ms };
        filesLeft = undefined;
        fileHash = (await fingerprint(d)).fileHash;
      }
      if (!sameRows) return { kind: 'state-changed', sig: 'state-changed after ' + (failed ? signature(error) : 'guard'), errName: (error as Error)?.name, errMsg: String((error as Error)?.message).slice(0, 200), filesLeft, ms };
      if (fileHash !== before.fileHash) return { kind: 'state-changed', sig: 'file content changed after refusal', ms };
      if (guard) return { kind: 'guard', sig: 'guard', filesLeft, ms };
      if (typed(error)) return { kind: 'typed', sig: signature(error), errName: (error as Error).name, filesLeft, ms };
      return { kind: 'untyped', sig: signature(error), errName: (error as Error)?.name, errMsg: String((error as Error)?.message).slice(0, 300), filesLeft, ms };
    }
    await sweepOrphanPhotos(d.driver, d.files);
    const owned = new Set((await readFileOwnership(d.driver, 'cleanup')).names);
    if (d.files.names().some(name => !owned.has(name))) return { kind: 'orphans-survive-sweep', sig: 'orphans-survive-sweep', filesLeft: d.files.names(), ms };
    const bad = integrity(d);
    if (bad) return { kind: 'invariant', sig: bad, ms };
    try {
      // Whatever landed must read back: a row that imports but cannot be read is a delayed failure.
      await d.journal.archive.snapshot();
      await d.journal.entries.recentDays(50);
    } catch (error) {
      return { kind: 'unreadable-after-import', sig: signature(error), errMsg: String((error as Error)?.message).slice(0, 200), ms };
    }
    return { kind: 'accepted', sig: 'accepted', filesLeft, ms };
  } finally { await d.driver.close(); }
}

/** Include non-enumerable properties and symbols, including on sniffer cases. */
export async function guardPrototype(run: () => Promise<Outcome>): Promise<Outcome> {
  const before = Object.getOwnPropertyDescriptors(Object.prototype);
  const prototype = Object.getPrototypeOf(Object.prototype);
  try {
    return await run();
  } finally {
    const after = Object.getOwnPropertyDescriptors(Object.prototype);
    const changed = Reflect.ownKeys(before).length !== Reflect.ownKeys(after).length ||
      Reflect.ownKeys(before).some((key) => {
        const a = before[key as keyof typeof before];
        const b = after[key as keyof typeof after];
        return !b || Reflect.ownKeys(a).some((field) => a[field as keyof typeof a] !== b[field as keyof typeof b]);
      }) || Object.getPrototypeOf(Object.prototype) !== prototype;
    if (changed) {
      for (const key of Reflect.ownKeys(after)) {
        if (!Object.hasOwn(before, key)) Reflect.deleteProperty(Object.prototype, key);
      }
      Object.defineProperties(Object.prototype, before);
      Object.setPrototypeOf(Object.prototype, prototype);
      // This overrides either the returned outcome or a thrown error.
      return { kind: 'prototype-polluted', sig: 'prototype-polluted', ms: 0 };
    }
  }
}

export async function runDetection(body: () => void): Promise<Outcome> {
  const start = performance.now();
  try {
    body();
    return { kind: 'accepted', sig: 'accepted', ms: performance.now() - start };
  } catch (error) {
    return { kind: 'detect-threw', sig: signature(error), errName: (error as Error)?.name, errMsg: String((error as Error)?.message).slice(0, 200), ms: performance.now() - start };
  }
}

/* ------------------------------------------------------------------ */
/* Corpus                                                              */

const normalize = async (b: Uint8Array) => ({ full: new Uint8Array([0xff, 0xd8, ...b.subarray(0, 8)]), thumb: new Uint8Array([0xff, 0xd8, 1]) });
const naming = { tagLabels: () => [] as string[] };
const text = (b: Uint8Array) => new TextDecoder().decode(b);

let corpusCache: Record<string, Uint8Array> | null = null;
let goldenBody: { json: any; files: Map<string, Uint8Array>; manifest: { name: string; length: number }[] } | null = null;

async function loadGoldenBody() {
  if (goldenBody) return goldenBody;
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);
  const files = new Map<string, Uint8Array>();
  for await (const f of opened.files) files.set(f.name, f.bytes);
  goldenBody = { json: opened.payload, files, manifest: opened.payload.files };
  return goldenBody;
}

function bodyOf(payload: unknown, files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const json = strToU8(JSON.stringify(payload));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, json.length);
  return concat(len, json, ...files.map((f) => f.bytes));
}

export async function corpus(): Promise<Record<string, Uint8Array>> {
  if (corpusCache) return corpusCache;
  const g = await loadGoldenBody();
  const goldenFiles = g.manifest.map((m) => ({ name: m.name, bytes: g.files.get(m.name)! }));
  const body = bodyOf(g.json, goldenFiles);

  // A multi-chunk body: the golden payload with 2.4 MB of extra files, so a
  // later chunk can fail after earlier chunks' photos were already written.
  const big = (n: number, seed: number) => { const out = new Uint8Array(n); const r = mulberry32(seed); for (let i = 0; i < n; i++) out[i] = (r() * 256) | 0; return out; };
  const extra = [
    { name: 'fuzz-big-1.jpg', bytes: big(1_300_000, 1) },
    { name: 'fuzz-big-2.jpg', bytes: big(1_100_000, 2) }
  ];
  const bigPayload = { ...g.json, files: [...g.manifest, ...extra.map((e) => ({ name: e.name, length: e.bytes.length }))] };
  const bigBody = bodyOf(bigPayload, [...goldenFiles, ...extra]);

  corpusCache = {
    goldenFile: new Uint8Array(readFileSync(archivePath)),
    goldenBody: body,
    bigBody,
    daylioCsv: fixture('daylio-edge-cases.csv'),
    daylioCsvMalformed: fixture('daylio-malformed.csv'),
    daylioBackup: await makeDaylioBackup(),
    dayone: await makeDayOneExport(),
    transtracks: fixture('transtracks-edge-cases.ttbackup'),
    trackAndGraph: fixture('track-and-graph-edge-cases.csv'),
    pixels: fixture('pixels-edge-cases.json')
  };
  return corpusCache;
}

/* ------------------------------------------------------------------ */
/* Packing a (mutated) plaintext body with the golden password         */

let keyCache: { salt: Uint8Array<ArrayBuffer>; key: Uint8Array<ArrayBuffer> } | null = null;

export async function packBody(body: Uint8Array, formatVersion: number): Promise<Uint8Array> {
  if (!keyCache) {
    const salt = randomSalt();
    keyCache = { salt, key: await deriveKey(GOLDEN_PASSWORD, salt, CHEAP_KDF) };
  }
  return collect(frameArchive(keyCache.key, {
    formatVersion, kdf: CHEAP_KDF, salt: keyCache.salt, chunkSize: CHUNK_SIZE, totalChunks: chunkCountFor(body.length, CHUNK_SIZE)
  }, oneShot(body)));
}

/* ------------------------------------------------------------------ */
/* Targets                                                             */

export interface CaseSpec {
  input: Uint8Array;
  mutations: string[];
  /** extra, replayable choices that are part of the case (mode, version...) */
  meta: Record<string, unknown>;
}

export interface Target {
  name: string;
  make(rng: Rng): Promise<CaseSpec>;
  run(spec: CaseSpec): Promise<Outcome>;
}

/** An input fed to the importer in 1..n pieces, as a picker stream would. */
async function* pieces(input: Uint8Array, n: number): AsyncGenerator<Uint8Array> {
  const size = Math.max(1, Math.ceil(input.length / n));
  for (let at = 0; at < input.length; at += size) yield input.subarray(at, at + size);
}

async function restoreFromBytes(d: Device, input: Uint8Array, op: string, split: number): Promise<void> {
  if (op === 'verify') { await verifyArchive(pieces(input, split), GOLDEN_PASSWORD); return; }
  const { payload, files } = await openArchive(pieces(input, split), GOLDEN_PASSWORD);
  const contents = { journal: payload.journal, files, fileCount: payload.files.length };
  if (op === 'replace') await d.journal.archive.replace(contents);
  else await d.journal.archive.merge(contents);
}

const OPS = ['replace', 'merge', 'verify'] as const;

const HEADER_JSON_FIELDS = [{ at: 8, little: false, width: 4 as const }];

function archiveTarget(name: string, source: 'file' | 'body' | 'bigBody' | 'bigFile', menu: 'bytes' | 'json'): Target {
  return {
    name,
    async make(rng) {
      const c = await corpus();
      const op = pick(rng, OPS);
      const split = pick(rng, [1, 1, 3, 17]);
      const meta: Record<string, unknown> = { op, split };
      let input: Uint8Array;
      let mutations: string[];
      if (source === 'file') {
        const m = mutate(c.goldenFile, [...BYTE_MUTATIONS, inflateAt(HEADER_JSON_FIELDS)], rng);
        input = m.bytes; mutations = m.names;
      } else if (source === 'bigFile') {
        // Pack the big body, then damage the ciphertext, mostly beyond chunk 1.
        const packed = await packBody(c.bigBody, 2);
        const at = int(rng, CHUNK_SIZE / 2, packed.length - 1);
        const hit = pick(rng, [(b: Uint8Array) => { const o = b.slice(); o[at] ^= 1 << int(rng, 0, 7); return o; }, (b: Uint8Array) => b.slice(0, at), (b: Uint8Array) => concat(b, new Uint8Array([1, 2, 3]))]);
        input = hit(packed); mutations = ['ciphertext-edit-after-chunk1'];
      } else {
        const base = source === 'bigBody' ? c.bigBody : c.goldenBody;
        const version = pick(rng, [2, 2, 2, 1]);
        meta.version = version;
        let body: Uint8Array = base;
        if (menu === 'json') {
          // Re-assemble: mutate the payload JSON, keep the length prefix honest.
          const len = new DataView(base.buffer, base.byteOffset).getUint32(0);
          const parsed = JSON.parse(strFromU8(base.subarray(4, 4 + len)));
          const edits: string[] = [];
          const m = mutateJsonValue(parsed, rng, edits);
          meta.edits = edits;
          const rest = base.subarray(4 + len);
          body = bodyOf(m, []);
          body = concat(body, rest);
          mutations = ['payload-json-structural'];
          if (rng() < 0.3) { const m2 = mutate(body, [...BYTE_MUTATIONS, inflateAt([{ at: 0, little: false, width: 4 }])], rng); body = m2.bytes; mutations.push(...m2.names); }
        } else {
          const m = mutate(base, [...BYTE_MUTATIONS, inflateAt([{ at: 0, little: false, width: 4 }])], rng);
          body = m.bytes; mutations = m.names;
        }
        input = await packBody(body, version);
        return { input, mutations: mutations!, meta };
      }
      return { input, mutations, meta };
    },
    run(spec) {
      return runOn((d) => restoreFromBytes(d, spec.input, spec.meta.op as string, spec.meta.split as number));
    }
  };
}

function zipTarget(
  name: string, key: string,
  importBody: (d: Device, input: Uint8Array) => Promise<void | 'guard'>,
  extra: Mutation[] = []
): Target {
  return {
    name,
    async make(rng) {
      const c = await corpus();
      const m = mutate(c[key], [...ZIP_MUTATIONS, ...ZIP_MUTATIONS, ...BYTE_MUTATIONS, ...extra], rng);
      return { input: m.bytes, mutations: m.names, meta: {} };
    },
    run(spec) { return runOn((d) => importBody(d, spec.input)); }
  };
}

function memberJson(member: string, decode: (b: Uint8Array) => any, encode: (v: any) => Uint8Array): Mutation {
  return {
    name: `member-json:${member}`,
    apply(bytes, rng) {
      return mapZipMember(bytes, member, (data) => {
        try { return encode(mutateJsonValue(decode(data), rng)); } catch { return data; }
      });
    }
  };
}

const b64lines = (u: Uint8Array) => (btoa(String.fromCharCode(...u)).match(/.{1,76}/g) ?? []).join('\n');

const daylioMember = memberJson(
  'backup.daylio',
  (d) => JSON.parse(strFromU8(Uint8Array.from(atob(strFromU8(d).replace(/\s+/g, '')), (c) => c.charCodeAt(0)))),
  (v) => strToU8(b64lines(strToU8(JSON.stringify(v))))
);
const dayoneMember = memberJson('Journal.json', (d) => JSON.parse(strFromU8(d)), (v) => strToU8(JSON.stringify(v)));
const ttMember = memberJson('data.json', (d) => JSON.parse(strFromU8(d)), (v) => strToU8(JSON.stringify(v)));

function csvTarget(name: string, key: string, run: (d: Device, csv: string) => Promise<void | 'guard'>): Target {
  return {
    name,
    async make(rng) {
      const c = await corpus();
      const base = rng() < 0.15 && key === 'daylioCsv' ? c.daylioCsvMalformed : c[key];
      const m = mutate(base, [...TEXT_MUTATIONS, ...BYTE_MUTATIONS.slice(0, 3)], rng);
      return { input: m.bytes, mutations: m.names, meta: {} };
    },
    run(spec) { return runOn((d) => run(d, text(spec.input))); }
  };
}

const TARGETS: Target[] = [
  archiveTarget('enc-file', 'file', 'bytes'),
  archiveTarget('enc-body-bytes', 'body', 'bytes'),
  archiveTarget('enc-body-json', 'body', 'json'),
  archiveTarget('enc-multichunk-body', 'bigBody', 'bytes'),
  archiveTarget('enc-multichunk-cipher', 'bigFile', 'bytes'),

  csvTarget('daylio-csv', 'daylioCsv', async (d, csv) => {
    const p = await d.journal.archive.previewDaylioImport(csv, naming);
    if (p.unmappedMoodLabels.length) return 'guard';
    await d.journal.archive.commitDaylioImport(p);
  }),
  zipTarget('daylio-backup', 'daylioBackup', async (d, f) => {
    const p = await d.journal.archive.previewDaylioBackupImport(f, naming);
    if (p.unmappedMoodNames.length) return 'guard';
    await d.journal.archive.commitDaylioBackupImport(p, normalize);
  }, [daylioMember, daylioMember]),
  zipTarget('dayone', 'dayone', async (d, f) => {
    const p = await d.journal.archive.previewDayOneImport(f, naming);
    await d.journal.archive.commitDayOneImport(p, normalize);
  }, [dayoneMember, dayoneMember]),
  zipTarget('transtracks', 'transtracks', async (d, f) => {
    const p = await d.journal.archive.previewTransTracksImport(f);
    await d.journal.archive.commitTransTracksImport(p, normalize);
  }, [ttMember, ttMember]),
  csvTarget('trackandgraph', 'trackAndGraph', async (d, csv) => {
    const p = await d.journal.archive.previewTrackAndGraphImport(csv);
    await d.journal.archive.commitTrackAndGraphImport(p);
  }),
  {
    name: 'pixels',
    async make(rng) {
      const c = await corpus();
      const m = mutate(c.pixels, JSON_MUTATIONS, rng);
      return { input: m.bytes, mutations: m.names, meta: {} };
    },
    run(spec) {
      return runOn(async (d) => {
        const p = await d.journal.archive.previewPixelsImport(spec.input);
        await d.journal.archive.commitPixelsImport(p);
      });
    }
  },
  {
    // The sniffers are documented as non-throwing; feed them every corpus file, damaged.
    name: 'detect',
    async make(rng) {
      const c = await corpus();
      const key = pick(rng, ['daylioCsv', 'daylioBackup', 'dayone', 'transtracks', 'trackAndGraph', 'pixels', 'goldenFile'] as const);
      const menu = key.endsWith('Csv') || key === 'trackAndGraph' ? TEXT_MUTATIONS : key === 'pixels' ? JSON_MUTATIONS : [...ZIP_MUTATIONS, ...BYTE_MUTATIONS];
      const m = mutate(c[key], menu, rng);
      return { input: m.bytes, mutations: [key, ...m.names], meta: {} };
    },
    run(spec) {
      return runDetection(() => {
        const f = spec.input;
        const head = new TextDecoder().decode(f.subarray(0, 4096));
        detectDaylio(head); detectTrackAndGraph(head);
        detectDaylioBackup(f); detectDayOne(f); detectTransTracks(f); detectPixels(f);
        recognizeSource(f); isPdf(f); isHeic(f);
      });
    }
  }
];

export const TARGET_NAMES = TARGETS.map((t) => t.name);
export const targetByName = (n: string) => TARGETS.find((t) => t.name === n)!;

export function rngFor(seed: number, target: string, index: number): Rng {
  return mulberry32(fnv1a(`${seed}:${target}:${index}`));
}

/** Smallest-input search: remove chunks while the outcome signature holds. */
export async function shrink(target: Target, spec: CaseSpec, sig: string, budgetMs = 60000): Promise<CaseSpec> {
  const t0 = Date.now();
  let cur = spec.input;
  let chunk = Math.max(1, Math.floor(cur.length / 2));
  const same = async (input: Uint8Array) => (await target.run({ ...spec, input })).sig === sig;
  while (chunk >= 1 && Date.now() - t0 < budgetMs) {
    let progressed = false;
    for (let at = 0; at < cur.length && Date.now() - t0 < budgetMs;) {
      const cand = concat(cur.subarray(0, at), cur.subarray(at + chunk));
      if (cand.length < cur.length && (await same(cand))) { cur = cand; progressed = true; } else at += chunk;
    }
    if (!progressed) chunk = Math.floor(chunk / 2);
  }
  return { ...spec, input: cur };
}
