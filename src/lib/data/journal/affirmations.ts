/* The affirmations area (phase 5 ticket 15, CONTEXT: "Affirmation"). A
   line's domain id is its travelling identity (ADR-0002): the seeded key
   for a built-in, the minted uuid for a custom - integer rowids stay
   behind the seam. Built-ins hide and customs delete, the same asymmetry
   tags.ts draws; a built-in's text lives in the message catalogue, not
   here, so it is not edited through this area either. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Affirmation } from '../types';
import { assertChanged, bool, domainIdOf, mintUuid, now } from './support';

export interface AffirmationsArea {
  getAffirmations(): Promise<Affirmation[]>;
  addLine(language: 'en' | 'pl', text: string): Promise<Affirmation>;
  /** Customs only; a built-in's wording comes from the message catalogue. */
  editLine(id: string, text: string): Promise<void>;
  setHidden(id: string, hidden: boolean): Promise<void>;
  /** Customs only; built-ins hide. Idempotent: deleting an already-gone
      line is success. */
  deleteLine(id: string): Promise<void>;
}

type AffirmationRow = {
  id: number;
  uuid: string | null;
  key: string | null;
  language: 'en' | 'pl' | null;
  text: string;
  hidden: number;
};

const toAffirmation = (row: AffirmationRow): Affirmation => ({
  id: domainIdOf(row, 'affirmation'),
  language: row.language,
  text: row.text,
  builtIn: row.key !== null,
  hidden: bool(row.hidden)
});

export function makeAffirmationsArea(driver: SqliteDriver): AffirmationsArea {
  /* The one id string is matched against both columns (`key = ? OR
     uuid = ?`): a built-in row has uuid NULL and a custom row has key
     NULL, so exactly the addressed row matches either way. */
  const byDomainId = async (id: string): Promise<AffirmationRow | undefined> => {
    const rows = await driver.query<AffirmationRow>(
      'SELECT id, uuid, key, language, text, hidden FROM affirmation WHERE key = ? OR uuid = ?',
      [id, id]
    );
    return rows[0];
  };

  return {
    async getAffirmations() {
      const rows = await driver.query<AffirmationRow>(
        'SELECT id, uuid, key, language, text, hidden FROM affirmation ORDER BY id'
      );
      return rows.map(toAffirmation);
    },

    async addLine(language, text) {
      const uuid = mintUuid();
      await driver.run('INSERT INTO affirmation (uuid, language, text, updated_at) VALUES (?, ?, ?, ?)', [
        uuid,
        language,
        text,
        now()
      ]);
      return { id: uuid, language, text, builtIn: false, hidden: false };
    },

    async editLine(id, text) {
      const row = await byDomainId(id);
      if (!row) throw new Error(`unknown affirmation: ${id}`);
      if (row.key !== null) throw new Error(`built-in affirmations are not edited: ${id}`);
      await driver.run('UPDATE affirmation SET text = ?, updated_at = ? WHERE uuid = ?', [text, now(), id]);
    },

    async setHidden(id, hidden) {
      const result = await driver.run(
        'UPDATE affirmation SET hidden = ?, updated_at = ? WHERE key = ? OR uuid = ?',
        [hidden ? 1 : 0, now(), id, id]
      );
      assertChanged(result, `affirmation: ${id}`);
    },

    async deleteLine(id) {
      const row = await byDomainId(id);
      if (!row) return; // already gone
      if (row.key !== null) throw new Error(`built-in affirmations hide, not delete: ${id}`);
      await driver.run('DELETE FROM affirmation WHERE id = ?', [row.id]);
    }
  };
}
