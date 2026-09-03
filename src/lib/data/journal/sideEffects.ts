/* The side-effect area (phase 4 ticket 06). A side effect is not an Entry
   (CONTEXT: "Side effect"): no mood, dimension values, tags or note, and no
   regimen-episode reference - it has to work whether or not a regimen
   episode exists.

   getSideEffectsInRange is ticket 12's read path: it pulls a range with no
   query logic of ticket 12's own, the same way stats.ts's fromEpochDay/
   toEpochDay reads do.

   Flat, so its three writes come from flatArea.ts, with the severity check
   passed in as that factory's pre-write guard. */

import type { SqliteDriver } from '../sqlite/driver';
import type { SideEffect } from '../types';
import { flatArea, type FlatInput } from './flatArea';

export const MIN_SEVERITY = 1;
export const MAX_SEVERITY = 5;

export type SideEffectInput = FlatInput<SideEffect>;

export interface SideEffectsArea {
  getSideEffects(): Promise<SideEffect[]>;
  getSideEffectsInRange(fromEpochDay: number, toEpochDay: number): Promise<SideEffect[]>;
  /** The day of the most recent side effect at or before `todayEpochDay`, or
      null if there is none (phase 8 features ticket 03, lastWrite.ts). */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** Returns the side effect's id. Updating an unknown id throws; an
      out-of-range severity throws before anything is written. */
  upsertSideEffect(input: SideEffectInput): Promise<string>;
  /** Idempotent. */
  deleteSideEffect(id: string): Promise<void>;
}

/** The schema's CHECK is the backstop (like reminder's recurrence); this is
    what turns a bad value into a message naming the ticket's own scale
    instead of a raw SQLite constraint failure. */
function assertValidSeverity(severity: number): void {
  if (!Number.isInteger(severity) || severity < MIN_SEVERITY || severity > MAX_SEVERITY) {
    throw new Error(`invalid severity: ${severity}`);
  }
}

export function makeSideEffectsArea(driver: SqliteDriver): SideEffectsArea {
  const effects = flatArea<SideEffect>(driver, {
    table: 'side_effect',
    columns: { name: 'name', severity: 'severity', epochDay: 'epoch_day' },
    guard: (input) => assertValidSeverity(input.severity)
  });

  return {
    getSideEffects: () => effects.read('ORDER BY epoch_day, id'),

    getSideEffectsInRange: (fromEpochDay, toEpochDay) =>
      effects.read('WHERE epoch_day BETWEEN ? AND ? ORDER BY epoch_day, id', [fromEpochDay, toEpochDay]),

    async lastWriteEpochDay(todayEpochDay) {
      const [latest] = await effects.read('WHERE epoch_day <= ? ORDER BY epoch_day DESC LIMIT 1', [todayEpochDay]);
      return latest?.epochDay ?? null;
    },

    upsertSideEffect: effects.upsert,
    deleteSideEffect: effects.delete
  };
}
