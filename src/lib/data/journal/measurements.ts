/* The measurements area (phase 4 ticket 08). Four fixed types - waist,
   hips, chest/bust and underbust - each a dated value carried in the unit
   it was logged in, never converted or interpreted (ADR-0012), the same
   rule labs.ts applies to an analyte's unit. No regimen-episode reference:
   a measurement has to work whether or not an episode exists. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Measurement } from '../types';
import { assertChanged, mintUuid, now } from './support';

export const MEASUREMENT_TYPES = ['waist', 'hips', 'chest', 'underbust'] as const satisfies readonly Measurement['type'][];

export interface MeasurementInput {
  id?: string;
  type: Measurement['type'];
  epochDay: number;
  value: number;
  unit: string;
}

/** One chart line: the measurements of one type that share a unit, oldest
    first. A value logged in cm and one logged in inches differ by a
    factor of about 2.5, so drawing them as one line would invent a change
    that never happened; two units are two lines (mirrors labs.ts's
    LabSeries). */
export interface MeasurementSeries {
  unit: string;
  measurements: Measurement[];
}

export interface MeasurementsArea {
  getMeasurements(type: Measurement['type']): Promise<Measurement[]>;
  /** This type's measurements split into one series per unit, oldest series
      first. */
  getSeries(type: Measurement['type']): Promise<MeasurementSeries[]>;
  /** Every type at once within a day range, for the photo-compare combined
      view (ticket 08): the same date range the two anchor photos span. */
  getMeasurementsInRange(fromEpochDay: number, toEpochDay: number): Promise<Measurement[]>;
  /** Returns the measurement's id. Updating an unknown id throws. */
  upsertMeasurement(input: MeasurementInput): Promise<string>;
  /** Idempotent. */
  deleteMeasurement(id: string): Promise<void>;
}

type MeasurementRow = {
  uuid: string;
  epoch_day: number;
  type: Measurement['type'];
  value: number;
  unit: string;
};

const toMeasurement = (row: MeasurementRow): Measurement => ({
  id: row.uuid,
  type: row.type,
  epochDay: row.epoch_day,
  value: row.value,
  unit: row.unit
});

export function makeMeasurementsArea(driver: SqliteDriver): MeasurementsArea {
  const measurementsFor = async (type: Measurement['type']): Promise<Measurement[]> => {
    const rows = await driver.query<MeasurementRow>(
      'SELECT uuid, epoch_day, type, value, unit FROM measurement WHERE type = ? ORDER BY epoch_day, id',
      [type]
    );
    return rows.map(toMeasurement);
  };

  return {
    getMeasurements: measurementsFor,

    /* Grouped in the app rather than by SQL, same reasoning as labs.ts:
       the key is the app's rule and the stored text is left alone. */
    async getSeries(type) {
      const series = new Map<string, MeasurementSeries>();
      for (const measurement of await measurementsFor(type)) {
        const unit = measurement.unit.trim();
        const existing = series.get(unit);
        if (existing) existing.measurements.push(measurement);
        else series.set(unit, { unit, measurements: [measurement] });
      }
      return [...series.values()];
    },

    async getMeasurementsInRange(fromEpochDay, toEpochDay) {
      const rows = await driver.query<MeasurementRow>(
        'SELECT uuid, epoch_day, type, value, unit FROM measurement WHERE epoch_day BETWEEN ? AND ? ORDER BY epoch_day, id',
        [fromEpochDay, toEpochDay]
      );
      return rows.map(toMeasurement);
    },

    async upsertMeasurement(input) {
      if (input.id) {
        const result = await driver.run(
          'UPDATE measurement SET epoch_day = ?, type = ?, value = ?, unit = ?, updated_at = ? WHERE uuid = ?',
          [input.epochDay, input.type, input.value, input.unit, now(), input.id]
        );
        assertChanged(result, `measurement: ${input.id}`);
        return input.id;
      }
      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO measurement (uuid, epoch_day, type, value, unit, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid, input.epochDay, input.type, input.value, input.unit, now()]
      );
      return uuid;
    },

    async deleteMeasurement(id) {
      await driver.run('DELETE FROM measurement WHERE uuid = ?', [id]);
    }
  };
}
