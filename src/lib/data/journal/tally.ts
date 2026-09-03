/* The tally area (phase 4 ticket 10, CONTEXT: "Tally event"). A misgendering
   or correct-gendering tap, its own record type: no mood, dimension values,
   tags or note, only a kind. Used to also carry an optional free-text
   context; register finding 32.4 dropped it, since nothing wrote it after
   ticket 21 removed its only entry point. `tally_event.context` still
   exists in the schema - a column with no reader or writer left, not
   dropped, since nothing forward-only migrations do can un-write it from
   whatever journals already hold.

   Flat, so its writes come from flat-area.ts. It exposes only the insert
   half: a tap is not edited, so `log` takes an input with no id and the
   factory's update branch is unreachable from here. */

import type { SqliteDriver } from '../sqlite/driver';
import type { TallyEvent, TallyKind } from '../types';
import { flatArea } from './flat-area';

export type TallyEventInput = Omit<TallyEvent, 'id'>;

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
  const events = flatArea<TallyEvent>(driver, {
    table: 'tally_event',
    columns: { epochDay: 'epoch_day', kind: 'kind' }
  });

  return {
    log: events.upsert,

    getEvents: (kind) => events.read('WHERE kind = ? ORDER BY epoch_day, id', [kind]),

    getEventsOnDay: (epochDay) => events.read('WHERE epoch_day = ? ORDER BY id', [epochDay]),

    deleteEvent: events.delete
  };
}
