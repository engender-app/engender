/* The medication stock area (phase 4 ticket 04, CONTEXT: "Medication stock",
   "Run-out projection"). One row per drug (migrations.ts v7,
   stockProjection.ts): remaining stock and its run-out projection are both
   derived on read, never stored (ADR-0046, generalizing ADR-0010's rule).

   Reads doses through DosesArea and episodes through RegimenArea, and
   writes the run-out reminder through RemindersArea, rather than
   querying those tables itself the way archive.ts does: this area is a
   view stitched together from rows two other areas own, not a second
   owner for either one. Routing every reminder write through
   RemindersArea.upsertReminder keeps assertValidRule and the schema's own
   CHECK the one place a reminder rule is validated, the same guarantee
   ticket 02's dose log gets from attributeDose rather than re-deriving
   attribution itself. */

import type { SqliteDriver } from '../sqlite/driver';
import type { MedicationStock, Reminder } from '../types';
import { bool, mintUuid, now } from './support';
import type { DosesArea } from './doses';
import type { RegimenArea } from './regimen';
import type { RemindersArea } from './reminders';
import { projectStockFromCounts, trailingWindowStart, type StockProjection } from '../stockProjection';
import { drugSpans } from '../regimenEpisode';
import { reconcileStockReminder } from '../stockReminder';
import { stockAutoSource } from '../autoSource';

export interface StockEntryInput {
  drug: string;
  quantity: number;
  unit: string;
  recordedEpochDay: number;
  /** Ticket 13's "what is open, and until when" - all optional and
      defaulted to null, so every caller before this ticket keeps working
      unchanged. `inUseWindowDays` and `inUseEndEpochDay` are stored exactly
      as passed, never cross-derived (inUseWindow.ts combines them for
      display only). */
  openedEpochDay?: number | null;
  inUseWindowDays?: number | null;
  inUseEndEpochDay?: number | null;
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
      nothing is left to project once the count is gone. */
  deleteEntry(id: string): Promise<void>;
  /** Every drug's projection as of `asOfEpochDay` - a read-only aggregate
      over the dose log (ADR-0046): nothing here is stored. */
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
  opened_epoch_day: number | null;
  in_use_window_days: number | null;
  in_use_end_epoch_day: number | null;
};

const toStock = (row: StockRow): MedicationStock => ({
  id: row.uuid,
  drug: row.drug,
  quantity: row.quantity,
  unit: row.unit,
  recordedEpochDay: row.recorded_epoch_day,
  reminderEverCreated: bool(row.reminder_ever_created),
  reminderDismissed: bool(row.reminder_dismissed),
  openedEpochDay: row.opened_epoch_day,
  inUseWindowDays: row.in_use_window_days,
  inUseEndEpochDay: row.in_use_end_epoch_day
});

const STOCK_COLUMNS =
  'uuid, drug, quantity, unit, recorded_epoch_day, reminder_ever_created, reminder_dismissed, ' +
  'opened_epoch_day, in_use_window_days, in_use_end_epoch_day';

/** Where box 4's reminder marks which drug it belongs to
    (stockReminder.ts). The marker itself lives in autoSource.ts, which is
    also where provenance.ts reads it back from and where the registry's
    switches ask what a row is. */
