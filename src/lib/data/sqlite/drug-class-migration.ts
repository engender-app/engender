import { inferDrugClass } from '../drugClass';
import type { MigrationDb } from './migration-runner';

/** Gives every episode written before functional audit ticket 18 the class
    its drug infers to, by the same rule a new episode and an older archive
    use (drugClass.ts). The column's own default is 'other', so only the HRT
    rows need writing. */
export async function migrateDrugClass(db: MigrationDb): Promise<void> {
  const rows = await db.query<{ id: number; drug: string }>('SELECT id, drug FROM regimen_episode');
  for (const row of rows) {
    if (inferDrugClass(row.drug) === 'hrt') {
      await db.run("UPDATE regimen_episode SET drug_class = 'hrt' WHERE id = ?", [row.id]);
    }
  }
}
