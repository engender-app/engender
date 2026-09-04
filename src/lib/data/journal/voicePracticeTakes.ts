/* Practice takes (phase 8 features ticket 10, CONTEXT: "Pitch track" sits
   beside this without covering it).

   A benchmark is a fixed, comparable measurement; a practice take is what a
   person does with their voice most other days, and it gets its own table
   for the reason voiceBenchmarks.ts's own header gives for voice_benchmark
   itself standing apart from entry: the two are different activities and
   never compared (this ticket's Out of Scope).

   Flat, so its three writes come from flatArea.ts and only the reads and the
   seal are its own. `sealedUntilEpochDay` is always `epochDay + 1`, decided
   at write time and never edited afterwards - see migrations.ts's v59
   comment for why the day is fixed rather than chosen. */

import type { SqliteDriver } from '../sqlite/driver';
import type { VoicePracticeTake } from '../types';
import { flatArea } from './flatArea';

export interface VoicePracticeTakeInput {
  epochDay: number;
  minHz: number;
  maxHz: number;
  medianHz: number;
  feltSense: number | null;
}

export interface VoicePracticeTakesArea {
  /** Newest first. */
  getTakes(): Promise<VoicePracticeTake[]>;
  /** One day's takes (phase 8 features ticket 10, day.ts). */
  getTakesOnDay(epochDay: number): Promise<VoicePracticeTake[]>;
  /** The day of the most recent take at or before `todayEpochDay`, or null
      if there is none (phase 8 features ticket 03, lastWrite.ts). */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** Returns the take's id. Sealed until the day after `input.epochDay`. */
  addTake(input: VoicePracticeTakeInput): Promise<string>;
  /** Idempotent. */
  deleteTake(id: string): Promise<void>;
}

/** A mood outside the five-level scale is refused before it is written, the
    same guard feltSense.ts's own `add` gives its mood - moodFace.ts only
    draws five faces. */
function assertValidFeltSense(feltSense: number | null): void {
  if (feltSense === null) return;
  if (!Number.isInteger(feltSense) || feltSense < 1 || feltSense > 5) {
    throw new Error(`invalid felt sense: ${feltSense}`);
  }
}

export function makeVoicePracticeTakesArea(driver: SqliteDriver): VoicePracticeTakesArea {
  const takes = flatArea<VoicePracticeTake>(driver, {
    table: 'voice_practice_take',
    columns: {
      epochDay: 'epoch_day',
      minHz: 'min_hz',
      maxHz: 'max_hz',
      medianHz: 'median_hz',
      feltSense: 'felt_sense',
      sealedUntilEpochDay: 'sealed_until_epoch_day'
    },
    guard: (input) => assertValidFeltSense(input.feltSense)
  });

  return {
    getTakes: () => takes.read('ORDER BY epoch_day DESC, id DESC'),

    getTakesOnDay: (epochDay) => takes.read('WHERE epoch_day = ? ORDER BY id', [epochDay]),

    async lastWriteEpochDay(todayEpochDay) {
      const [latest] = await takes.read('WHERE epoch_day <= ? ORDER BY epoch_day DESC LIMIT 1', [todayEpochDay]);
      return latest?.epochDay ?? null;
    },

    addTake: (input) =>
      takes.upsert({
        ...input,
        sealedUntilEpochDay: input.epochDay + 1
      }),

    deleteTake: takes.delete
  };
}
