/* The conversion's ports, on the web (ticket 10). Each one is a single
   platform capability; the order they are called in, and what a kill
   between any two of them leaves behind, is conversion.ts's business and is
   tested without a browser at all.

   The two databases never overlap in the pool. The source is a
   `engender.sqlite3` file in the OPFS root, which only SQLocal can read
   (ADR-0020 replaced the driver, not the file format), and the target lives
   inside the SAHPool directory under the same name - so the conversion
   reads with one library, writes with the other, and neither can be
   mistaken for the other's file. What they cannot do is hold the pool at
   the same time: SAHPool's sync access handles belong to one worker, so
   every port here opens what it needs and closes it again rather than
   keeping a connection alive across stages. */

import { censusOf, type ConversionPorts, type ConversionPrecheckPorts } from './conversion';
import { opfsConversionMarker } from './marker-file';
import { makePhotoConverter } from './photo-conversion';
import { createConversionTarget, createEncryptedWebSqlite } from '../sqlite/mc-driver';
import { openPlaintextEraJournal, type PlaintextEraJournal } from '../sqlite/sqlocal-driver';
import { opfsPhotoFiles } from '../photos/opfs-file-store';
import { JOURNAL_DATABASE, removePlaintextRemnants } from './plaintext-journal';

export { JOURNAL_DATABASE, plaintextJournalPresent, removePlaintextRemnants } from './plaintext-journal';


async function withSource<T>(use: (source: PlaintextEraJournal) => Promise<T>): Promise<T> {
  const source = openPlaintextEraJournal(JOURNAL_DATABASE);
  try {
    return await use(source);
  } finally {
    // Always: the pool worker cannot start while SQLocal holds the origin's
    // OPFS handles, and the retirement cannot delete a file that is open.
    await source.close();
  }
}

/** The half of the ports that needs no data key, so boot can run the
    precheck before it asks anyone for a passphrase. */
export function webConversionPrecheckPorts(): ConversionPrecheckPorts {
  return {
    marker: opfsConversionMarker(),

    async inspectSource() {
      const root = await navigator.storage.getDirectory();
      const sizeBytes = (await (await root.getFileHandle(JOURNAL_DATABASE)).getFile()).size;
      const schemaVersion = await withSource(async (source) => {
        const [row] = await source.query<{ user_version: number }>('PRAGMA user_version');
        return row.user_version;
      });
      return { sizeBytes, schemaVersion };
    },

    async freeBytes() {
      if (!navigator.storage?.estimate) return null;
      const { quota, usage } = await navigator.storage.estimate();
      if (quota === undefined || usage === undefined) return null;
      return Math.max(0, quota - usage);
    }
  };
}

export function webConversionPorts(dataKey: Uint8Array<ArrayBuffer>): ConversionPorts {
  const photos = opfsPhotoFiles();

  return {
    ...webConversionPrecheckPorts(),

    async readSource() {
      return withSource(async (source) => ({
        census: await censusOf((statement) => source.query(statement)),
        bytes: await source.readDatabaseFile()
      }));
    },

    async writeEncryptedCopy(bytes) {
      const target = createConversionTarget(JOURNAL_DATABASE, dataKey);
      try {
        await target.writeFrom(bytes);
      } finally {
        await target.close();
      }
    },

    async censusOfEncryptedCopy() {
      // A fresh open under the data key, in a worker that has just been
      // started: the "reopens and verifies" of the acceptance, not a read
      // through the connection that wrote it.
      const { driver } = createEncryptedWebSqlite(JOURNAL_DATABASE, dataKey);
      try {
        const [integrity] = await driver.query<{ integrity_check: string }>('PRAGMA integrity_check');
        if (integrity.integrity_check !== 'ok') {
          throw new Error(`the encrypted copy fails SQLite's own integrity check: ${integrity.integrity_check}`);
        }
        // Awaited inside the try, not returned out of it: `return censusOf(…)`
        // settles this function before the counting has run, and the
        // finally below would close the database out from under it.
        return await censusOf((statement) => driver.query(statement));
      } finally {
        await driver.close();
      }
    },

    photoNames: () => photos.list(),

    convertPhoto: makePhotoConverter(photos, dataKey),

    removePlaintextRemnants
  };
}
