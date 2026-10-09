/* What archive-golden.test.ts and archive-golden-merge.test.ts both build on:
   the fixture's paths, the password and cheap KDF it was packed with, a
   journal with something in every section, and the two ways to change what
   is committed (ADR-0027, ticket 12).

   `everySection()` lives here rather than in either test file because both
   need it - the golden test packs a fresh one when GOLDEN_ARCHIVE=rebuild
   runs, and the merge sweep builds a second, independent device out of it to
   merge the committed fixture into. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collect } from '../archive/container.ts';
import { openArchive, packArchive } from '../archive/pack.ts';
import { portablePreferences, type ArchiveJournal } from '../archive/payload.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { seedCompleteArchiveJournal, seedLegacyBuiltInPresets } from './test-support/complete-archive-journal.ts';
import { openJournal, type Journal } from './journal.ts';
import type { RestoreContents } from './restore.ts';

export const archivePath = fileURLToPath(new URL('./fixtures/golden-archive.ttbackup', import.meta.url));
export const journalPath = fileURLToPath(new URL('./fixtures/golden-journal.json', import.meta.url));
export const countsPath = fileURLToPath(new URL('./fixtures/golden-archive-counts.json', import.meta.url));

export const GOLDEN_PASSWORD = 'a golden horse, stapled';

/* The real parameters take about a second per derivation by design
   (ADR-0013) and would be paid on every run of a file that uses this
   fixture. They travel in the header, so the fixture packs with the cheap
   set pack.test.ts uses and the browser tier is where the real ones get
   exercised. */
export const CHEAP_KDF = { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 };

export const bytes = (text: string): Uint8Array => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

export async function* oneShot(source: Uint8Array): AsyncGenerator<Uint8Array> {
  yield source;
}

export async function emptyDevice(): Promise<Journal> {
  const journal = openJournal(await migratedDb(), fakeFileStore());
  await journal.reconcileBuiltIns();
  return journal;
}

/** `everySection()` with none of the user content: the reference rows a boot
    puts there and nothing else. What emptying a journal has to leave behind,
    and therefore what a test of that can compare against - built-in rows
    survive a Replace by design (restore.ts), so "empty" cannot mean zero. */
export async function builtInsOnlyDevice(): Promise<{ driver: SqliteDriver; journal: Journal }> {
  const driver = await migratedDb();
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  await seedLegacyBuiltInPresets(driver);
  return { driver, journal };
}

/** Devices that reconciled before phase 5 ticket 35 kept eight built-in
    preset rows (reconcile.ts's own history says why it stopped: the picker
    they backed is gone and nothing reads them any more). A fresh journal
    never gets them - there is no public API left that makes a built-in
    preset row, `addPreset` only ever makes a custom one - so this seeds them
    the same way reconcile once did, directly. Without it, `everySection()`
    can only ever produce one preset row, and the fixture loses the built-in
    shape `readPresets`/`applyPresets` still have to carry for a device that
    reconciled before ticket 35. */

/** A journal with something in all 36 sections, and the customizations that
    make the vocabulary ones more than the built-ins: a custom dimension in a
    custom preset, a custom group with a tag of its own, a custom tag inside a
    built-in group, a renamed and a hidden built-in tag, a hidden dimension, a
    hidden affirmation, a custom body region logged on the entry alongside a
    built-in one, a custom measurement type alongside a hidden built-in one,
    a disabled effect category, a custom effect type alongside a hidden
    built-in one, and an authored entry template carrying a custom tag, a
    custom dimension value, a note scaffold and a presentation. Built by
    `everySectionDevice` below, which is the same thing with the connection
    handed back too. */
export const everySection = async (): Promise<Journal> => (await everySectionDevice()).journal;

/** The same journal, with its connection alongside it, for the tests that
    have to speak to the driver directly: emptying the journal has to hold
    with `PRAGMA foreign_keys` off, and counting rows table by table sees what
    no section's read can (restore.test.ts). Neither is something the journal
    handle offers, and neither is a reason for the callers that only want the
    journal to unpack a pair. */
