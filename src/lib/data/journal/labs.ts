/* The labs area (PRD F30). An analyte is free text carried with a
   free-text unit, never converted or interpreted (CONTEXT: "Analyte"). */

import type { SqliteDriver } from '../sqlite/driver';
import type { LabResult } from '../types';
import { assertChanged, mintUuid, now } from './support';

/** The analytes offered before any result exists. Lowercase scientific
    names shown as-is, like every stored analyte. */
export const ANALYTE_PRESETS = ['estradiol', 'testosterone', 'prolactin'];

export interface LabResultInput {
  id?: string;
  epochDay: number;
  analyte: string;
  value: number;
  unit?: string;
  note?: string;
}

export interface LabsArea {
  /** Presets plus in-use: a preset is offerable with no data yet, and a
      custom analyte someone logged once stays offerable. */
  getAnalytes(): Promise<string[]>;
  /** In-use analytes only, which is what the trend picker offers: a trend
      needs data, so a preset with no result behind it is not a trend to
      switch to. */
  getUsedAnalytes(): Promise<string[]>;
  getResults(analyte: string): Promise<LabResult[]>;
  /** Returns the result's id. Updating an unknown id throws. */
  upsertResult(input: LabResultInput): Promise<string>;
  /** Idempotent. */
  deleteResult(id: string): Promise<void>;
}

export function makeLabsArea(driver: SqliteDriver): LabsArea {
  const usedAnalytes = async (): Promise<string[]> => {
    const rows = await driver.query<{ analyte: string }>('SELECT DISTINCT analyte FROM lab_result ORDER BY analyte');
    return rows.map((r) => r.analyte);
  };

  return {
    async getAnalytes() {
      return [...new Set([...ANALYTE_PRESETS, ...(await usedAnalytes())])];
    },

    getUsedAnalytes: usedAnalytes,

    async getResults(analyte) {
      const rows = await driver.query<{ uuid: string; epoch_day: number; analyte: string; value: number; unit: string; note: string | null }>(
        'SELECT uuid, epoch_day, analyte, value, unit, note FROM lab_result WHERE analyte = ? ORDER BY epoch_day, id',
        [analyte]
      );
      return rows.map((r) => ({
        id: r.uuid,
        epochDay: r.epoch_day,
        analyte: r.analyte,
        value: r.value,
        unit: r.unit,
        note: r.note ?? ''
      }));
    },

    async upsertResult(input) {
      if (input.id) {
        const result = await driver.run(
          'UPDATE lab_result SET epoch_day = ?, analyte = ?, value = ?, unit = ?, note = ?, updated_at = ? WHERE uuid = ?',
          [input.epochDay, input.analyte, input.value, input.unit ?? '', input.note ?? '', now(), input.id]
        );
        assertChanged(result, `lab result: ${input.id}`);
        return input.id;
      }
      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO lab_result (uuid, epoch_day, analyte, value, unit, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid, input.epochDay, input.analyte, input.value, input.unit ?? '', input.note ?? '', now()]
      );
      return uuid;
    },

    async deleteResult(id) {
      await driver.run('DELETE FROM lab_result WHERE uuid = ?', [id]);
    }
  };
}
