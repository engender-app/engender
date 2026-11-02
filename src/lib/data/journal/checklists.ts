/* The checklists area (phase 5 ticket 05, CONTEXT: "Checklist"). A checklist
   item is entirely the user's own free text with no bundled counterpart, so
   both a checklist and its items carry a minted uuid like any other
   user-owned row (ADR-0002) - unlike `roadmap_check`, which needs neither
   because a tick names bundled content instead of holding data of its own.

   A checklist's owner is looked up by (kind, id) rather than resolved to a
   foreign key: no owner table ships with this ticket, so the pair is stored
   and matched as given, the same reasoning roadmap.ts gives for storing
   `packKey`/`goalKey` as plain strings. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Checklist, ChecklistItem, ChecklistOwner } from '../types';
import { assertChanged, mintUuid, now, rowidByUuid } from './support';

export interface ChecklistsArea {
  createChecklist(owner?: ChecklistOwner): Promise<Checklist>;
  getChecklist(id: string): Promise<Checklist | undefined>;
  getChecklistByOwner(owner: ChecklistOwner): Promise<Checklist | undefined>;
  /** The one standalone checklist behind the appointment prep list (phase 5
      ticket 11): looked up by having no owner at all, rather than by an
      owner pair, since nothing else in the app creates a standalone
      checklist to be confused with it. */
  getStandaloneChecklist(): Promise<Checklist | undefined>;
  /** Idempotent: deleting an already-gone checklist is success. Takes its
      items along. */
  deleteChecklist(id: string): Promise<void>;
  addItem(checklistId: string, content: string): Promise<ChecklistItem>;
  /** Adds to the standalone checklist, creating it on first use so a caller
      (a side-effect entry, a lab result, the appointment prep screen itself)
      never has to check whether it exists yet. */
  addToStandaloneChecklist(content: string): Promise<ChecklistItem>;
  /** The same create-on-first-use for an owned checklist (phase 5 ticket
      07's procedure is the first owner): the rule that a checklist appears
      when its first item does lives here once, rather than at each owner. */
  addToOwnedChecklist(owner: ChecklistOwner, content: string): Promise<ChecklistItem>;
  /** The debrief-relevant state for one appointment (ticket 58, ADR-0066):
      how many prep items are on the standing list, whether the offer for
      `appointmentId` was dismissed, and the entry that debriefs it, if
      any - both of the latter resolved against `appointmentId` itself, so
      a stale row left over from a since-superseded appointment reads as
      "nothing recorded" rather than leaking across. `appointmentId` is
      null when there is no most-recent-past appointment at all
      (appointments.ts's `mostRecentPastAppointment`); the shape still
      answers, since an absent appointment has nothing dismissed and no
      entry either. `appointmentId` comes back out again, which is what
      makes this the exact shape `debriefOfferVisible`
      (vocabulary/entryTemplates.ts) takes: a caller folding the predicate
      over a live read needs one query and no splicing, and cannot hand the
      predicate a different appointment than the read was scoped to. */
  getDebriefState(appointmentId: string | null): Promise<{
    appointmentId: string | null;
    itemCount: number;
    dismissed: boolean;
    debriefEntryId: number | null;
  }>;
  /** Dismissing the offer for one appointment. Kept per appointment in
      `appointment_debrief`, so it needs no checklist. */
  setDebriefDismissed(appointmentId: string): Promise<void>;
  /** The entry that debriefs `appointmentId`, or null - both when nothing
      has been recorded yet and when the entry on file was recorded for a
      different appointment (ticket 58): the appointment prep screen's own
      link to a completed debrief. */
  getDebriefEntryId(appointmentId: string | null): Promise<number | null>;
  /** Links an entry as the debrief for `appointmentId`. Unlike the epoch-day
      keying this replaces, there is no "the appointment has moved on"
      race to guard against - an id never changes out from under a write,
      so every read of it is scoped to the exact appointment the link was
      made for. Each appointment keeps its own link; a later one does not
      overwrite an earlier one's. */
  recordDebriefEntry(entryId: number, appointmentId: string): Promise<void>;
  editItem(itemId: string, content: string): Promise<void>;
  setItemChecked(itemId: string, checked: boolean): Promise<void>;
  setItemCarriedForward(itemId: string, carriedForward: boolean): Promise<void>;
  /** Idempotent: deleting an already-gone item is success. */
  deleteItem(itemId: string): Promise<void>;
  /** The whole order at once, the same reason TagsArea.reorder takes it
      (tags.ts) - a per-click mutation cannot express a drag. `orderedItemIds`
      must permute the checklist's items. */
  reorder(checklistId: string, orderedItemIds: string[]): Promise<void>;
}

