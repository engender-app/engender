/* The sizes-and-fit log (phase 5 ticket 23, CONTEXT: "Size record"). A
   record is not an Entry: no mood, dimension values, tags or note beyond
   its own free-text fit note - the same reasoning Measurement and
   HairRemovalSession give for standing alone. No episode reference either,
   the same reason Measurement has none.

   Pairs with, and never duplicates, the body-measurements area
   (measurements.ts, phase 4 ticket 08): a measurement is a body dimension
   in a unit; a size record is what was bought and what fit, with no
   conversion or normalization across brands or sizing systems (the
   ticket's own out-of-scope line). */

import type { SqliteDriver } from '../sqlite/driver';
import { GARMENT_CATEGORIES, type GarmentCategoryKey } from '../garmentCategories';
import type { SizeRecord } from '../types';
import { assertChanged, mintUuid, now } from './support';

export interface SizeRecordInput {
  id?: string;
  epochDay: number;
  category: string;
  size: string;
  brand?: string;
  fitNote?: string;
}

export interface SizeRecordsArea {
  /** Every record, oldest first. */
  getRecords(): Promise<SizeRecord[]>;
  /** This category's records, oldest first - the trend view's own grouping. */
  getRecordsByCategory(category: string): Promise<SizeRecord[]>;
  /** Returns the record's id. Updating an unknown id throws; a category
      outside the closed vocabulary throws before anything is written. */
  upsertRecord(input: SizeRecordInput): Promise<string>;
  /** Idempotent. */
  deleteRecord(id: string): Promise<void>;
}

type SizeRecordRow = {
  uuid: string;
  epoch_day: number;
  category: string;
  size: string;
  brand: string;
  fit_note: string;
};

const toSizeRecord = (row: SizeRecordRow): SizeRecord => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  category: row.category,
  size: row.size,
  brand: row.brand,
  fitNote: row.fit_note
});

/** The schema's CHECK is the backstop (like hair_removal_session's area);
    this is what turns a bad value into a message naming the vocabulary it
    broke instead of a raw SQLite constraint failure. */
function assertValidCategory(category: string): void {
  if (!GARMENT_CATEGORIES.includes(category as GarmentCategoryKey)) {
    throw new Error(`invalid garment category: ${category}`);
  }
}

export function makeSizeRecordsArea(driver: SqliteDriver): SizeRecordsArea {
  return {
    async getRecords() {
      const rows = await driver.query<SizeRecordRow>(
        'SELECT uuid, epoch_day, category, size, brand, fit_note FROM size_record ORDER BY epoch_day, id'
      );
      return rows.map(toSizeRecord);
    },

    async getRecordsByCategory(category) {
      const rows = await driver.query<SizeRecordRow>(
        'SELECT uuid, epoch_day, category, size, brand, fit_note FROM size_record WHERE category = ? ORDER BY epoch_day, id',
        [category]
      );
      return rows.map(toSizeRecord);
    },

    async upsertRecord(input) {
      assertValidCategory(input.category);
      const brand = input.brand ?? '';
      const fitNote = input.fitNote ?? '';

      if (input.id) {
        const result = await driver.run(
          `UPDATE size_record
           SET epoch_day = ?, category = ?, size = ?, brand = ?, fit_note = ?, updated_at = ?
           WHERE uuid = ?`,
          [input.epochDay, input.category, input.size, brand, fitNote, now(), input.id]
        );
        assertChanged(result, `size record: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO size_record (uuid, epoch_day, category, size, brand, fit_note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuid, input.epochDay, input.category, input.size, brand, fitNote, now()]
      );
      return uuid;
    },

    async deleteRecord(id) {
      await driver.run('DELETE FROM size_record WHERE uuid = ?', [id]);
    }
  };
}
