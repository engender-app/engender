/* The tally area (phase 4 ticket 10, CONTEXT: "Tally event"). A misgendering
   or correct-gendering tap, its own record type: no mood, dimension values,
   tags or note, only a kind and an optional free-text context. */

import type { SqliteDriver } from '../sqlite/driver';
import type { TallyEvent, TallyKind } from '../types';
import { assertChanged, mintUuid, now } from './support';

export interface TallyEventInput {
  kind: TallyKind;
  epochDay: number;
  context?: string;
}

export interface TallyArea {
  /** Returns the event's id. The one-tap counter calls this alone, with no
      context, so the tap itself is never gated on anything after it. */
  log(input: TallyEventInput): Promise<string>;
  /** Attaches context to an already-logged event - the sheet that follows a
      tap is optional, so the tap must not wait on it. Throws on an unknown
      id. */
  setContext(id: string, context: string): Promise<void>;
  /** One kind's events, oldest first. */
  getEvents(kind: TallyKind): Promise<TallyEvent[]>;
  /** Idempotent. */
  deleteEvent(id: string): Promise<void>;
}

export function makeTallyArea(driver: SqliteDriver): TallyArea {
  return {
    async log(input) {
      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO tally_event (uuid, epoch_day, kind, context, updated_at) VALUES (?, ?, ?, ?, ?)',
        [uuid, input.epochDay, input.kind, input.context ?? '', now()]
      );
      return uuid;
    },

    async setContext(id, context) {
      const result = await driver.run('UPDATE tally_event SET context = ?, updated_at = ? WHERE uuid = ?', [
        context,
        now(),
        id
      ]);
      assertChanged(result, `tally event: ${id}`);
    },

    async getEvents(kind) {
      const rows = await driver.query<{ uuid: string; epoch_day: number; kind: TallyKind; context: string | null }>(
        'SELECT uuid, epoch_day, kind, context FROM tally_event WHERE kind = ? ORDER BY epoch_day, id',
        [kind]
      );
      return rows.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, kind: r.kind, context: r.context ?? '' }));
    },

    async deleteEvent(id) {
      await driver.run('DELETE FROM tally_event WHERE uuid = ?', [id]);
    }
  };
}
