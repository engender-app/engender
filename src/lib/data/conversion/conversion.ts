/* Converting a plaintext-era Journal into an encrypted one (ticket 10).

   Every Journal written before ticket 09 is a `gender-diary.sqlite3` file in
   the OPFS root with a directory of plaintext photos beside it. This module
   is the state machine that turns one into the encrypted Journal ticket 09
   defined, on a phone, where the process can be killed between any two
   statements and the disk can be full.

   The rule that shapes all of it: nothing plaintext is destroyed until the
   encrypted copy has been reopened under the data key and counted against
   the original. Everything before that point is additive, so a kill leaves
   the previous Journal exactly as it was. Everything after it is
   forward-only, and every step is idempotent, so a kill leaves a conversion
   that finishes itself on the next boot.

   The marker file is what makes those two halves distinguishable after a
   kill, and its order against the keystore is load-bearing. The marker is
   written FIRST, before the passphrase is even chosen: a keystore beside a
   plaintext Journal with no marker would be indistinguishable from an
   encrypted Journal with a stray file next to it, and the app would have to
   guess which of the two databases is the real one.

     marker 'preparing'  a keystore may or may not exist; no journal data has
                         moved. Killed here, the plaintext Journal is whole.
     marker 'database'   an encrypted copy is being written, and may be
                         partial. The source is untouched, so a resume
                         throws the copy away and writes it again - a
                         complete-but-unverified copy is indistinguishable
                         from a partial one, and redoing it is cheaper than
                         a mechanism that could tell them apart.
     marker 'photos'     the copy is complete AND verified. This is the point
                         of no return: photo files are rewritten in place
                         from here, so there is no going back to the
                         plaintext Journal - and nothing to go back for,
                         because the encrypted one is proven. A resume
                         finishes the photos that are still plaintext.
     marker 'retire'     everything is converted. What is left is deleting
                         the plaintext files, by name. A resume deletes the
                         rest.
     no marker           done.

   ADR-0006 keeps a pre-migration copy until the next clean boot. Here the
   pre-conversion state IS the source database, and it is retired as soon as
   the conversion is proven rather than one boot later: ADR-0018 cannot claim
   an encrypted Journal while a readable copy of the same Journal is sitting
   in OPFS, and a copy that has already been verified page for page has
   nothing left to insure against.

   Everything the machine touches is a port, so the whole of it - every
   stage, every kill, every resume - runs in the Node tier against real
   SQLite and an in-memory store (conversion.test.ts). The web wiring is in
   web-ports.ts and the real platform is proved once, end to end, by the
   browser tier. */

/** How far a conversion got. Persisted; the names are on disk. */
export type ConversionStage = 'preparing' | 'database' | 'photos' | 'retire';

export interface ConversionMarkerStore {
  read(): Promise<ConversionStage | null>;
  write(stage: ConversionStage): Promise<void>;
  clear(): Promise<void>;
}

/** Row counts per table, taken from the source and taken again from the
    encrypted copy. FTS5's shadow tables are ordinary tables to a whole-
    database copy, so they are counted like the rest and no table needs
    naming here. */
export type TableCensus = Record<string, number>;

/** What "verified" counts, in one place. Both sides of the comparison have
    to ask the same question of two different databases through two
    different libraries, and a census that meant something slightly
    different on each side would compare equal while hiding a difference. */
