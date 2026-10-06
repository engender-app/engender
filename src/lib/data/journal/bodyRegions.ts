/* The body-region area (phase 5 ticket 30, CONTEXT: "Reference data" -
   amended). A region's domain id is its travelling identity (ADR-0002):
   the seeded key for a built-in, the minted uuid for a custom - the same
   split affirmations.ts draws, and the closest model for this area's own
   shape, since a body region is a flat row too.

   Built-ins hide rather than delete, like a Tag or a GenderDimension, so a
   hidden region's logged intensities keep resolving and charting
   (CONTEXT: "Hidden"); ticket 30 does not offer a delete for either kind,
   so there is no deleteRegion here at all. A custom region's name can be
   corrected (after-release 07: a typo otherwise sat in every picker for
   good); a built-in's cannot, since its name is the catalogue's. */

import type { SqliteDriver } from '../sqlite/driver';
import type { BodyRegion } from '../types';
import { assertChanged, bool, domainIdOf, mintUuid, now } from './support';

export interface BodyRegionsArea {
  getBodyRegions(): Promise<BodyRegion[]>;
  addCustomRegion(name: string): Promise<BodyRegion>;
  setRegionHidden(id: string, hidden: boolean): Promise<void>;
  /** Custom regions only. A built-in or unknown id throws. */
  renameCustomRegion(id: string, name: string): Promise<void>;
}

type BodyRegionRow = {
  id: number;
  uuid: string | null;
  key: string | null;
  name: string;
  hidden: number;
};

const toBodyRegion = (row: BodyRegionRow): BodyRegion => ({
  id: domainIdOf(row, 'body region'),
  name: row.name,
  builtIn: row.key !== null,
  hidden: bool(row.hidden)
});

export function makeBodyRegionsArea(driver: SqliteDriver): BodyRegionsArea {
  return {
    async getBodyRegions() {
      const rows = await driver.query<BodyRegionRow>('SELECT id, uuid, key, name, hidden FROM body_region ORDER BY id');
      return rows.map(toBodyRegion);
    },

    async addCustomRegion(name) {
      const uuid = mintUuid();
      await driver.run('INSERT INTO body_region (uuid, name, updated_at) VALUES (?, ?, ?)', [uuid, name, now()]);
      return { id: uuid, name, builtIn: false, hidden: false };
    },

    async setRegionHidden(id, hidden) {
      const result = await driver.run('UPDATE body_region SET hidden = ?, updated_at = ? WHERE key = ? OR uuid = ?', [
        hidden ? 1 : 0,
        now(),
        id,
        id
      ]);
      assertChanged(result, `body region: ${id}`);
    },

    async renameCustomRegion(id, name) {
      const result = await driver.run('UPDATE body_region SET name = ?, updated_at = ? WHERE uuid = ? AND key IS NULL', [
        name,
        now(),
        id
      ]);
      assertChanged(result, `custom body region: ${id}`);
    }
  };
}
