/* The measurements area (phase 4 ticket 08). Each dated value is carried
   in the unit it was logged in, never converted or interpreted
   (ADR-0012), the same rule labs.ts applies to an analyte's unit. No
   regimen-episode reference: a measurement has to work whether or not an
   episode exists.

   The type a measurement is logged under is its own open vocabulary
   (phase 5 ticket 29, `measurement_type`) rather than the four fixed
   values it started as: a built-in hides rather than deletes, and a
   custom is minted with a uuid that doubles as its key, exactly
   addCustomDimension's pattern (dimensions.ts). Nothing here validates
   `type` against that table - the same free-text-but-matched-by-key
   treatment `entry_body_region.region` and `lab_result.analyte` already
   get - so a measurement logged under a type since hidden, or one an
   older build minted before a newer one renamed nothing, still round-
   trips exactly as logged.

   The measurements themselves are flat, so their three writes come from
   flatArea.ts. The type table below is not: its rows are reference data
   keyed by `key`, hidden rather than deleted, and it keeps its own SQL. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Measurement, MeasurementType } from '../types';
import { flatArea, type FlatInput } from './flatArea';
import { assertChanged, bool, mintUuid, now } from './support';

export type MeasurementInput = FlatInput<Measurement>;

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
  getMeasurements(type: string): Promise<Measurement[]>;
  /** This type's measurements split into one series per unit, oldest series
      first. */
  getSeries(type: string): Promise<MeasurementSeries[]>;
  /** Every type at once within a day range, for the photo-compare combined
      view (ticket 08): the same date range the two anchor photos span. */
  getMeasurementsInRange(fromEpochDay: number, toEpochDay: number): Promise<Measurement[]>;
  /** The day of the most recent measurement of any type at or before
      `todayEpochDay`, or null if there is none (phase 8 features ticket 03,
      lastWrite.ts). One bounded row, not `getMeasurementsInRange(0, 999999)`
      reduced in JS the way `liveTiles.ts` used to. */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** How many measurements are stored, over every type. One `COUNT(*)`, the
      same shape `entries.countAll` is: a surface asking whether anything has
      ever been measured has no business holding every measurement to find
      out. */
  countAll(): Promise<number>;
  /** Returns the measurement's id. Updating an unknown id throws. */
  upsertMeasurement(input: MeasurementInput): Promise<string>;
  /** Idempotent. */
  deleteMeasurement(id: string): Promise<void>;
  /** Every measurement type, built-in and custom, hidden ones included -
      what the settings screen manages. Built-in first (insertion order),
      then customs in the order they were added. */
  getMeasurementTypes(): Promise<MeasurementType[]>;
  /** The minted uuid doubles as the key, exactly addCustomDimension's
      pattern (dimensions.ts). */
  addCustomMeasurementType(name: string): Promise<MeasurementType>;
  /** Built-in and custom alike hide, never delete (CONTEXT: "Hidden") -
      every measurement already logged against a hidden type survives and
      still charts, it is only the picker that stops offering the type. */
  setMeasurementTypeHidden(key: string, hidden: boolean): Promise<void>;
}

type MeasurementTypeRow = {
  uuid: string | null;
  key: string;
  name: string;
  is_built_in: number;
  hidden: number;
};

const toMeasurementType = (row: MeasurementTypeRow): MeasurementType => ({
  key: row.key,
  name: row.name,
  builtIn: bool(row.is_built_in),
  hidden: bool(row.hidden)
});

export function makeMeasurementsArea(driver: SqliteDriver): MeasurementsArea {
  const measurements = flatArea<Measurement>(driver, {
    table: 'measurement',
    columns: { type: 'type', epochDay: 'epoch_day', value: 'value', unit: 'unit' }
  });

  const measurementsFor = (type: string): Promise<Measurement[]> =>
    measurements.read('WHERE type = ? ORDER BY epoch_day, id', [type]);

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

    getMeasurementsInRange: (fromEpochDay, toEpochDay) =>
      measurements.read('WHERE epoch_day BETWEEN ? AND ? ORDER BY epoch_day, id', [fromEpochDay, toEpochDay]),

    async lastWriteEpochDay(todayEpochDay) {
      const [latest] = await measurements.read('WHERE epoch_day <= ? ORDER BY epoch_day DESC LIMIT 1', [
        todayEpochDay
      ]);
      return latest?.epochDay ?? null;
    },

    async countAll() {
      const rows = await driver.query<{ n: number }>('SELECT COUNT(*) AS n FROM measurement');
      return rows[0].n;
    },

    upsertMeasurement: measurements.upsert,

    deleteMeasurement: measurements.delete,

    async getMeasurementTypes() {
      const rows = await driver.query<MeasurementTypeRow>(
        'SELECT uuid, key, name, is_built_in, hidden FROM measurement_type ORDER BY id'
      );
      return rows.map(toMeasurementType);
    },

    async addCustomMeasurementType(name) {
      // The minted uuid doubles as the key: measurement_type.key is NOT
      // NULL for built-ins' sake, and one identity is enough for a custom.
      const uuid = mintUuid();
      await driver.run('INSERT INTO measurement_type (uuid, key, name, is_built_in, updated_at) VALUES (?, ?, ?, 0, ?)', [
        uuid,
        uuid,
        name,
        now()
      ]);
      return { key: uuid, name, builtIn: false, hidden: false };
    },

    async setMeasurementTypeHidden(key, hidden) {
      const result = await driver.run('UPDATE measurement_type SET hidden = ?, updated_at = ? WHERE key = ?', [
        hidden ? 1 : 0,
        now(),
        key
      ]);
      assertChanged(result, `measurement type: ${key}`);
    }
  };
}