export async function censusOf(
  query: <Row extends Record<string, unknown>>(statement: string) => Promise<Row[]>
): Promise<TableCensus> {
  const tables = await query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  const counts: TableCensus = {};
  for (const { name } of tables) {
    // The name came out of sqlite_master, not from anything a person
    // typed, and an identifier cannot be bound as a parameter anyway.
    const [row] = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM "${name}"`);
    counts[name] = Number(row.n);
  }
  return counts;
}

export interface SourceJournal {
  /** The whole database file. Small by design - photos are separate files,
      which is ADR-0006's own argument for copying it at all. */
  bytes: Uint8Array;
  census: TableCensus;
}

/** What the precheck needs, which is deliberately less than the conversion
    does: none of it involves a data key, so it can all be asked before the
    person is made to choose a passphrase for a conversion that may not be
    able to start. */
export interface ConversionPrecheckPorts {
  marker: ConversionMarkerStore;
  /** How big the source is and what schema it is at. */
  inspectSource(): Promise<{ sizeBytes: number; schemaVersion: number }>;
  /** Bytes the platform will still let this origin write, or null where it
      will not say - in which case the check is skipped rather than guessed. */
  freeBytes(): Promise<number | null>;
}

export interface ConversionPorts extends ConversionPrecheckPorts {
  readSource(): Promise<SourceJournal>;
  /** Writes an encrypted copy of those bytes as the live Journal, replacing
      whatever an interrupted attempt left at that name. */
  writeEncryptedCopy(bytes: Uint8Array): Promise<void>;
  /** Reopens the encrypted Journal under the data key and counts it. This
      is the "reopens and verifies" the ticket reports success on. */
  censusOfEncryptedCopy(): Promise<TableCensus>;
  /** Every photo file the store holds, converted or not. */
  photoNames(): Promise<string[]>;
  /** Rewrites one photo through the encrypting store. Idempotent: a file an
      earlier attempt already converted is left alone. */
  convertPhoto(name: string): Promise<void>;
  /** Deletes the plaintext files this app manages, by name. Never the photo
      directory, never the keystore, and never anything the person put
      there themselves - an Archive is a download and lives outside OPFS
      entirely. */
  removePlaintextRemnants(): Promise<void>;
}

/** What a boot finds before it decides anything. */
export interface JournalSurvey {
  keystoreExists: boolean;
  plaintextJournalPresent: boolean;
  marker: ConversionStage | null;
}

export type JournalState =
  /** No Journal of either kind: offer to set a passphrase. */
  | 'first-run'
  /** An encrypted Journal and nothing else: ask for the passphrase. */
  | 'unlock'
  /** A plaintext Journal is the authority. Convert it, from the start or
      from wherever an interrupted attempt got to. */
  | 'convert'
  /** Converted, with plaintext files still on disk. Finish deleting them,
      then survey again. */
  | 'retire';

export function describeJournalState(survey: JournalSurvey): JournalState {
  if (survey.marker !== null) {
    return survey.marker === 'retire' ? 'retire' : 'convert';
  }

  /* No marker and both kinds of Journal present. Nothing in this app
     produces that state - the marker is written before the keystore and
     cleared after the last plaintext file goes - but the answer it deserves
     is not ambiguous: a root `gender-diary.sqlite3` is pre-encryption by
     construction, and the encrypted Journal beside it is the live one. */
  if (survey.keystoreExists) return survey.plaintextJournalPresent ? 'retire' : 'unlock';

  return survey.plaintextJournalPresent ? 'convert' : 'first-run';
}

export type ConversionRefusal =
  | { reason: 'not-enough-space'; needBytes: number; freeBytes: number }
  | { reason: 'schema-too-new'; foundVersion: number; knownVersion: number };

export type PrecheckResult = { ok: true } | ({ ok: false } & ConversionRefusal);

/** What the conversion needs on top of what it already occupies, at its
    peak. The source stays whole until the copy is verified, so the copy
    itself is new (one source), and the copy is encrypted in place under a
    rollback journal that can reach the same size again (a second). Two and
    a half rather than two, because the pool allocates in whole slots and
    the encrypted form of a page is not smaller than the page - plus a
    floor, so a tiny Journal on a nearly-full disk is refused up front
    rather than started and killed halfway. Photos are converted in place
    and grow by a nonce and a tag each, which the floor also covers. */
export const CONVERSION_SPACE_FLOOR = 4 * 1024 * 1024;

export function spaceRequiredFor(sourceSizeBytes: number): number {
  return Math.ceil(sourceSizeBytes * 2.5) + CONVERSION_SPACE_FLOOR;
}

/** Everything that has to be true before the person is asked to choose a
    passphrase, plus the marker that makes the attempt recoverable.

    Only ever on a fresh start. A conversion with a marker is already under
    way and is not re-litigated: the space it still needs is not the space
    a fresh one needs (most of the copy is already written, and the retry
    unlinks what it is about to replace), and past 'photos' there is no
    plaintext Journal left to go back to - so a refusal there would be a
    screen saying "nothing has been changed" over a device where plenty
    has, with no way off it. A resume that genuinely runs out of disk fails
    on the write instead, where the error says what actually happened and
    the marker still says where to pick up. */
export async function prepareConversion(
  ports: ConversionPrecheckPorts,
  knownSchemaVersion: number
): Promise<PrecheckResult> {
  if ((await ports.marker.read()) !== null) return { ok: true };

  const { sizeBytes, schemaVersion } = await ports.inspectSource();

  /* ADR-0006's refusal, applied to the one path that opens a database this
     build did not migrate. Converting a schema from the future would write
     a faithful encrypted copy and then fail to open it, having already
     retired the only copy the older build could read. */
  if (schemaVersion > knownSchemaVersion) {
    return { ok: false, reason: 'schema-too-new', foundVersion: schemaVersion, knownVersion: knownSchemaVersion };
  }

  const free = await ports.freeBytes();
  const need = spaceRequiredFor(sizeBytes);
  if (free !== null && free < need) {
    return { ok: false, reason: 'not-enough-space', needBytes: need, freeBytes: free };
  }

  // Before the keystore, always (see the header).
  await ports.marker.write('preparing');

  return { ok: true };
}

/** The encrypted copy did not come back the same as what went in. The
    source is still whole and the marker is still at 'database', so the next
    attempt writes the copy again. */
export class ConversionVerificationError extends Error {
  differences: string[];

  constructor(differences: string[]) {
    super(`The encrypted copy does not match the journal it was made from: ${differences.join('; ')}.`);
    this.name = 'ConversionVerificationError';
    this.differences = differences;
  }
}

export type ConversionProgress =
  | { stage: 'database' }
  | { stage: 'photos'; done: number; total: number }
  | { stage: 'retire' };

/** Runs the conversion from wherever the marker says it is. The data key is
    already inside `ports` - this module never sees one. */
export async function runConversion(
  ports: ConversionPorts,
  onProgress: (progress: ConversionProgress) => void = () => {}
): Promise<void> {
  let stage = (await ports.marker.read()) ?? 'preparing';

  if (stage === 'preparing' || stage === 'database') {
    await ports.marker.write('database');
    onProgress({ stage: 'database' });

    const source = await ports.readSource();
    await ports.writeEncryptedCopy(source.bytes);

    const differences = censusDifferences(source.census, await ports.censusOfEncryptedCopy());
    if (differences.length > 0) throw new ConversionVerificationError(differences);

    // Nothing plaintext has been destroyed up to this line, and nothing
    // after it can be undone.
    await ports.marker.write('photos');
    stage = 'photos';
  }

  if (stage === 'photos') {
    const names = await ports.photoNames();
    let done = 0;
    onProgress({ stage: 'photos', done, total: names.length });
    for (const name of names) {
      await ports.convertPhoto(name);
      done += 1;
      onProgress({ stage: 'photos', done, total: names.length });
    }
    await ports.marker.write('retire');
    stage = 'retire';
  }

  onProgress({ stage: 'retire' });
  await finishRetirement(ports.marker, ports.removePlaintextRemnants);
}

/** The tail of a conversion, on its own because it is the one part that
    needs no data key: deleting files by name asks nothing of the encrypted
    Journal. A boot that finds a 'retire' marker can therefore finish it
    before the passphrase gate renders, rather than leaving readable
    plaintext on disk until someone types a passphrase. */
export async function finishRetirement(
  marker: ConversionMarkerStore,
  removePlaintextRemnants: () => Promise<void>
): Promise<void> {
  await removePlaintextRemnants();
  // Last: while this file is on disk, the plaintext files are still the
  // app's business. Once it goes, they are gone.
  await marker.clear();
}

function censusDifferences(source: TableCensus, copy: TableCensus): string[] {
  const differences: string[] = [];
  for (const table of new Set([...Object.keys(source), ...Object.keys(copy)]).values()) {
    const before = source[table];
    const after = copy[table];
    if (before === after) continue;
    if (before === undefined) differences.push(`${table} is only in the copy (${after} rows)`);
    else if (after === undefined) differences.push(`${table} is missing from the copy (${before} rows)`);
    else differences.push(`${table} has ${after} rows, was ${before}`);
  }
  return differences.sort();
}
