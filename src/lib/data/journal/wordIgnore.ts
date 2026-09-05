/* The word-frequency ignore list (phase 8 features ticket 48, ADR-0003):
   which words the person has told the words screen (wordFrequency.ts) to
   stop counting. Rows only, keyed by the word itself - whether a token
   should be dropped is wordFrequency.ts's own pure question, read from here
   by the one screen that asks it.

   Case-folded on write the same way `tokenize()` folds a note before
   counting, so "Kraków" and "kraków" are one entry regardless of which
   case the word arrived in from the frequency list. */

import type { SqliteDriver } from '../sqlite/driver';
import { now } from './support';

export interface WordIgnoreArea {
  /** Every currently ignored word, lowercased. */
  getIgnoredWords(): Promise<Set<string>>;
  /** Idempotent both ways (ADR-0053): ignoring an already-ignored word or
      un-ignoring one that was not changes nothing observable. Un-ignoring
      deletes the row rather than storing a false - presence is the whole
      of the state, the same shape `eraMutes.setEraMuted` gives a muted
      era. */
  setWordIgnored(word: string, ignored: boolean): Promise<void>;
}

export function makeWordIgnoreArea(driver: SqliteDriver): WordIgnoreArea {
  return {
    async getIgnoredWords() {
      const rows = await driver.query<{ word: string }>('SELECT word FROM word_frequency_ignore');
      return new Set(rows.map((row) => row.word));
    },

    async setWordIgnored(word, ignored) {
      const folded = word.toLowerCase();
      if (!ignored) {
        await driver.run('DELETE FROM word_frequency_ignore WHERE word = ?', [folded]);
        return;
      }
      await driver.run(
        `INSERT INTO word_frequency_ignore (word, updated_at) VALUES (?, ?)
           ON CONFLICT (word) DO UPDATE SET updated_at = excluded.updated_at`,
        [folded, now()]
      );
    }
  };
}
