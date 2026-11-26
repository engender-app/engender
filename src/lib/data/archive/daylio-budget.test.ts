/* The Daylio CSV input budget (security scan ticket 06). Limits and the
   measured export they come from: daylioInputBudget.ts. */

import { expect, test } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections';
import { daylioPreview } from './daylio';
import { checkDaylioCsvFileSize, DAYLIO_BUDGET, ImportTooLargeError } from './daylioInputBudget';
import { tenYearCsv, TEN_YEAR_ENTRIES } from './test-support/daylio-ten-year';

const HEADER = 'full_date,date,weekday,time,mood,activities,note_title,note';
const naming = { tagLabels: () => [] };
const preview = (csv: string) => daylioPreview(csv, emptyArchiveJournal(), naming);

test('a CSV file one byte over the limit is refused, one at the limit is not', () => {
  expect(() => checkDaylioCsvFileSize(DAYLIO_BUDGET.csvFileBytes)).not.toThrow();
  expect(() => checkDaylioCsvFileSize(DAYLIO_BUDGET.csvFileBytes + 1)).toThrow(ImportTooLargeError);
});

test('text over the file limit is refused before any row is read', async () => {
  await expect(preview(HEADER + '\n' + 'x'.repeat(DAYLIO_BUDGET.csvFileBytes))).rejects.toBeInstanceOf(
    ImportTooLargeError
  );
});

test('more rows than the limit are refused', async () => {
  const rows = (HEADER + '\n' + ',,,,,,,\n'.repeat(DAYLIO_BUDGET.csvRows + 1)).replace(/,,,,,,,\n/g, 'a,,,,,,,\n');
  await expect(preview(rows)).rejects.toBeInstanceOf(ImportTooLargeError);
});

test('a field over the limit is refused, quoted or not', async () => {
  const long = 'n'.repeat(DAYLIO_BUDGET.fieldChars + 1);
  await expect(preview(`${HEADER}\n2026-01-01,,,8:00,Rad,,,"${long}"`)).rejects.toBeInstanceOf(ImportTooLargeError);
  await expect(preview(`${HEADER}\n2026-01-01,,,8:00,Rad,,,${long}`)).rejects.toBeInstanceOf(ImportTooLargeError);
});

test('a row with more columns than the limit is refused', async () => {
  await expect(preview(`${HEADER}\n${','.repeat(DAYLIO_BUDGET.csvColumns + 1)}`)).rejects.toBeInstanceOf(
    ImportTooLargeError
  );
});

test('a realistic ten-year CSV previews in full', async () => {
  const csv = tenYearCsv();
  expect(csv.length).toBeLessThan(DAYLIO_BUDGET.csvFileBytes / 8);
  expect((await preview(csv)).entryCount).toBe(TEN_YEAR_ENTRIES);
}, 60_000);

test('a field exactly at the limit is accepted', async () => {
  const exact = 'n'.repeat(DAYLIO_BUDGET.fieldChars);
  expect((await preview(`${HEADER}\n2026-01-01,,,8:00,Rad,,,"${exact}"`)).entryCount).toBe(1);
}, 30_000);
