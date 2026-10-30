import { parseLegacyCostText } from '../cost';
import type { MigrationDb } from './migration-runner';

/** Hair removal's free-text cost before functional audit ticket 30, read by
    the recorded rule (cost.ts, parseLegacyCostText). A clean parse becomes
    the amount and currency; any other non-blank text is appended to the
    session's note on a line of its own, word for word, so nothing typed is
    lost. Either way the old column is emptied: ticket 50 drops it.
    `updated_at` is left alone - the session did not change, its storage
    did. A bare number takes `fallbackCurrency`, the device locale's default. */
export async function migrateHairRemovalCost(db: MigrationDb, fallbackCurrency: string): Promise<void> {
  const rows = await db.query<{ id: number; cost: string; note: string | null }>(
    'SELECT id, cost, note FROM hair_removal_session WHERE cost IS NOT NULL'
  );
  for (const row of rows) {
    const text = row.cost.trim();
    const parsed = text ? parseLegacyCostText(text, fallbackCurrency) : null;
    if (parsed) {
      await db.run('UPDATE hair_removal_session SET cost = NULL, cost_amount = ?, cost_currency = ? WHERE id = ?', [
        parsed.amount,
        parsed.currency,
        row.id
      ]);
    } else {
      await db.run('UPDATE hair_removal_session SET cost = NULL, note = ? WHERE id = ?', [
        appendLegacyCost(row.note, text),
        row.id
      ]);
    }
  }
}

/** The note with an unparsed cost on its own last line; blank text adds nothing. */
export function appendLegacyCost(note: string | null, text: string): string | null {
  if (!text) return note;
  return note?.trim() ? `${note}\n${text}` : text;
}
