/* Bound both Daylio imports before allocation or parsing. Limits
   allow headroom over a ten-year fixture with 10,950 entries and
   about 1,500 photos: 3.2 MiB CSV, 6.2 MiB backup member, 2.7 KB
   longest note and 858 MiB attachments.

   The ZIP and inflated total share a 1 GiB limit because photos
   compress little. Keep dlb_file_too_large aligned with
   backupFileBytes in both catalogues. */

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
