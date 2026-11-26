/* The Daylio input budget as the backup importer meets it (security scan
   ticket 06). Limits and the measured export they come from:
   daylioInputBudget.ts. */

import { expect, test } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { emptyArchiveJournal } from '../journal/archiveSections';
import { daylioBackupPreview } from './daylioBackup';
import { ImportTooLargeError } from './daylioInputBudget';
import { tenYearBackup, TEN_YEAR_ENTRIES } from './test-support/daylio-ten-year';
import { daylioPayload, makeDaylioBackupFrom } from './test-support/daylio-backup';

const MIB = 1024 * 1024;
const naming = { tagLabels: () => [] };

/** A real tiny backup whose central directory claims `declared` bytes. */
function forgedMember(declared: number): Uint8Array {
  const real = zipSync({ 'backup.daylio': [strToU8('not base64'), { level: 6 }] });
  const forged = real.slice();
  for (let i = 0; i + 4 <= forged.length; i++) {
    if (forged[i] === 0x50 && forged[i + 1] === 0x4b && forged[i + 2] === 1 && forged[i + 3] === 2) {
      new DataView(forged.buffer, forged.byteOffset + i + 24, 4).setUint32(0, declared, true);
      return forged;
    }
  }
  throw new Error('no central directory record');
}

test('a backup.daylio declaring more than 64 MiB is refused before it is inflated', async () => {
  await expect(daylioBackupPreview(forgedMember(65 * MIB), emptyArchiveJournal(), naming)).rejects.toBeInstanceOf(
    ImportTooLargeError
  );
});

test('a backup.daylio just under the limit is read, and fails on its contents instead', async () => {
  await expect(daylioBackupPreview(forgedMember(60 * MIB), emptyArchiveJournal(), naming)).rejects.not.toBeInstanceOf(
    ImportTooLargeError
  );
});

test('a note over the field limit is refused before it reaches htmlToText', async () => {
  const payload = daylioPayload();
  (payload.dayEntries as Record<string, unknown>[])[0].note = '<'.repeat(MIB + 1);
  await expect(
    daylioBackupPreview(
      await makeDaylioBackupFrom(Buffer.from(JSON.stringify(payload)).toString('base64')),
      emptyArchiveJournal(),
      naming
    )
  ).rejects.toBeInstanceOf(ImportTooLargeError);
});

test('a realistic ten-year backup previews in full', async () => {
  const preview = await daylioBackupPreview(await tenYearBackup(), emptyArchiveJournal(), naming);
  expect(preview.journal.entries).toHaveLength(TEN_YEAR_ENTRIES);
}, 60_000);
