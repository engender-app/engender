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

/** One chart line: the results of one analyte that share a unit, oldest
    first. `unit` is the normalized text, blank for the unlabeled series. */
export interface LabSeries {
  unit: string;
  results: LabResult[];
}

/** The unit as a series key. Surrounding whitespace is an artefact of typing,
    so it goes. Nothing else does: deciding that `ng/dl` and `ng/dL` name the
    same unit is an interpretation this app does not make, and the one after
    that would be converting between them (CONTEXT: "Analyte"). */
export function normalizeUnit(unit: string): string {
  return unit.trim();
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
  /** The analyte's results split into one series per unit, oldest series
      first. A result logged in ng/dL and one logged in nmol/L differ by a
      factor of about 29, so drawing them as one line invents a change that
      never happened; two units are two lines and are never joined. */
  getSeries(analyte: string): Promise<LabSeries[]>;
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

  const resultsFor = async (analyte: string): Promise<LabResult[]> => {
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
  };

  return {
    async getAnalytes() {
      return [...new Set([...ANALYTE_PRESETS, ...(await usedAnalytes())])];
    },

    getUsedAnalytes: usedAnalytes,

    getResults: resultsFor,

    /* Grouped in the app rather than by SQL, because the key is the app's
       rule and the stored text is left alone (no migration, nothing
       rewritten). Series come out in the order their first result was
       drawn, so a unit switch reads as a new line after the old one rather
       than as a reshuffle. */
    async getSeries(analyte) {
      const series = new Map<string, LabSeries>();
      for (const result of await resultsFor(analyte)) {
        const unit = normalizeUnit(result.unit);
        const existing = series.get(unit);
        if (existing) existing.results.push(result);
        else series.set(unit, { unit, results: [result] });
      }
      return [...series.values()];
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
