/* A whole device, faked well enough to kill (ticket 10).

   The conversion's every step is a port (conversion.ts), which is what lets
   the Node tier run the real state machine over real artifacts: the
   plaintext Journal is a real SQLite file on disk with a real migrated
   schema, the encrypted copy is a real whole-file copy of it, the photos go
   through the real AES-GCM store, and every one of them survives a
   "process death". The only thing standing in for the real platform is the
   encryption of the database file itself, which needs a browser's WASM
   SQLite - the browser tier proves that half against real ciphertext.

   A kill is a `ProcessKilled` thrown from a labelled point inside a port
   and caught by nobody. That is the honest simulation: a killed process
   runs no cleanup, so neither may this. Restarting is calling the flow
   again over the same world - the durable state is the files and maps this
   object holds, and nothing volatile carries across. */

import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { censusOf, type ConversionPorts, type ConversionStage, type JournalSurvey, type TableCensus } from '../conversion.ts';
import { makePhotoConverter } from '../photo-conversion.ts';
import { fakeFileStore, type FakeFileStore } from '../../photos/test-support/fake-file-store.ts';
import { encryptedFileStore } from '../../photos/encrypted-file-store.ts';
import { noopFileOps } from '../../sqlite/test-support/migrated-db.ts';
import { runMigrations } from '../../sqlite/migration-runner.ts';
import { migrations } from '../../sqlite/migrations.ts';
import type { SqliteDriver } from '../../sqlite/driver.ts';

export class ProcessKilled extends Error {
  constructor(label: string) {
    super(`process killed at ${label}`);
    this.name = 'ProcessKilled';
  }
}

/** Every point at which this conversion leaves something on disk that a
    later boot has to make sense of. The tests walk this list. */
export const KILL_POINTS = [
  'marker:preparing',
  'keystore',
  'marker:database',
  'copy:partial',
  'copy:complete',
  'marker:photos',
  'photo:2',
  'marker:retire',
  'remnants:partial',
  'remnants:done'
] as const;

export type KillPoint = (typeof KILL_POINTS)[number];

const SOURCE = 'gender-diary.sqlite3';
const SOURCE_BACKUP = 'gender-diary.sqlite3.pre-migration-backup';
const ENCRYPTED = 'encrypted-journal.sqlite3';

export interface FakeWorld {
  ports: ConversionPorts;
  survey(): Promise<JournalSurvey>;
  /** Throw ProcessKilled the next time this point is reached. */
  killAt(point: KillPoint | null): void;
  /** Which labelled points this run passed, so a test can prove the kill it
      asked for actually happened rather than being quietly skipped. */
  reached(): string[];
  /** The passphrase step the app runs between prepareConversion and
      runConversion. Idempotent, like the real keystore write. */
  writeKeystore(): void;

  /** Notes in the plaintext Journal, or null when the file is gone. */
  sourceNotes(): string[] | null;
  /** Notes in the encrypted copy, or null when there is no readable one. */
  encryptedNotes(): string[] | null;
  /** A raw pref row out of the encrypted copy, or null when it is not
      there - the device-local settings an archive deliberately never
      carries (ADR-0003). */
  encryptedPref(key: string): string | null;
  photos(): Promise<{ plaintext: string[]; ciphertext: string[] }>;
  /** What the app reads once it is encrypted: the photo back through the
      encrypting store, so a converted file has to decrypt to the bytes that
      went in rather than merely stop looking like a photo. */
  readPhoto(name: string): Promise<Uint8Array | null>;
  /** The bytes this photo was seeded with. */
  seededPhoto(name: string): Uint8Array;
  rootFiles(): string[];
  /** Bytes this "device" will still accept. */
  setFreeBytes(free: number | null): void;
  dispose(): void;
}

export interface FakeWorldOptions {
  notes?: string[];
  photoNames?: string[];
  /** A preference row carried across verbatim, standing in for everything
      the archive format deliberately does not travel (ADR-0003). */
  pinHash?: string;
}

