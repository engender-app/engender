/* Entry templates area (phase 6 ticket 07, ADR-0002). A template's domain id
   is its travelling identity: the seeded key for a built-in, the minted uuid
   for one the person authored - the same dual identity `tags.ts` gives a
   tag. Built-ins hide, never delete (What to Build #4); there is no
   deleteEntryTemplate, the same shape `presentations.ts` gives a
   presentation, which never deletes at all. */

import type { SqliteDriver } from '../sqlite/driver';
import type { EntryTemplate } from '../types';
import { assertChanged, bool, domainIdOf, mintUuid, now, resolveDimensionIds, resolveTagIds } from './support';

interface EntryTemplateInput {
  name: string;
  tags: string[];
  dims: Record<string, number>;
  noteScaffold: string;
  presentationId: string | null;
}

export interface EntryTemplatesArea {
  getEntryTemplates(): Promise<EntryTemplate[]>;
  addEntryTemplate(input: EntryTemplateInput): Promise<EntryTemplate>;
  /** Replaces every editable field at once, tags and dims included - the
      editor sheet holds the whole template in one draft and saves it in
      one call, the same shape a template's own apply-to-draft takes on the
      other side of this area. */
  updateEntryTemplate(id: string, input: EntryTemplateInput): Promise<void>;
  setEntryTemplateHidden(id: string, hidden: boolean): Promise<void>;
}

type TemplateRow = {
  id: number;
  uuid: string | null;
  key: string | null;
  name: string;
  note_scaffold: string;
  presentation_id: string | null;
  hidden: number;
};

export function makeEntryTemplatesArea(driver: SqliteDriver): EntryTemplatesArea {
  const writeChildren = async (
    driver: SqliteDriver,
    templateId: number,
    tags: string[],
    dims: Record<string, number>
  ): Promise<void> => {
    const tagIds = await resolveTagIds(driver, tags);
    for (const tagId of tagIds) {
      await driver.run('INSERT INTO entry_template_tag (template_id, tag_id) VALUES (?, ?)', [templateId, tagId]);
    }
    const dimensionValues = await resolveDimensionIds(driver, dims);
    for (const [dimensionId, value] of dimensionValues) {
      await driver.run('INSERT INTO entry_template_dimension_value (template_id, dimension_id, value) VALUES (?, ?, ?)', [
        templateId,
        dimensionId,
        value
      ]);
    }
  };

  return {
    async getEntryTemplates() {
      const rows = await driver.query<TemplateRow>(
        'SELECT id, uuid, key, name, note_scaffold, presentation_id, hidden FROM entry_template ORDER BY id'
      );
      const tagLinks = await driver.query<{ template_id: number; key: string | null; uuid: string | null }>(
        `SELECT ett.template_id, t.key, t.uuid FROM entry_template_tag ett
         JOIN tag t ON t.id = ett.tag_id`
      );
      const dimLinks = await driver.query<{ template_id: number; key: string; value: number }>(
        `SELECT etdv.template_id, gd.key, etdv.value FROM entry_template_dimension_value etdv
         JOIN gender_dimension gd ON gd.id = etdv.dimension_id`
      );

      return rows.map((row) => ({
        id: domainIdOf(row, 'entry template'),
        name: row.name,
        tags: tagLinks.filter((l) => l.template_id === row.id).map((l) => domainIdOf(l, 'tag')),
        dims: Object.fromEntries(dimLinks.filter((l) => l.template_id === row.id).map((l) => [l.key, l.value])),
        noteScaffold: row.note_scaffold,
        presentationId: row.presentation_id,
        builtIn: row.key !== null,
        hidden: bool(row.hidden)
      }));
    },

    async addEntryTemplate(input) {
      const uuid = mintUuid();
      await driver.transaction(async (driver) => {
        const result = await driver.run(
          `INSERT INTO entry_template (uuid, name, note_scaffold, presentation_id, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [uuid, input.name, input.noteScaffold, input.presentationId, now()]
        );
        await writeChildren(driver, result.lastInsertRowid, input.tags, input.dims);
      });
      return {
        id: uuid,
        name: input.name,
        tags: [...input.tags],
        dims: { ...input.dims },
        noteScaffold: input.noteScaffold,
        presentationId: input.presentationId,
        builtIn: false,
        hidden: false
      };
    },

    async updateEntryTemplate(id, input) {
      await driver.transaction(async (driver) => {
        const result = await driver.run(
          `UPDATE entry_template SET name = ?, note_scaffold = ?, presentation_id = ?, updated_at = ?
           WHERE key = ? OR uuid = ?`,
          [input.name, input.noteScaffold, input.presentationId, now(), id, id]
        );
        assertChanged(result, `entry template: ${id}`);

        const rows = await driver.query<{ id: number }>('SELECT id FROM entry_template WHERE key = ? OR uuid = ?', [
          id,
          id
        ]);
        const templateId = rows[0].id;
        await driver.run('DELETE FROM entry_template_tag WHERE template_id = ?', [templateId]);
        await driver.run('DELETE FROM entry_template_dimension_value WHERE template_id = ?', [templateId]);
        await writeChildren(driver, templateId, input.tags, input.dims);
      });
    },

    async setEntryTemplateHidden(id, hidden) {
      const result = await driver.run('UPDATE entry_template SET hidden = ?, updated_at = ? WHERE key = ? OR uuid = ?', [
        hidden ? 1 : 0,
        now(),
        id,
        id
      ]);
      assertChanged(result, `entry template: ${id}`);
    }
  };
}
