/* The medication stock area (phase 4 ticket 04, CONTEXT: pending). One row
   per drug (migrations.ts v7, stockProjection.ts): remaining stock and its
   run-out projection are both derived on read, never stored (ADR-0010).

   Reads doses through DosesArea and episodes through RegimenArea, and
   writes the run-out reminder through RemindersArea, rather than
   querying those tables itself the way archive.ts does: this area is a
   view stitched together from rows two other areas own, not a second
   owner for either one. Routing every reminder write through
   RemindersArea.upsertReminder keeps assertValidRule and the schema's own
   CHECK the one place a reminder rule is validated, the same guarantee
   ticket 02's dose log gets from resolveEpisodeAt rather than re-deriving
   attribution itself. */

import type { SqliteDriver } from '../sqlite/driver';
import type { MedicationStock, Reminder } from '../types';
import { assertChanged, bool, mintUuid, now } from './support';
import type { DosesArea } from './doses';
import type { RegimenArea } from './regimen';
import type { RemindersArea } from './reminders';
import { projectStock, type StockProjection } from '../stockProjection';
import { reconcileStockReminder } from '../stockReminder';

export interface StockEntryInput {
  drug: string;
  quantity: number;
  unit: string;
  recordedEpochDay: number;
}

export interface StockProjectionRow {
  entry: MedicationStock;
  projection: StockProjection;
}

export interface StockArea {
  /** By drug. */
  getEntries(): Promise<MedicationStock[]>;
  /** One entry per drug (matched exactly, trimmed - the drug's own
      uniqueness, migrations.ts v7): saving a second for the same drug
      replaces the first, the way DoseSchedule replaces per episode
      (doses.ts). Also clears box 4's reminder hand-off state - a fresh
      count is the deliberate act that re-arms a dismissed prompt. Returns
      the row's id. */
  upsertEntry(input: StockEntryInput): Promise<string>;
  /** Also drops this drug's auto-managed run-out reminder, if any -
      nothing is left to project once the count is gone. Deleting an
      unknown id throws. */
  deleteEntry(id: string): Promise<void>;
  /** Every drug's projection as of `asOfEpochDay` - a read-only aggregate
      over the dose log (ADR-0012): nothing here is stored. */
  getProjections(asOfEpochDay: number): Promise<StockProjectionRow[]>;
  /** Recomputes every drug's projection and reconciles its auto-managed
      run-out Reminder against it (box 4, stockReminder.ts) - created,
      moved, cleared, or left alone for a drug whose reminder a person has
      already taken over. In effect Android-only, since Reminder never
      fires on web, but that gate belongs to the caller: this module has
      no reason to know what platform it is running on. */
  reconcileRunOutReminders(asOfEpochDay: number): Promise<void>;
}

type StockRow = {
  uuid: string;
  drug: string;
  quantity: number;
  unit: string;
  recorded_epoch_day: number;
  reminder_ever_created: number;
  reminder_dismissed: number;
};

const toStock = (row: StockRow): MedicationStock => ({
  id: row.uuid,
  drug: row.drug,
  quantity: row.quantity,
  unit: row.unit,
  recordedEpochDay: row.recorded_epoch_day,
  reminderEverCreated: bool(row.reminder_ever_created),
  reminderDismissed: bool(row.reminder_dismissed)
});

const STOCK_COLUMNS = 'uuid, drug, quantity, unit, recorded_epoch_day, reminder_ever_created, reminder_dismissed';

/** Where box 4's reminder marks which drug it belongs to
    (stockReminder.ts). Not exported: nothing outside this module reads a
    Reminder's `auto_source` well enough to build one - only stock.ts
    writes them. */
const autoSourceFor = (drug: string): string => `stock:${drug}`;

