/* The labs area (PRD F30). An analyte is free text carried with a
   free-text unit, never converted or interpreted (CONTEXT: "Analyte"). */

import type { SqliteDriver } from '../sqlite/driver';
import type { DoseRoute, LabResult, LabTiming } from '../types';
import { drawUpperBound, labTimingFor, type LabDraw } from '../labTiming';
import { assertChanged, mintUuid, now } from './support';

/** The analytes offered before any result exists. Lowercase scientific
    names shown as-is, like every stored analyte. */
export const ANALYTE_PRESETS = ['estradiol', 'testosterone', 'prolactin'];

/** No `timing`: the dosing context is not something a caller supplies. It
    is derived here, from the dose log as it stands when the result is
    written, so that every path which creates a lab result gets stamped -
    the editor, the OCR import, the demo seed - rather than each remembering
    to. What a caller can change is the draw it was measured against. */
export interface LabResultInput {
  id?: string;
  epochDay: number;
  analyte: string;
  value: number;
  unit?: string;
  note?: string;
  /** Local wall-clock 'HH:MM'; omitted or null means the draw time is not
      known, and no hours figure is derived. */
  drawTime?: string | null;
  provider?: string;
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

type LabRow = {
  uuid: string;
  epoch_day: number;
  analyte: string;
  value: number;
  unit: string;
  note: string | null;
  draw_time: string | null;
  provider: string;
  timing_route: string | null;
  timing_hours: number | null;
  timing_day_of_interval: number | null;
};

const LAB_COLUMNS = `uuid, epoch_day, analyte, value, unit, note, draw_time, provider,
                     timing_route, timing_hours, timing_day_of_interval`;

/** The three timing columns collapsed into the arm their route names, so a
    result comes out with one figure rather than with two nulls beside it
    (types.ts).

    Nothing is defaulted. A row whose route says IM but whose day is null
    reads as no context at all, not as day 0: the figure would be this
    module inventing a fact about someone's bloodwork, and a row like that
    can only arrive from a build that wrote the columns differently. */
export function toLabTiming(row: LabRow): LabTiming | null {
  const route = row.timing_route as DoseRoute | null;
  if (route === null) return null;
  if (route === 'im' || route === 'sc') {
    return row.timing_day_of_interval === null ? null : { route, dayOfInterval: row.timing_day_of_interval };
  }
  return row.timing_hours === null ? null : { route, hoursSinceDose: row.timing_hours };
}

const toLabResult = (row: LabRow): LabResult => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  analyte: row.analyte,
  value: row.value,
  unit: row.unit,
  note: row.note ?? '',
  drawTime: row.draw_time,
  provider: row.provider,
  timing: toLabTiming(row)
});

/** A LabTiming as the columns that hold it. The inverse of toLabTiming. */
const timingColumns = (timing: LabTiming | null): [string | null, number | null, number | null] => {
  if (timing === null) return [null, null, null];
  return 'dayOfInterval' in timing
    ? [timing.route, null, timing.dayOfInterval]
    : [timing.route, timing.hoursSinceDose, null];
};

export function makeLabsArea(driver: SqliteDriver): LabsArea {
  const usedAnalytes = async (): Promise<string[]> => {
    const rows = await driver.query<{ analyte: string }>('SELECT DISTINCT analyte FROM lab_result ORDER BY analyte');
    return rows.map((r) => r.analyte);
  };

  const resultsFor = async (analyte: string): Promise<LabResult[]> => {
    const rows = await driver.query<LabRow>(
      `SELECT ${LAB_COLUMNS} FROM lab_result WHERE analyte = ? ORDER BY epoch_day, id`,
      [analyte]
    );
    return rows.map(toLabResult);
  };

  /** The draw's dosing context, measured now against the dose log as it
      stands now. Reads `dose_event` from inside the labs area on purpose:
      every path that creates a lab result then gets a context without
      knowing it needs one, where a caller-supplied figure would go missing
      the first time someone added a second creation path (the OCR import is
      already the second).

      A skipped dose is passed over. It is a dose that was expected and not
      taken, so hours since it would be hours since nothing happened; taken
      and changed both mean something went in. */
  const deriveTiming = async (draw: LabDraw): Promise<LabTiming | null> => {
    const rows = await driver.query<{ timestamp: number; route: string }>(
      `SELECT timestamp, route FROM dose_event
        WHERE timestamp <= ? AND status <> 'skipped'
        ORDER BY timestamp DESC, id DESC
        LIMIT 1`,
      [drawUpperBound(draw)]
    );
    if (rows.length === 0) return null;
    return labTimingFor(draw, { timestamp: rows[0].timestamp, route: rows[0].route as DoseRoute });
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

    /* Where the context is frozen. On insert it is derived from the dose log
       as it stands; on update it is carried through untouched, unless the
       draw itself moved.

       That is the whole of ticket 03's box 6: editing or correcting a dose
       event months later cannot reach a context already saved, because no
       edit to a dose passes through here. Correcting the draw's own day or
       time does recompute, because moving the draw voids the old figure
       outright rather than adjusting what it was measured from - and
       without that, a result saved with no draw time could never be given
       one afterwards, since the hours figure that unlocks would never be
       derived. */
    async upsertResult(input) {
      const draw: LabDraw = { epochDay: input.epochDay, drawTime: input.drawTime ?? null };
      const fields = [input.analyte, input.value, input.unit ?? '', input.note ?? '', input.provider ?? ''];

      if (input.id) {
        const existing = (
          await driver.query<Pick<LabRow, 'epoch_day' | 'draw_time' | 'timing_route' | 'timing_hours' | 'timing_day_of_interval'>>(
            'SELECT epoch_day, draw_time, timing_route, timing_hours, timing_day_of_interval FROM lab_result WHERE uuid = ?',
            [input.id]
          )
        )[0];
        /* Worded exactly as assertChanged words it, because a caller cannot
           tell the two apart: whether the id was missing at the read below or
           at the write, it named a result that is not there. */
        if (!existing) throw new Error(`unknown lab result: ${input.id}`);

        const moved = existing.epoch_day !== draw.epochDay || existing.draw_time !== draw.drawTime;
        const timing = moved
          ? timingColumns(await deriveTiming(draw))
          : ([existing.timing_route, existing.timing_hours, existing.timing_day_of_interval] as const);

        const result = await driver.run(
          `UPDATE lab_result
              SET epoch_day = ?, analyte = ?, value = ?, unit = ?, note = ?, provider = ?, draw_time = ?,
                  timing_route = ?, timing_hours = ?, timing_day_of_interval = ?, updated_at = ?
            WHERE uuid = ?`,
          [input.epochDay, ...fields, draw.drawTime, ...timing, now(), input.id]
        );
        assertChanged(result, `lab result: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO lab_result (uuid, epoch_day, analyte, value, unit, note, provider, draw_time,
                                 timing_route, timing_hours, timing_day_of_interval, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid, input.epochDay, ...fields, draw.drawTime, ...timingColumns(await deriveTiming(draw)), now()]
      );
      return uuid;
    },

    async deleteResult(id) {
      await driver.run('DELETE FROM lab_result WHERE uuid = ?', [id]);
    }
  };
}
