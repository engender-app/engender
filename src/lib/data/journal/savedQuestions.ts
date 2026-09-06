/* The saved question area (phase 8 features ticket 06, CONTEXT.md: "Saved
   question"). Rows only - what a saved question is asked as is
   savedQuestionQuery.ts's job, read from journal.ts's own callers, not this
   area's business.

   Flat, so upsert and delete come from flatArea.ts (ADR-0027, ADR-0053) and
   only the one read and the storage shape are this module's own.
   `tagIds`/`moods` are the one thing `flatArea` cannot state: it stores a
   value straight into a column with no conversion, and neither field is a
   scalar SQLite can hold. They travel as a comma-joined column instead, and
   this module is the one place that joins and splits them - `flatArea` never
   sees an array, and every reader of `SavedQuestion` never sees a CSV
   string. `hasNote`/`hasPhoto` get the same treatment for the reason
   `areaStates.ts` already gives: node:sqlite has no boolean binding, so
   every write here goes through the same 0/1 convention that module's
   `hidden` column uses. */

import type { SqliteDriver } from '../sqlite/driver';
import type { SavedQuestion } from '../types';
import { flatArea, type FlatInput } from './flatArea';

type SavedQuestionInput = FlatInput<SavedQuestion>;

export interface SavedQuestionsArea {
  /** Every saved question, most recently touched first - the one somebody
      just named or renamed is the one they are most likely to open again. */
  getSavedQuestions(): Promise<SavedQuestion[]>;
  /** Returns the row's id. Updating an unknown id throws (ADR-0053). */
  upsertSavedQuestion(input: SavedQuestionInput): Promise<string>;
  /** Idempotent (ADR-0053). */
  deleteSavedQuestion(id: string): Promise<void>;
}

/** The row exactly as `flatArea` reads and writes it: every column a
    scalar, with `tagIds`/`moods` still comma-joined and `hasNote`/
    `hasPhoto` still 0/1. */
type StoredSavedQuestion = Omit<SavedQuestion, 'tagIds' | 'moods' | 'hasNote' | 'hasPhoto'> & {
  tagIds: string;
  moods: string;
  hasNote: number;
  hasPhoto: number;
};

const joinIds = (ids: readonly string[]): string => ids.join(',');
const splitIds = (csv: string): string[] => (csv === '' ? [] : csv.split(','));
const joinMoods = (moods: readonly number[]): string => moods.join(',');
const splitMoods = (csv: string): number[] => (csv === '' ? [] : csv.split(',').map(Number));

function toDomain(row: StoredSavedQuestion): SavedQuestion {
  return {
    ...row,
    tagIds: splitIds(row.tagIds),
    moods: splitMoods(row.moods),
    hasNote: row.hasNote === 1,
    hasPhoto: row.hasPhoto === 1
  };
}

function toStored(input: SavedQuestionInput): FlatInput<StoredSavedQuestion> {
  return {
    ...input,
    tagIds: joinIds(input.tagIds),
    moods: joinMoods(input.moods),
    hasNote: input.hasNote ? 1 : 0,
    hasPhoto: input.hasPhoto ? 1 : 0
  };
}

export function makeSavedQuestionsArea(driver: SqliteDriver): SavedQuestionsArea {
  const rows = flatArea<StoredSavedQuestion>(driver, {
    table: 'saved_question',
    columns: {
      name: 'name',
      queryText: 'query_text',
      tagIds: 'tag_ids',
      moods: 'moods',
      startEpochDay: 'start_epoch_day',
      endEpochDay: 'end_epoch_day',
      hasNote: 'has_note',
      hasPhoto: 'has_photo'
    }
  });

  return {
    async getSavedQuestions() {
      const stored = await rows.read('ORDER BY updated_at DESC, id DESC');
      return stored.map(toDomain);
    },
    upsertSavedQuestion: (input) => rows.upsert(toStored(input)),
    deleteSavedQuestion: (id) => rows.delete(id)
  };
}
