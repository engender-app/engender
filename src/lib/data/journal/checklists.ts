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
  /** The standalone checklist's own appointment date (phase 5 deepening
      ticket 25, ADR-0010): null until the person sets one. Not part of the
      `Checklist` shape returned elsewhere, because that shape is shared
      with every owned checklist (a procedure's recovery list has no
      appointment of its own) - these two are the only way the column is
      read or written, so an owned checklist can never carry a value here. */
  getAppointmentDate(): Promise<number | null>;
  /** The standalone checklist's whole debrief-relevant state in one read
      (phase 6 ticket 08): the appointment date, how many prep items are on
      the list, and the two device-local columns below - the exact shape
      `debriefOfferVisible` (vocabulary/entryTemplates.ts) takes, so a
      caller folding the predicate over a live read needs one query rather
      than composing several. */
  getDebriefState(): Promise<{
    appointmentEpochDay: number | null;
    itemCount: number;
    dismissedEpochDay: number | null;
    debriefEntryId: number | null;
  }>;
  /** Creates the standalone checklist on first use, the same as
      `addToStandaloneChecklist` - setting a date before adding a single
      question is a real order of operations, not an error. `null` clears
      it. Changing the date to a genuinely different value also clears
      `debrief_entry_id` and `debrief_dismissed_epoch_day` (phase 6 ticket
      08): both name a fact about the appointment this column currently
      holds, and a new appointment has neither a debrief nor a dismissal
      yet. Setting the same date again, or setting it for the first time,
      leaves them alone - there is nothing to clear. */
  setAppointmentDate(epochDay: number | null): Promise<void>;
  /** Which appointment date's debrief offer was dismissed, or null - reset
      by `setAppointmentDate` the moment the date changes, so a stored value
      is only ever read against the date it was set for (phase 6 ticket 08,
      CONTEXT: "Checklist"). */
  getDebriefDismissedEpochDay(): Promise<number | null>;
  /** Dismissing the offer for the appointment currently on record. Creates
      the standalone checklist on first use like every other write here,
      though in practice the offer cannot show before a checklist with an
      appointment date exists. */
  setDebriefDismissed(epochDay: number): Promise<void>;
  /** The entry that debriefs the appointment currently on record, or null.
      Device-local (migrations.ts v54's own comment says why), so this is
      never part of the `Checklist` shape returned elsewhere. */
  getDebriefEntryId(): Promise<number | null>;
  /** Links an entry as the debrief for the appointment currently on
      record - a no-op if the appointment date has since moved on from
      `epochDay`, which stops a slow save racing a changed appointment from
      linking an entry to the wrong one. */
  recordDebriefEntry(entryId: number, epochDay: number): Promise<void>;
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
type StandaloneDebriefRow = {
  id: number;
  uuid: string;
  appointment_epoch_day: number | null;
  debrief_entry_id: number | null;
  debrief_dismissed_epoch_day: number | null;
};
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

  /* The one raw read every appointment/debrief accessor below shares,
     rather than each repeating the same `WHERE owner_kind IS NULL LIMIT 1`
     query with its own column list (phase 6 ticket 08). Undefined when no
     standalone checklist exists yet, the same resting state
     `standaloneChecklist` above gives. */
  const standaloneDebriefRow = async (): Promise<StandaloneDebriefRow | undefined> => {
    const rows = await driver.query<StandaloneDebriefRow>(
      'SELECT id, uuid, appointment_epoch_day, debrief_entry_id, debrief_dismissed_epoch_day FROM checklist WHERE owner_kind IS NULL LIMIT 1'
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

    async getAppointmentDate() {
      const row = await standaloneDebriefRow();
      return row?.appointment_epoch_day ?? null;
    },

    async setAppointmentDate(epochDay) {
      const existing = await standaloneDebriefRow();
      const checklistId = existing ? existing.uuid : (await area.createChecklist()).id;
      const changed = (existing?.appointment_epoch_day ?? null) !== epochDay;
      await driver.run(
        `UPDATE checklist SET appointment_epoch_day = ?, updated_at = ?
         ${changed ? ', debrief_entry_id = NULL, debrief_dismissed_epoch_day = NULL' : ''}
         WHERE uuid = ?`,
        [epochDay, now(), checklistId]
      );
    },

    async getDebriefState() {
      const [row, checklist] = await Promise.all([standaloneDebriefRow(), standaloneChecklist()]);
      return {
        appointmentEpochDay: row?.appointment_epoch_day ?? null,
        itemCount: checklist?.items.length ?? 0,
        dismissedEpochDay: row?.debrief_dismissed_epoch_day ?? null,
        debriefEntryId: row?.debrief_entry_id ?? null
      };
    },

    async getDebriefDismissedEpochDay() {
      const row = await standaloneDebriefRow();
      return row?.debrief_dismissed_epoch_day ?? null;
    },

    async setDebriefDismissed(epochDay) {
      const existing = await standaloneChecklist();
      const checklistId = existing ? existing.id : (await area.createChecklist()).id;
      await driver.run('UPDATE checklist SET debrief_dismissed_epoch_day = ?, updated_at = ? WHERE uuid = ?', [
        epochDay,
        now(),
        checklistId
      ]);
    },

    async getDebriefEntryId() {
      const row = await standaloneDebriefRow();
      return row?.debrief_entry_id ?? null;
    },

    async recordDebriefEntry(entryId, epochDay) {
      await driver.run(
        `UPDATE checklist SET debrief_entry_id = ?, updated_at = ?
         WHERE owner_kind IS NULL AND appointment_epoch_day = ?`,
        [entryId, now(), epochDay]
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
      await driver.transaction(async () => {
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
