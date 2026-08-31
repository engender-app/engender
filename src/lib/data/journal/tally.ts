/* The tally area (phase 4 ticket 10, CONTEXT: "Tally event"). A misgendering
   or correct-gendering tap, its own record type: no mood, dimension values,
   tags or note, only a kind. Used to also carry an optional free-text
   context; register finding 32.4 dropped it, since nothing wrote it after
   ticket 21 removed its only entry point. `tally_event.context` still
   exists in the schema - a column with no reader or writer left, not
   dropped, since nothing forward-only migrations do can un-write it from
   whatever journals already hold. */

import type { SqliteDriver } from '../sqlite/driver';
import type { TallyEvent, TallyKind } from '../types';
import { mintUuid, now } from './support';

export interface TallyEventInput {
  kind: TallyKind;
  epochDay: number;
}

export interface TallyArea {
  /** Returns the event's id. */
  log(input: TallyEventInput): Promise<string>;
  /** One kind's events, oldest first. */
  getEvents(kind: TallyKind): Promise<TallyEvent[]>;
  /** One day's events, both kinds, in the order they were logged (phase 5
      deepening ticket 21). Both kinds together because the day view asks
      what happened, not how one counter moved. */
  getEventsOnDay(epochDay: number): Promise<TallyEvent[]>;
  /** Idempotent. */
  deleteEvent(id: string): Promise<void>;
}

export function makeTallyArea(driver: SqliteDriver): TallyArea {
  return {
    async log(input) {
      const uuid = mintUuid();
      await driver.run('INSERT INTO tally_event (uuid, epoch_day, kind, updated_at) VALUES (?, ?, ?, ?)', [
        uuid,
        input.epochDay,
        input.kind,
        now()
      ]);
      return uuid;
    },

    async getEvents(kind) {
      const rows = await driver.query<{ uuid: string; epoch_day: number; kind: TallyKind }>(
        'SELECT uuid, epoch_day, kind FROM tally_event WHERE kind = ? ORDER BY epoch_day, id',
        [kind]
      );
      return rows.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, kind: r.kind }));
    },

    async getEventsOnDay(epochDay) {
      const rows = await driver.query<{ uuid: string; epoch_day: number; kind: TallyKind }>(
        'SELECT uuid, epoch_day, kind FROM tally_event WHERE epoch_day = ? ORDER BY id',
        [epochDay]
      );
      return rows.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, kind: r.kind }));
    },

    async deleteEvent(id) {
      await driver.run('DELETE FROM tally_event WHERE uuid = ?', [id]);
    }
  };
}