export async function everySectionDevice(): Promise<{ driver: SqliteDriver; journal: Journal }> {
  const driver = await migratedDb();
  const journal = openJournal(driver, fakeFileStore());
  await seedCompleteArchiveJournal(driver, journal, bytes);
  return { driver, journal };
}

/** Every section's row count, in the same shape golden-archive-counts.json
    commits. */
export function countsOf(journal: ArchiveJournal): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [section, rows] of Object.entries(journal)) counts[section] = rows.length;
  return counts;
}

function writeGoldenFixture(journal: ArchiveJournal, packed: Uint8Array): void {
  writeFileSync(archivePath, packed);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  writeFileSync(countsPath, `${JSON.stringify(countsOf(journal), null, 2)}\n`);
}

/** Decrypts what is committed, runs `transform` over the journal it carries
    and repacks - without writing anything. What both `rebuildGolden` and
    `patchGoldenArchive` below build on, and what the always-on round-trip
    test in archive-golden.test.ts exercises with the identity transform to
    prove the mechanism itself still works, decrypt through repack, without
    touching a committed file. */
export async function repackGolden(
  transform: (journal: ArchiveJournal) => ArchiveJournal
): Promise<{ journal: ArchiveJournal; packed: Uint8Array }> {
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);
  const files = new Map<string, Uint8Array>();
  for await (const file of opened.files) files.set(file.name, file.bytes);

  const journal = transform(opened.payload.journal);

  const packed = await collect(
    packArchive(
      {
        journal,
        preferences: opened.payload.preferences,
        files: opened.payload.files,
        readFile: async (name) => {
          const found = files.get(name);
          if (!found) throw new Error(`repackGolden: no bytes read for file the manifest names: ${name}`);
          return found;
        }
      },
      GOLDEN_PASSWORD,
      CHEAP_KDF
    )
  );
  return { journal, packed };
}

/** The supported way to make a small, deliberate change to the golden
    fixture: decrypt what is committed, transform its journal, repack, and
    regenerate the counts manifest alongside it. Unlike a full rebuild this
    cannot manufacture content a fresh journal can no longer produce on its
    own - the eight built-in presets, before `seedLegacyBuiltInPresets` above
    existed, were exactly that case - because it starts from what is already
    there rather than from nothing.

    `GOLDEN_ARCHIVE=patch npx vitest run src/lib/data/journal/archive-golden.test.ts`
    runs whatever transform is currently written into the gated test at the
    bottom of that file. Edit it in place for the change at hand, run it
    once, commit the three changed fixture files, then put the transform
    back to the identity function. */
export async function patchGoldenArchive(transform: (journal: ArchiveJournal) => ArchiveJournal): Promise<void> {
  const { journal, packed } = await repackGolden(transform);
  writeGoldenFixture(journal, packed);
}

/** A fresh `everySection()` journal, packed and written over the fixture
    wholesale. The routine reason to run it (`GOLDEN_ARCHIVE=rebuild npx
    vitest run src/lib/data/journal/archive-golden.test.ts`, per ADR-0027) is
    adding a built-in dimension, preset or tag: `everySection()` reconciles
    the current built-in vocabulary itself, so a new one shows up without
    anyone hand-writing its row. */
export async function rebuildGolden(): Promise<void> {
  const snapshot = await (await everySection()).archive.snapshot();
  const packed = await collect(
    packArchive(
      {
        journal: snapshot.journal,
        preferences: portablePreferences({ ...PREFERENCE_DEFAULTS, name: 'Alicja' }),
        files: snapshot.files,
        readFile: snapshot.readFile
      },
      GOLDEN_PASSWORD,
      CHEAP_KDF
    )
  );
  writeGoldenFixture(snapshot.journal, packed);
}

/** What a merge needs from the committed fixture: its journal and its photo
    files as a stream, freshly decrypted each call so the same fixture can
    be merged more than once in one test. */
export async function goldenContents(): Promise<RestoreContents> {
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);
  return { journal: opened.payload.journal, files: opened.files };
}
