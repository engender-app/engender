import { STOCK_PREFIX, stockAutoSource } from '../autoSource';
import { drugNameKey } from '../regimenEpisode';
import type { MigrationDb } from './migration-runner';

/** Keep the latest updated stock row as a complete choice. A later local rowid
 * breaks timestamp ties. SQLite's lower() does not implement the Unicode key. */
export async function migrateStockIdentity(db: MigrationDb): Promise<void> {
  const rows = await db.query<{ uuid: string; drug: string }>(
    'SELECT uuid, drug FROM medication_stock ORDER BY updated_at DESC, id DESC'
  );
  const winners = new Map<string, string>();
  for (const row of rows) {
    const key = drugNameKey(row.drug);
    if (winners.has(key)) {
      await db.run('DELETE FROM medication_stock WHERE uuid = ?', [row.uuid]);
    } else {
      winners.set(key, row.drug);
      await db.run('UPDATE medication_stock SET drug_key = ? WHERE uuid = ?', [key, row.uuid]);
    }
  }

  const reminders = await db.query<{ uuid: string; auto_source: string }>(
    "SELECT uuid, auto_source FROM reminder WHERE auto_source GLOB 'stock:*' ORDER BY updated_at DESC, id DESC"
  );
  const kept = new Set<string>();
  for (const reminder of reminders) {
    const key = drugNameKey(reminder.auto_source.slice(STOCK_PREFIX.length));
    const owner = winners.get(key);
    if (owner === undefined) continue;
    // Only the chosen stock row's reminder survives. Taken-over reminders have no marker.
    if (reminder.auto_source !== `${STOCK_PREFIX}${owner}` || kept.has(key)) {
      await db.run('DELETE FROM reminder WHERE uuid = ?', [reminder.uuid]);
    } else {
      kept.add(key);
      await db.run('UPDATE reminder SET auto_source = ? WHERE uuid = ?', [stockAutoSource(owner), reminder.uuid]);
    }
  }
  await db.exec('CREATE UNIQUE INDEX idx_medication_stock_drug_key ON medication_stock(drug_key)');
}