type ChecklistRow = { id: number; uuid: string; owner_kind: string | null; owner_uuid: string | null };
type DebriefRow = { entry_id: number | null; dismissed: number };
type ItemRow = { uuid: string; content: string; checked: number; carried_forward: number };

const toItem = (row: ItemRow): ChecklistItem => ({
  id: row.uuid,
  content: row.content,
  checked: row.checked === 1,
  carriedForward: row.carried_forward === 1
});

export function makeChecklistsArea(driver: SqliteDriver): ChecklistsArea {
  const itemsOf = async (checklistRowId: number): Promise<ChecklistItem[]> => {
    const rows = await driver.query<ItemRow>(
      'SELECT uuid, content, checked, carried_forward FROM checklist_item WHERE checklist_id = ? ORDER BY order_index, id',
      [checklistRowId]
    );
    return rows.map(toItem);
  };

  const toChecklist = async (row: ChecklistRow): Promise<Checklist> => ({
    id: row.uuid,
    owner: row.owner_kind !== null && row.owner_uuid !== null ? { kind: row.owner_kind, id: row.owner_uuid } : null,
    items: await itemsOf(row.id)
  });

  const standaloneChecklist = async (): Promise<Checklist | undefined> => {
    const rows = await driver.query<ChecklistRow>(
      'SELECT id, uuid, owner_kind, owner_uuid FROM checklist WHERE owner_kind IS NULL LIMIT 1'
    );
    return rows[0] ? toChecklist(rows[0]) : undefined;
  };

  /* The one raw read the debrief accessors below share. The state is
     device-local and sits in its own table, one row per appointment
     (`appointment_debrief`), so a read for an appointment can only ever
     meet that appointment's own row: a link left over from a since
     superseded appointment is simply a row nobody asks for. */
  const debriefRow = async (appointmentId: string | null): Promise<DebriefRow | undefined> => {
    if (appointmentId === null) return undefined;
    const rows = await driver.query<DebriefRow>(
      'SELECT entry_id, dismissed FROM appointment_debrief WHERE appointment_uuid = ?',
      [appointmentId]
    );
    return rows[0];
  };

  /* The one create-on-first-item rule, for both entry points: an owner pair
     is looked up by that pair and a standalone checklist by having no owner
     at all, and either way the checklist appears when its first item does. */
  const addToLazyChecklist = async (owner: ChecklistOwner | undefined, content: string): Promise<ChecklistItem> => {
    const existing = owner ? await area.getChecklistByOwner(owner) : await standaloneChecklist();
    const checklistId = existing ? existing.id : (await area.createChecklist(owner)).id;
    return area.addItem(checklistId, content);
  };

  const area: ChecklistsArea = {
    async createChecklist(owner) {
      const uuid = mintUuid();
      await driver.run('INSERT INTO checklist (uuid, owner_kind, owner_uuid, updated_at) VALUES (?, ?, ?, ?)', [
        uuid,
        owner?.kind ?? null,
        owner?.id ?? null,
        now()
      ]);
      return { id: uuid, owner: owner ?? null, items: [] };
    },

    async getChecklist(id) {
      const rows = await driver.query<ChecklistRow>(
        'SELECT id, uuid, owner_kind, owner_uuid FROM checklist WHERE uuid = ?',
        [id]
      );
      return rows[0] ? toChecklist(rows[0]) : undefined;
    },

    async getChecklistByOwner(owner) {
      const rows = await driver.query<ChecklistRow>(
        'SELECT id, uuid, owner_kind, owner_uuid FROM checklist WHERE owner_kind = ? AND owner_uuid = ?',
        [owner.kind, owner.id]
      );
      return rows[0] ? toChecklist(rows[0]) : undefined;
    },

    getStandaloneChecklist: standaloneChecklist,

    async deleteChecklist(id) {
      await driver.run('DELETE FROM checklist WHERE uuid = ?', [id]);
    },

    async addItem(checklistId, content) {
      const checklistRowId = await rowidByUuid(driver, 'checklist', checklistId);
      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO checklist_item (uuid, checklist_id, content, order_index, updated_at)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM checklist_item WHERE checklist_id = ?), ?)`,
        [uuid, checklistRowId, content, checklistRowId, now()]
      );
      return { id: uuid, content, checked: false, carriedForward: false };
    },

    addToStandaloneChecklist: (content) => addToLazyChecklist(undefined, content),

    addToOwnedChecklist: (owner, content) => addToLazyChecklist(owner, content),

    async getDebriefState(appointmentId) {
      const [row, checklist] = await Promise.all([debriefRow(appointmentId), standaloneChecklist()]);
      return {
        appointmentId,
        itemCount: checklist?.items.length ?? 0,
        dismissed: row?.dismissed === 1,
        debriefEntryId: row?.entry_id ?? null
      };
    },

    async setDebriefDismissed(appointmentId) {
      await driver.run(
        `INSERT INTO appointment_debrief (appointment_uuid, dismissed) VALUES (?, 1)
         ON CONFLICT (appointment_uuid) DO UPDATE SET dismissed = 1`,
        [appointmentId]
      );
    },

    async getDebriefEntryId(appointmentId) {
      return (await debriefRow(appointmentId))?.entry_id ?? null;
    },

    async recordDebriefEntry(entryId, appointmentId) {
      await driver.run(
        `INSERT INTO appointment_debrief (appointment_uuid, entry_id) VALUES (?, ?)
         ON CONFLICT (appointment_uuid) DO UPDATE SET entry_id = excluded.entry_id`,
        [appointmentId, entryId]
      );
    },

    async editItem(itemId, content) {
      const result = await driver.run('UPDATE checklist_item SET content = ?, updated_at = ? WHERE uuid = ?', [
        content,
        now(),
        itemId
      ]);
      assertChanged(result, `checklist item: ${itemId}`);
    },

    async setItemChecked(itemId, checked) {
      const result = await driver.run('UPDATE checklist_item SET checked = ?, updated_at = ? WHERE uuid = ?', [
        checked ? 1 : 0,
        now(),
        itemId
      ]);
      assertChanged(result, `checklist item: ${itemId}`);
    },

    async setItemCarriedForward(itemId, carriedForward) {
      const result = await driver.run('UPDATE checklist_item SET carried_forward = ?, updated_at = ? WHERE uuid = ?', [
        carriedForward ? 1 : 0,
        now(),
        itemId
      ]);
      assertChanged(result, `checklist item: ${itemId}`);
    },

    async deleteItem(itemId) {
      await driver.run('DELETE FROM checklist_item WHERE uuid = ?', [itemId]);
    },

    async reorder(checklistId, orderedItemIds) {
      const checklistRowId = await rowidByUuid(driver, 'checklist', checklistId);
      const rows = await driver.query<{ uuid: string }>('SELECT uuid FROM checklist_item WHERE checklist_id = ?', [
        checklistRowId
      ]);
      const current = new Set(rows.map((r) => r.uuid));
      if (orderedItemIds.length !== rows.length || !orderedItemIds.every((id) => current.has(id))) {
        throw new Error(`reorder of checklist ${checklistId} does not permute its items`);
      }
      await driver.transaction(async (driver) => {
        for (const [orderIndex, id] of orderedItemIds.entries()) {
          await driver.run('UPDATE checklist_item SET order_index = ?, updated_at = ? WHERE uuid = ?', [
            orderIndex,
            now(),
            id
          ]);
        }
      });
    }
  };

  return area;
}
