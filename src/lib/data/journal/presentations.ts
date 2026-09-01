/* The fluidity engine's presentation area (phase 5 deepening ticket 17,
   ADR-0048, CONTEXT: "Presentation"). No `key` column and no built-ins - a
   presentation ships nothing seeded (ADR-0048), so a minted uuid is its
   only travelling identity and there is no id-or-key addressing the way
   tags.ts needs. Hides rather than deletes (CONTEXT: "Hidden"); there is no
   deletePresentation. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Presentation } from '../types';
import { assertChanged, bool, mintUuid, now } from './support';

export interface PresentationsArea {
  /** Every presentation, most-recently-used first: ordered by the newest
      untrashed entry that carries it, a presentation never used sorting
      after every one that has been, in creation order. One order rather
      than two: this is both the entry editor's MRU chip order and the
      mirrored read (live/reference.svelte.ts) that management and every
      read-back label resolve names and colours against. */
  getPresentations(): Promise<Presentation[]>;
  /** The person picks `roleIndex`; the default offered is the caller's
      business (the next role not already in use), not this area's. */
  addPresentation(name: string, roleIndex: number): Promise<Presentation>;
  renamePresentation(id: string, name: string): Promise<void>;
  setPresentationColour(id: string, roleIndex: number): Promise<void>;
  setPresentationHidden(id: string, hidden: boolean): Promise<void>;
}

type PresentationRow = {
  uuid: string;
  name: string;
  role_index: number;
  hidden: number;
};

const toPresentation = (row: PresentationRow): Presentation => ({
  id: row.uuid,
  name: row.name,
  roleIndex: row.role_index,
  hidden: bool(row.hidden)
});

export function makePresentationsArea(driver: SqliteDriver): PresentationsArea {
  return {
    async getPresentations() {
      const rows = await driver.query<PresentationRow & { last_used: number | null }>(
        `SELECT p.uuid, p.name, p.role_index, p.hidden,
                (SELECT MAX(e.timestamp) FROM entry e
                 WHERE e.presentation_id = p.uuid AND e.trashed_at IS NULL) AS last_used
         FROM presentation p
         ORDER BY last_used IS NULL, last_used DESC, p.id`
      );
      return rows.map(toPresentation);
    },

    async addPresentation(name, roleIndex) {
      const uuid = mintUuid();
      await driver.run('INSERT INTO presentation (uuid, name, role_index, updated_at) VALUES (?, ?, ?, ?)', [
        uuid,
        name,
        roleIndex,
        now()
      ]);
      return { id: uuid, name, roleIndex, hidden: false };
    },

    async renamePresentation(id, name) {
      const result = await driver.run('UPDATE presentation SET name = ?, updated_at = ? WHERE uuid = ?', [
        name,
        now(),
        id
      ]);
      assertChanged(result, `presentation: ${id}`);
    },

    async setPresentationColour(id, roleIndex) {
      const result = await driver.run('UPDATE presentation SET role_index = ?, updated_at = ? WHERE uuid = ?', [
        roleIndex,
        now(),
        id
      ]);
      assertChanged(result, `presentation: ${id}`);
    },

    async setPresentationHidden(id, hidden) {
      const result = await driver.run('UPDATE presentation SET hidden = ?, updated_at = ? WHERE uuid = ?', [
        hidden ? 1 : 0,
        now(),
        id
      ]);
      assertChanged(result, `presentation: ${id}`);
    }
  };
}