export function makeStockArea(driver: SqliteDriver, doses: DosesArea, regimen: RegimenArea, reminders: RemindersArea): StockArea {
  const getEntries = async (): Promise<MedicationStock[]> => {
    const rows = await driver.query<StockRow>(`SELECT ${STOCK_COLUMNS} FROM medication_stock ORDER BY drug`);
    return rows.map(toStock);
  };

  const setReminderFlags = (id: string, everCreated: boolean, dismissed: boolean): Promise<unknown> =>
    driver.run(
      'UPDATE medication_stock SET reminder_ever_created = ?, reminder_dismissed = ?, updated_at = ? WHERE uuid = ?',
      [everCreated ? 1 : 0, dismissed ? 1 : 0, now(), id]
    );

  const findAutoReminder = (all: readonly Reminder[], drug: string): Reminder | null =>
    all.find((reminder) => reminder.autoSource === autoSourceFor(drug)) ?? null;

  /* Every drug's projection as of `asOfEpochDay`. One getDoses call over
     the widest range any entry needs, rather than one per drug - the
     projection itself does the per-drug filtering (stockProjection.ts). */
  const projections = async (asOfEpochDay: number): Promise<StockProjectionRow[]> => {
    const entries = await getEntries();
    if (entries.length === 0) return [];

    const earliest = Math.min(...entries.map((entry) => entry.recordedEpochDay));
    const [doseEvents, episodes] = await Promise.all([
      doses.getDoses(Math.min(earliest, asOfEpochDay), asOfEpochDay),
      regimen.getEpisodes()
    ]);

    return entries.map((entry) => ({ entry, projection: projectStock(entry, doseEvents, episodes, asOfEpochDay) }));
  };

  return {
    getEntries,
    getProjections: projections,

    async upsertEntry(input) {
      const drug = input.drug.trim();
      const [existing, allReminders] = await Promise.all([
        driver.query<{ uuid: string }>('SELECT uuid FROM medication_stock WHERE drug = ?', [drug]),
        reminders.getReminders()
      ]);
      /* `dismissed` always resets: recording a fresh count is the
         deliberate act that re-arms it. `everCreated` resets to whether an
         auto reminder happens to exist right now, rather than always to
         false - if the person never touched it, it is still there and
         must keep reading as "already created", or the very next write
         that finds it missing would read as a person's own delete and
         mark the drug dismissed again immediately (stockReminder.ts's
         `everCreated && !existing` check), undoing the re-arm in the same
         breath it happened. */
      const everCreated = allReminders.some((reminder) => reminder.autoSource === autoSourceFor(drug));
      const values = [input.quantity, input.unit, input.recordedEpochDay, everCreated ? 1 : 0, now()];

      if (existing.length > 0) {
        await driver.run(
          `UPDATE medication_stock
              SET quantity = ?, unit = ?, recorded_epoch_day = ?, reminder_ever_created = ?, reminder_dismissed = 0,
                  updated_at = ?
            WHERE drug = ?`,
          [...values, drug]
        );
        return existing[0].uuid;
      }

      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO medication_stock (uuid, drug, quantity, unit, recorded_epoch_day, reminder_ever_created, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuid, drug, ...values]
      );
      return uuid;
    },

    async deleteEntry(id) {
      const rows = await driver.query<{ drug: string }>('SELECT drug FROM medication_stock WHERE uuid = ?', [id]);
      const result = await driver.run('DELETE FROM medication_stock WHERE uuid = ?', [id]);
      assertChanged(result, `medication stock: ${id}`);

      if (rows.length === 0) return;
      const auto = findAutoReminder(await reminders.getReminders(), rows[0].drug);
      if (auto) await reminders.deleteReminder(auto.id);
    },

    async reconcileRunOutReminders(asOfEpochDay) {
      const rows = await projections(asOfEpochDay);
      if (rows.length === 0) return;
      const allReminders = await reminders.getReminders();

      for (const { entry, projection } of rows) {
        const auto = findAutoReminder(allReminders, entry.drug);
        const action = reconcileStockReminder(
          { everCreated: entry.reminderEverCreated, dismissed: entry.reminderDismissed },
          projection,
          auto ? { id: auto.id, epochDay: auto.epochDay ?? asOfEpochDay } : null,
          asOfEpochDay
        );

        switch (action.kind) {
          case 'none':
            break;
          case 'mark-dismissed':
            await setReminderFlags(entry.id, entry.reminderEverCreated, true);
            break;
          case 'clear':
            await reminders.deleteReminder(action.reminderId);
            await setReminderFlags(entry.id, false, false);
            break;
          case 'create':
            await reminders.upsertReminder({
              // Just the drug's own name: a Reminder's title is ordinarily
              // whatever a person types, and echoing the drug name back
              // needs no copy of its own to translate (ADR-0016 keeps
              // paraglide out of this tier anyway).
              title: entry.drug,
              type: 'med',
              time: '09:00',
              recurrence: null,
              interval: null,
              anchorEpochDay: null,
              epochDay: action.epochDay,
              enabled: true,
              autoSource: autoSourceFor(entry.drug)
            });
            await setReminderFlags(entry.id, true, false);
            break;
          case 'update':
            if (auto) await reminders.upsertReminder({ ...auto, epochDay: action.epochDay });
            break;
        }
      }
    }
  };
}
