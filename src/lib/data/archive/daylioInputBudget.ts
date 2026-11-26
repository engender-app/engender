/* The one place the Daylio importers say how much input they will take.

   Both routes read a file somebody else made: the `.daylio` backup (a ZIP,
   zipReader.ts) and the CSV (daylio.ts). A hostile or corrupt file must be
   refused cheaply, before it is read into memory or walked field by field,
   and a real export must never be. So every number here is the measured size
   of a realistic ten-year export times a generous factor, rather than the
   biggest thing a phone could survive:

     measured (test-support/daylio-ten-year.ts, 3 entries a day for ten
     years, 10,950 entries, notes of up to 2.7 KB)
       CSV                       3.2 MiB    10,951 lines
       backup.daylio member      6.2 MiB    (base64 of 4.7 MiB of JSON)
       longest note              2.7 KB
       attachments               about 1500 photos at 600 KB, 858 MiB
                                 (the 851.2 MiB estimate in ARCHITECTURE.md)

   Photos do not compress, so the ZIP on disk is about as large as what it
   holds; the file ceiling and the inflated total are the same 1 GiB.
   Keep `dlb_file_too_large` (it quotes 1 GB) in sync with `backupFileBytes`
   in both message catalogues. */

const MIB = 1024 * 1024;

/** A file refused for being larger than a Daylio import accepts. Shared by
    the CSV path and the ZIP reader, so the screen has one thing to catch. */
export class ImportTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportTooLargeError';
  }
}

export const DAYLIO_BUDGET = {
  /** The picked `.daylio` file, checked before it is read at all. */
  backupFileBytes: 1024 * MIB,
  /** Everything a backup may declare once decompressed, across all reads. */
  zipInflatedBytes: 1024 * MIB,
  /** One member: a single photo or recording, with room for a long one. */
  zipMemberBytes: 256 * MIB,
  /** `backup.daylio`: base64 JSON, decoded into several copies in memory. */
  backupJsonBytes: 64 * MIB,
  /** Entries in the ZIP's central directory: 13 times the measured count. */
  zipEntries: 20_000,
  /** One entry name. Daylio's are about 45 bytes. */
  zipNameBytes: 1024,
  /** All entry names together, the name collections' real size. */
  zipTotalNameBytes: 4 * MIB,
  /** The picked CSV, checked before `File.text()`: ten times the measured file. */
  csvFileBytes: 32 * MIB,
  /** Rows: eighteen times the measured count. */
  csvRows: 200_000,
  /** Columns in a row. Daylio writes 8. */
  csvColumns: 64,
  /** One field, and one note handed to `htmlToText`: 370 times the longest measured. */
  fieldChars: 1 * MIB
} as const;

export function checkDaylioCsvFileSize(bytes: number): void {
  if (bytes > DAYLIO_BUDGET.csvFileBytes) {
    throw new ImportTooLargeError(`Daylio CSV is ${bytes} bytes; the limit is ${DAYLIO_BUDGET.csvFileBytes}`);
  }
}

/** A note about to go through `htmlToText`. */
export function checkDaylioField(value: string): string {
  if (value.length > DAYLIO_BUDGET.fieldChars) {
    throw new ImportTooLargeError(`a Daylio field is ${value.length} characters; the limit is ${DAYLIO_BUDGET.fieldChars}`);
  }
  return value;
}
