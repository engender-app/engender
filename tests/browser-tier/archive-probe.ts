/* Browser-tier check for ticket 13: the export path on the real platform.

   Three things can only be proved here. The archive is packed from a
   journal on the real SQLocal driver with its photos in real OPFS, so the
   file store's size() - which packing needs before it can encrypt anything
   (ADR-0007) - is answered by OPFS rather than by a fake. The key is
   derived with the real ARCHIVE_ARGON2_PARAMS through hash-wasm in a
   browser, and the chunks go through the browser's own WebCrypto, not
   Node's. And delivery is a real download from a real anchor click, which
   run.mjs catches and reads back off disk with plain Node - a file that
   nothing but the byte layout in ADR-0007 explains.

   The photo is deliberately over a megabyte, so the archive spans several
   chunks and the last one is a partial. */

import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { createWebSqlite } from '../../src/lib/data/sqlite/sqlocal-driver.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { PREFERENCE_DEFAULTS } from '../../src/lib/data/prefs/catalogue.ts';
import { byteReader, collect, readArchiveHeader } from '../../src/lib/data/archive/container.ts';
import { openArchive, packArchive } from '../../src/lib/data/archive/pack.ts';
import { portablePreferences } from '../../src/lib/data/archive/payload.ts';
import { archiveFileName, deliverArchive } from '../../src/lib/data/archive/deliver.ts';
import { DecryptionFailedError } from '../../src/lib/crypto/aesGcm.ts';

const PASSWORD = 'demo';

/** Not random: run.mjs checks the photo comes back byte for byte, and a
    pattern says more about where a mangled chunk boundary landed. */
const patterned = (length: number, seed: number) => {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (i * 7 + seed) % 251;
  return bytes;
};

async function* oneShot(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

async function run() {
  const result: Record<string, unknown> = {};

  const files = opfsPhotoFiles('archive-probe-photos');
  const { driver, fileOps } = createWebSqlite('archive-probe.sqlite3');
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') throw booted.error;

  const journal = openJournal(booted.driver, files);
  await journal.reconcileBuiltIns();

  const entryId = await journal.entries.upsertEntry({
    epochDay: 20000,
    mood: 4,
    note: 'zażółć gęślą jaźń',
    dims: { femininity: 60 },
    tags: ['e-happy']
  });
  const full = patterned(1_500_000, 3);
  await journal.photos.attach({ entryId }, { full, thumb: patterned(20_000, 11) });
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'HRT start', epochDay: 19000 });
  await journal.photos.attach({ milestoneId }, { full: patterned(600_000, 17), thumb: patterned(9_000, 5) });

  const preferences = portablePreferences({
    ...PREFERENCE_DEFAULTS,
    name: 'Alicja',
    theme: 'dark',
    // Device-local, and the one whose presence in a file would matter most.
    pinHash: 'DEVICE-LOCAL-PIN-HASH'
  });

  const snapshot = await journal.archive.snapshot();
  const contents = {
    journal: snapshot.journal,
    preferences,
    files: snapshot.files,
    readFile: snapshot.readFile
  };

  const startedAt = performance.now();
  const archive = await collect(packArchive(contents, PASSWORD));
  result.packMs = Math.round(performance.now() - startedAt);
  result.archiveLength = archive.length;
  result.manifest = snapshot.files;

  const { header } = await readArchiveHeader(byteReader(oneShot(archive)));
  result.header = { formatVersion: header.formatVersion, kdf: header.kdf, totalChunks: header.totalChunks, chunkSize: header.chunkSize };
  result.spansChunks = header.totalChunks > 1;

  // Back out again, in the browser, with the real parameters.
  const opened = await openArchive(oneShot(archive), PASSWORD);
  const unpacked: { name: string; length: number }[] = [];
  let photoMatches = false;
  for await (const file of opened.files) {
    unpacked.push({ name: file.name, length: file.bytes.length });
    if (file.name === snapshot.files[0].name) photoMatches = file.bytes.every((byte, i) => byte === full[i]);
  }
  result.unpacked = unpacked;
  result.photoMatches = photoMatches;
  result.entry = opened.payload.journal.entries[0];
  result.preferences = opened.payload.preferences;
  result.pinHashInPlaintext = new TextDecoder().decode(archive).includes('DEVICE-LOCAL-PIN-HASH');

  result.wrongPassword = await refusal(async () => {
    const wrong = await openArchive(oneShot(archive), 'Demo');
    for await (const _file of wrong.files);
  });

  /* The download, driven from a click because that is the only way a
     browser hands a file to a person. run.mjs attaches its own download
     handler before clicking. */
  document.getElementById('deliver')!.addEventListener('click', () => {
    deliverArchive(archiveFileName('Alicja'), oneShot(archive)).then((delivery) => {
      (window as unknown as { __deliveryResult: unknown }).__deliveryResult = { delivery };
    });
  });

  (window as unknown as { __archiveProbeResult: unknown }).__archiveProbeResult = result;
  document.body.dataset.archiveProbeReady = 'true';
}

async function refusal(call: () => Promise<unknown>): Promise<{ name: string; message: string } | null> {
  try {
    await call();
    return null;
  } catch (error) {
    return {
      name: error instanceof DecryptionFailedError ? 'DecryptionFailedError' : String((error as Error)?.name),
      message: String((error as Error)?.message)
    };
  }
}

run().catch((err) => {
  (window as unknown as { __archiveProbeResult: unknown }).__archiveProbeResult = {
    error: String(err?.stack ?? err)
  };
  document.body.dataset.archiveProbeReady = 'true';
});
