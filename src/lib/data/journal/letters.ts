/* Time-capsule letters (phase 4 ticket 19, CONTEXT: "Milestone",
   "Countdown", "Anniversary"): a free-write note sealed until a chosen
   unlock day. This area owns the text and its unlock day and nothing else
   - the same "own record type" reasoning doubtJournal.ts gives for a
   doubt entry - and stores no seal state of its own; letterStatus.ts
   derives sealed/unlocked from `unlockEpochDay` against today
   (ADR-0010). No second cryptographic layer: the row is protected
   exactly as every other journal row already is, by the journal's
   whole-database encryption (ADR-0020). */

import type { SqliteDriver } from '../sqlite/driver';
import type { Letter } from '../types';
import { mintUuid, now } from './support';

export interface LetterInput {
  epochDay: number;
  text: string;
  unlockEpochDay: number;
}

export interface LettersArea {
  /** Newest first. */
  getLetters(limit: number): Promise<Letter[]>;
  /** Returns the letter's id. Throws on blank text: a letter's one field
      is the whole point of the record, unlike Entry's "at least one of
      six" rule. */
  addLetter(input: LetterInput): Promise<string>;
  /** Idempotent, like the journal's other deletes. */
  deleteLetter(id: string): Promise<void>;
}

type LetterRow = { uuid: string; epoch_day: number; text: string; unlock_epoch_day: number };

const toLetter = (row: LetterRow): Letter => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  text: row.text,
  unlockEpochDay: row.unlock_epoch_day
});

export function makeLettersArea(driver: SqliteDriver): LettersArea {
  return {
    async getLetters(limit) {
      const rows = await driver.query<LetterRow>(
        'SELECT uuid, epoch_day, text, unlock_epoch_day FROM letter ORDER BY epoch_day DESC, id DESC LIMIT ?',
        [limit]
      );
      return rows.map(toLetter);
    },

    async addLetter(input) {
      if (input.text.trim().length === 0) throw new Error('a letter needs some text');

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO letter (uuid, epoch_day, text, unlock_epoch_day, updated_at) VALUES (?, ?, ?, ?, ?)',
        [uuid, input.epochDay, input.text, input.unlockEpochDay, now()]
      );
      return uuid;
    },

    async deleteLetter(id) {
      await driver.run('DELETE FROM letter WHERE uuid = ?', [id]);
    }
  };
}