const PHOTO_BODY = (name: string): Uint8Array =>
  new TextEncoder().encode(`plaintext photo bytes for ${name}, readable until it is not`);

export async function fakeWorld(options: FakeWorldOptions = {}): Promise<FakeWorld> {
  const notes = options.notes ?? ['woke up early', 'zażółć gęślą jaźń', 'first appointment'];
  const photoNames = options.photoNames ?? ['aaa.jpg', 'bbb.jpg', 'ccc.jpg', 'ddd.jpg'];

  const dir = mkdtempSync(join(tmpdir(), 'gender-diary-conversion-'));
  const path = (name: string) => join(dir, name);

  let killPoint: KillPoint | null = null;
  const reached: string[] = [];
  const tick = (label: string): void => {
    reached.push(label);
    if (label === killPoint) throw new ProcessKilled(label);
  };

  let freeBytes: number | null = 1024 * 1024 * 1024;
  let marker: ConversionStage | null = null;
  let keystore = false;
  const store: FakeFileStore = fakeFileStore();
  const dataKey = crypto.getRandomValues(new Uint8Array(32));
  const convertPhotoFile = makePhotoConverter(store, dataKey);

  // --- the plaintext Journal this device starts with -----------------------
  await seedSource();

  async function seedSource(): Promise<void> {
    const raw = new DatabaseSync(path(SOURCE));
    await runMigrations(nodeDriver(raw), noopFileOps(), migrations);
    for (const [index, note] of notes.entries()) {
      raw
        .prepare('INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(`entry-${index}`, 20000 + index, 0, note, 0);
    }
    if (options.pinHash !== undefined) {
      raw.prepare('INSERT INTO pref (key, value) VALUES (?, ?)').run('pinHash', JSON.stringify(options.pinHash));
    }
    raw.close();
    // A leftover from an ordinary schema migration before all this, which
    // is a plaintext remnant the conversion has to retire too (ADR-0006).
    writeFileSync(path(SOURCE_BACKUP), readFileSync(path(SOURCE)));

    for (const name of photoNames) await store.write(name, PHOTO_BODY(name));
  }

  function nodeDriver(raw: DatabaseSync): SqliteDriver {
    return {
      async exec(sql) {
        raw.exec(sql);
      },
      async query(sql, params = []) {
        return raw.prepare(sql).all(...(params as never[])) as never;
      },
      async run(sql, params = []) {
        const result = raw.prepare(sql).run(...(params as never[]));
        return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
      },
      async getUserVersion() {
        return (raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
      },
      async setUserVersion(version) {
        raw.exec(`PRAGMA user_version = ${version}`);
      },
      async transaction(fn) {
        raw.exec('BEGIN');
        try {
          const result = await fn();
          raw.exec('COMMIT');
          return result;
        } catch (error) {
          raw.exec('ROLLBACK');
          throw error;
        }
      },
      async close() {
        raw.close();
      }
    };
  }

  /** The same census the real port takes, over node:sqlite instead of a
      worker - so the fake cannot quietly count something else. */
  async function censusOfFile(file: string): Promise<TableCensus> {
    const raw = new DatabaseSync(file, { readOnly: true });
    try {
      return await censusOf(async (statement) => raw.prepare(statement).all() as never);
    } finally {
      raw.close();
    }
  }

  function notesIn(file: string): string[] | null {
    if (!existsSync(file)) return null;
    let raw: DatabaseSync;
    try {
      raw = new DatabaseSync(file, { readOnly: true });
    } catch {
      return null;
    }
    try {
      return (raw.prepare('SELECT note FROM entry ORDER BY epoch_day').all() as { note: string }[]).map(
        (row) => row.note
      );
    } catch {
      // A partial copy: the file is there and is not a database.
      return null;
    } finally {
      raw.close();
    }
  }

  let photosConverted = 0;

  const ports: ConversionPorts = {
    marker: {
      async read() {
        return marker;
      },
      async write(stage) {
        marker = stage;
        tick(`marker:${stage}`);
      },
      async clear() {
        marker = null;
      }
    },

    async inspectSource() {
      const raw = new DatabaseSync(path(SOURCE), { readOnly: true });
      try {
        return {
          sizeBytes: statSync(path(SOURCE)).size,
          schemaVersion: (raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
        };
      } finally {
        raw.close();
      }
    },

    async freeBytes() {
      return freeBytes;
    },

    async readSource() {
      return { bytes: new Uint8Array(readFileSync(path(SOURCE))), census: await censusOfFile(path(SOURCE)) };
    },

    async writeEncryptedCopy(bytes) {
      /* Whatever an interrupted attempt left goes first: VACUUM INTO
         refuses a target that already exists, so the real port unlinks
         before it runs and this one does the same. Then half the file
         arrives, and then the rest - a copy in flight is one file
         growing, and 'copy:partial' is the moment a kill would freeze it
         half written. */
      rmSync(path(ENCRYPTED), { force: true });
      writeFileSync(path(ENCRYPTED), bytes.subarray(0, Math.floor(bytes.length / 2)));
      tick('copy:partial');
      writeFileSync(path(ENCRYPTED), bytes);
      tick('copy:complete');
    },

    async censusOfEncryptedCopy() {
      return censusOfFile(path(ENCRYPTED));
    },

    async photoNames() {
      return store.list();
    },

    async convertPhoto(name) {
      await convertPhotoFile(name);
      photosConverted += 1;
      tick(`photo:${photosConverted}`);
    },

    async removePlaintextRemnants() {
      rmSync(path(SOURCE), { force: true });
      tick('remnants:partial');
      rmSync(path(SOURCE_BACKUP), { force: true });
      // Everything plaintext is gone and the marker still says 'retire':
      // the last durable state, and the one a kill would leave a boot to
      // finish by clearing a marker with nothing left to point at.
      tick('remnants:done');
    }
  };

  return {
    ports,

    async survey() {
      return {
        keystoreExists: keystore,
        plaintextJournalPresent: existsSync(path(SOURCE)),
        marker
      };
    },

    // Also the start of an attempt: what a restarted process would not
    // remember goes with it.
    killAt(point) {
      killPoint = point;
      photosConverted = 0;
      reached.length = 0;
    },

    reached() {
      return [...reached];
    },

    writeKeystore() {
      keystore = true;
      tick('keystore');
    },

    sourceNotes() {
      return notesIn(path(SOURCE));
    },

    encryptedNotes() {
      return notesIn(path(ENCRYPTED));
    },

    async photos() {
      const plaintext: string[] = [];
      const ciphertext: string[] = [];
      for (const name of store.names()) {
        // Read through the raw store: what is on "disk" is what decides,
        // not what an API read would hand back.
        const raw = await store.read(name);
        (raw !== null && startsWith(raw, PHOTO_BODY(name)) ? plaintext : ciphertext).push(name);
      }
      return { plaintext, ciphertext };
    },

    encryptedPref(key) {
      if (!existsSync(path(ENCRYPTED))) return null;
      const raw = new DatabaseSync(path(ENCRYPTED), { readOnly: true });
      try {
        return ((raw.prepare('SELECT value FROM pref WHERE key = ?').get(key) as { value: string }) ?? null)?.value ?? null;
      } finally {
        raw.close();
      }
    },

    readPhoto(name) {
      return encryptedFileStore(store, dataKey).read(name);
    },

    seededPhoto(name) {
      return PHOTO_BODY(name);
    },

    rootFiles() {
      return [SOURCE, SOURCE_BACKUP, ENCRYPTED].filter((name) => existsSync(path(name))).sort();
    },

    setFreeBytes(free) {
      freeBytes = free;
    },

    dispose() {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  function startsWith(haystack: Uint8Array, needle: Uint8Array): boolean {
    if (haystack.length < needle.length) return false;
    return needle.every((byte, index) => haystack[index] === byte);
  }
}
