/* The sizes-and-fit log (phase 5 ticket 23, CONTEXT: "Size record"). A
   record is not an Entry: no mood, dimension values, tags or note beyond
   its own free-text fit note - the same reasoning Measurement and
   HairRemovalSession give for standing alone. No episode reference either,
   the same reason Measurement has none.

   Pairs with, and never duplicates, the body-measurements area
   (measurements.ts, phase 4 ticket 08): a measurement is a body dimension
   in a unit; a size record is what was bought and what fit, with no
   conversion or normalization across brands or sizing systems (the
   ticket's own out-of-scope line).

   Flat, so its three writes come from flatArea.ts, with the category check
   passed in as that factory's pre-write guard. The one thing upsertRecord
   still does itself is settle its two optional fields: a record with no
   brand and no fit note stores empty strings, and a default is the area's
   own answer rather than something flatArea.ts should learn to describe. */

import type { SqliteDriver } from '../sqlite/driver';
import { GARMENT_CATEGORIES, type GarmentCategoryKey } from '../garmentCategories';
import type { SizeRecord } from '../types';
import { flatArea } from './flatArea';

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
  /** One day's records, across categories (phase 5 deepening ticket 21). */
  getRecordsOnDay(epochDay: number): Promise<SizeRecord[]>;
  /** The day of the most recent record of any category at or before
      `todayEpochDay`, or null if there is none (phase 8 features ticket 03,
      lastWrite.ts). */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** Returns the record's id. Updating an unknown id throws; a category
      outside the closed vocabulary throws before anything is written. */
  upsertRecord(input: SizeRecordInput): Promise<string>;
  /** Idempotent. */
  deleteRecord(id: string): Promise<void>;
}

/** The schema's CHECK is the backstop (like hair_removal_session's area);
    this is what turns a bad value into a message naming the vocabulary it
    broke instead of a raw SQLite constraint failure. */
function assertValidCategory(category: string): void {
  if (!GARMENT_CATEGORIES.includes(category as GarmentCategoryKey)) {
    throw new Error(`invalid garment category: ${category}`);
  }
}

export function makeSizeRecordsArea(driver: SqliteDriver): SizeRecordsArea {
  const records = flatArea<SizeRecord>(driver, {
    table: 'size_record',
    columns: {
      epochDay: 'epoch_day',
      category: 'category',
      size: 'size',
      brand: 'brand',
      fitNote: 'fit_note'
    },
    guard: (input) => assertValidCategory(input.category)
  });

  return {
    getRecords: () => records.read('ORDER BY epoch_day, id'),

    getRecordsOnDay: (epochDay) => records.read('WHERE epoch_day = ? ORDER BY id', [epochDay]),

    getRecordsByCategory: (category) => records.read('WHERE category = ? ORDER BY epoch_day, id', [category]),

    async lastWriteEpochDay(todayEpochDay) {
      const [latest] = await records.read('WHERE epoch_day <= ? ORDER BY epoch_day DESC LIMIT 1', [todayEpochDay]);
      return latest?.epochDay ?? null;
    },

    upsertRecord: (input) => records.upsert({ ...input, brand: input.brand ?? '', fitNote: input.fitNote ?? '' }),

    deleteRecord: records.delete
  };
}