const autoSourceFor = stockAutoSource;

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

  /* Every drug's projection as of `asOfEpochDay`, from counts rather than
     from the doses counted (phase 8 audit ticket 26). Someone whose oldest
     count was taken years ago used to have their whole dose log crossed the
     seam here so that three numbers per drug could be reduced out of it -
     the single largest thing Home read on arrival.

     What replaces it: cut the window at every day any entry's answer could
     change on - where a drug-less dose starts attributing differently
     (drugSpans), where a count was taken, and where a trailing rate window
     opens - and ask the dose log how many non-skipped doses each drug value
     has in each stretch. Every stretch then lies inside exactly one span,
     so a stretch's drug-less doses all belong to the same drug or to none,
     and the per-entry figures are sums over stretches. The attribution rule
     itself never leaves regimenEpisode.ts and the arithmetic never leaves
     stockProjection.ts; the SQL counts rows in date windows and knows
     nothing about either. */
  const projections = async (asOfEpochDay: number): Promise<StockProjectionRow[]> => {
    /* Both at once, the way the old getDoses and getEpisodes pair was:
       neither answer depends on the other, and only the count that follows
       depends on both. */
    const [entries, episodes] = await Promise.all([getEntries(), regimen.getEpisodes()]);
    if (entries.length === 0) return [];

    const from = Math.min(...entries.map((entry) => entry.recordedEpochDay), asOfEpochDay);
    const spans = drugSpans(episodes, from, asOfEpochDay);

    const cuts = new Set<number>(spans.map((span) => span.fromEpochDay));
    for (const entry of entries) {
      for (const day of [entry.recordedEpochDay, trailingWindowStart(entry, asOfEpochDay)]) {
        if (day > from && day <= asOfEpochDay) cuts.add(day);
      }
    }

    const starts = [...cuts].sort((a, b) => a - b);
    const ranges = starts.map((start, index) => ({
      fromEpochDay: start,
      toEpochDay: index + 1 < starts.length ? starts[index + 1] - 1 : asOfEpochDay
    }));
    const spanForRange = ranges.map((range) =>
      spans.find((span) => range.fromEpochDay >= span.fromEpochDay && range.fromEpochDay <= span.toEpochDay)
    );

    /* Doses that named a drug are keyed by that name, trimmed the way a
       drug is matched everywhere else; doses that named none are kept apart,
       because which drug they count against is the span's answer and not
       their own. A falsy `drug` is what attributeDrug treats as naming
       nothing, so the same test decides it here. */
    const namedByRange = ranges.map(() => new Map<string, number>());
    const unnamedByRange = ranges.map(() => 0);
    for (const row of await doses.countConsumingDosesByDrug(ranges)) {
      row.countsByRange.forEach((count, index) => {
        if (!row.drug) {
          unnamedByRange[index] += count;
          return;
        }
        const key = row.drug.trim();
        namedByRange[index].set(key, (namedByRange[index].get(key) ?? 0) + count);
      });
    }

    return entries.map((entry) => {
      const drug = entry.drug.trim();
      const windowStart = trailingWindowStart(entry, asOfEpochDay);
      let consumed = 0;
      let consumedInTrailingWindow = 0;
      let excluded = 0;

      for (const [index, range] of ranges.entries()) {
        if (range.fromEpochDay < entry.recordedEpochDay) continue;
        const span = spanForRange[index];
        const unnamed = unnamedByRange[index];
        const attributed =
          (namedByRange[index].get(drug) ?? 0) + (span?.drug != null && span.drug.trim() === drug ? unnamed : 0);

        consumed += attributed;
        if (range.fromEpochDay >= windowStart) consumedInTrailingWindow += attributed;
        if (span?.ambiguous) excluded += unnamed;
      }

      return {
        entry,
        projection: projectStockFromCounts(entry, { consumed, consumedInTrailingWindow, excluded }, asOfEpochDay)
      };
    });
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
      const values = [
        input.quantity,
        input.unit,
        input.recordedEpochDay,
        everCreated ? 1 : 0,
        input.openedEpochDay ?? null,
        input.inUseWindowDays ?? null,
        input.inUseEndEpochDay ?? null,
        now()
      ];

      if (existing.length > 0) {
        await driver.run(
          `UPDATE medication_stock
              SET quantity = ?, unit = ?, recorded_epoch_day = ?, reminder_ever_created = ?, reminder_dismissed = 0,
                  opened_epoch_day = ?, in_use_window_days = ?, in_use_end_epoch_day = ?, updated_at = ?
            WHERE drug = ?`,
          [...values, drug]
        );
        return existing[0].uuid;
      }

      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO medication_stock
           (uuid, drug, quantity, unit, recorded_epoch_day, reminder_ever_created,
            opened_epoch_day, in_use_window_days, in_use_end_epoch_day, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid, drug, ...values]
      );
      return uuid;
    },

    /* The reminder goes first and the row second, with no transaction
       around the pair. A process death between two writes has to leave a
       state something can still fix, and only this order does:
       reconcileRunOutReminders iterates the medication_stock rows that
       exist, so a row that survived with its reminder already gone is
       visited (and reads as the person's own handoff, stockReminder.ts)
       and the delete retries cleanly. The reverse leaves a reminder for a
       drug that has no row, which that loop can never reach and nothing
       else clears - it just keeps firing. */
    async deleteEntry(id) {
      const rows = await driver.query<{ drug: string }>('SELECT drug FROM medication_stock WHERE uuid = ?', [id]);
      if (rows.length === 0) return;

      const auto = findAutoReminder(await reminders.getReminders(), rows[0].drug);
      if (auto) await reminders.deleteReminder(auto.id);
      await driver.run('DELETE FROM medication_stock WHERE uuid = ?', [id]);
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
