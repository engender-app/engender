/* Voice benchmarks (phase 5 deepening ticket 15, CONTEXT: "Voice
   benchmark").

   Its own table and its own area, deliberately not part of voiceRecordings.ts.
   A recording is a memo on one entry. A benchmark belongs to a day and only
   means anything because its conditions were fixed - the same passage, the
   same held vowel, the same quality floor - which is what makes two of them
   six months apart comparable. Nothing about that fits on voice_recording,
   and nothing here touches it.

   Files before rows, the ordering photos.ts's header sets out and
   voiceRecordings.ts follows: both takes are written through the injected
   PhotoFileStore before the row that names them exists, so a crash in the
   gap leaves a file no row references (which the boot sweep reclaims) rather
   than a row pointing at audio that is not there. The bytes are what
   MediaRecorder produced, stored as they arrived; the store the journal is
   handed is already the encrypting one (photos/encrypted-file-store.ts, ADR
   -0018/-0020), so nothing in this module encrypts anything itself.

   The acoustic figures arrive computed. The analysis is pure (lib/audio/)
   and runs where the audio can be decoded, which is the browser; this area
   stores what it is handed and reads it back, exactly as photos.ts stores
   bytes it never re-encodes. */

import type { SqliteDriver } from '../sqlite/driver';
import type { VoiceBenchmark } from '../types';
import type { PhotoFileStore } from './journal';
import { removeRecordingFilesAfterCommit, stageRecording } from './voiceRecordings';
import { mintUuid, now } from './support';

/** What the recording flow hands over: a day, which passage was read, the
    two takes' bytes, and the numbers the engine got out of them.

    `vowelAudio` is null when the vowel step was skipped or never cleared the
    gate, and `f1Hz`/`f2Hz`/`snrDb` are null with it - a benchmark with a
    passage and no resonance is a valid benchmark, not a failed one. */
export interface NewVoiceBenchmark {
  epochDay: number;
  /** Which passage was read. A benchmark is comparable only to others from
      the same passage (CONTEXT: "Benchmark passage"), which is why the row
      says rather than the surface guessing. */
  passageKey: string;
  passageAudio: Uint8Array;
  vowelAudio: Uint8Array | null;
  f0MedianHz: number;
  f0P10Hz: number;
  f0P90Hz: number;
  semitoneSd: number;
  wordsPerMinute: number;
  f1Hz: number | null;
  f2Hz: number | null;
  snrDb: number | null;
  /** The person's own words about this take. Not the musical note of the
      median - that follows from `f0MedianHz` and is derived at display time
      (ADR-0010, audio/pitch.ts's noteName). */
  note?: string | null;
}

export interface VoiceBenchmarksArea {
  /** Every benchmark, oldest first. */
  getBenchmarks(): Promise<VoiceBenchmark[]>;
  /** The benchmarks recorded on one day (phase 5 deepening ticket 21). Its
      own query rather than a filter over that one, so the day view pays for
      the day it is showing. */
  getBenchmarksOnDay(epochDay: number): Promise<VoiceBenchmark[]>;
  /** Writes both takes, then the row. Returns the benchmark's uuid. */
  saveBenchmark(input: NewVoiceBenchmark): Promise<string>;
  /** Removes the row, then both audio files (ticket 16) - the row-then-files
      ordering voiceRecordings.ts's own delete helper already carries.
      Idempotent, like the journal's other deletes: a row already gone
      leaves nothing to remove. */
  deleteBenchmark(id: string): Promise<void>;
}

type BenchmarkRow = {
  uuid: string;
  epoch_day: number;
  timestamp: number;
  passage_key: string;
  passage_file_path: string;
  vowel_file_path: string | null;
  f0_median_hz: number;
  f0_p10_hz: number;
  f0_p90_hz: number;
  semitone_sd: number;
  words_per_minute: number;
  f1_hz: number | null;
  f2_hz: number | null;
  snr_db: number | null;
  note: string | null;
};

const toBenchmark = (row: BenchmarkRow): VoiceBenchmark => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  timestamp: row.timestamp,
  passageKey: row.passage_key,
  passageFileName: row.passage_file_path,
  vowelFileName: row.vowel_file_path,
  f0MedianHz: row.f0_median_hz,
  f0P10Hz: row.f0_p10_hz,
  f0P90Hz: row.f0_p90_hz,
  semitoneSd: row.semitone_sd,
  wordsPerMinute: row.words_per_minute,
  f1Hz: row.f1_hz,
  f2Hz: row.f2_hz,
  snrDb: row.snr_db,
  note: row.note
});

const BENCHMARK_COLUMNS = `uuid, epoch_day, timestamp, passage_key, passage_file_path, vowel_file_path,
   f0_median_hz, f0_p10_hz, f0_p90_hz, semitone_sd, words_per_minute, f1_hz, f2_hz, snr_db, note`;

export function makeVoiceBenchmarksArea(driver: SqliteDriver, files: PhotoFileStore): VoiceBenchmarksArea {
  return {
    async getBenchmarks() {
      const rows = await driver.query<BenchmarkRow>(
        `SELECT ${BENCHMARK_COLUMNS} FROM voice_benchmark ORDER BY epoch_day, id`
      );
      return rows.map(toBenchmark);
    },

    async getBenchmarksOnDay(epochDay) {
      const rows = await driver.query<BenchmarkRow>(
        `SELECT ${BENCHMARK_COLUMNS} FROM voice_benchmark WHERE epoch_day = ? ORDER BY id`,
        [epochDay]
      );
      return rows.map(toBenchmark);
    },

    async saveBenchmark(input) {
      // stageRecording mints the uuid and writes the bytes under it, the
      // same call an entry's voice memo goes through - a benchmark's takes
      // are the same kind of file in the same store.
      const passage = await stageRecording(files, input.passageAudio);
      const vowel = input.vowelAudio ? await stageRecording(files, input.vowelAudio) : null;

      const uuid = mintUuid();
      const timestamp = now();
      await driver.run(
        `INSERT INTO voice_benchmark (${BENCHMARK_COLUMNS}, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid,
          input.epochDay,
          timestamp,
          input.passageKey,
          passage.fileName,
          vowel?.fileName ?? null,
          input.f0MedianHz,
          input.f0P10Hz,
          input.f0P90Hz,
          input.semitoneSd,
          input.wordsPerMinute,
          input.f1Hz,
          input.f2Hz,
          input.snrDb,
          input.note ?? null,
          timestamp
        ]
      );
      return uuid;
    },

    async deleteBenchmark(id) {
      const rows = await driver.query<{ passage_file_path: string; vowel_file_path: string | null }>(
        'SELECT passage_file_path, vowel_file_path FROM voice_benchmark WHERE uuid = ?',
        [id]
      );
      await driver.run('DELETE FROM voice_benchmark WHERE uuid = ?', [id]);
      const filePaths = rows.flatMap((row) =>
        row.vowel_file_path ? [row.passage_file_path, row.vowel_file_path] : [row.passage_file_path]
      );
      await removeRecordingFilesAfterCommit(
        files,
        filePaths.map((file_path) => ({ file_path }))
      );
    }
  };
}
