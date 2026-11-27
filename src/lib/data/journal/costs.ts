/* Every record that carries a cost, in one read. The seam ticket 31's Cost reading in Look back stands on: it picks
   the span and the presentation, and totals only through
   costTotalsByCurrency (cost.ts), which never adds two currencies together.

   Read-only, and one query rather than five areas asked in turn, the same
   budget lastWrite.ts keeps. A record with no amount and no refund is left
   out. */

import type { SqliteDriver } from '../sqlite/driver';
import { costFromRow, type Cost, type CostRow } from '../cost';

export type CostSource = 'hairRemoval' | 'appointment' | 'procedure' | 'lab' | 'stock';

export interface CostRecord {
  source: CostSource;
  /** The record's own id in its area. */
  id: string;
  /** The day the money belongs to: the session, the visit, the surgery, the
      draw, or the day the stock was counted. Null for a wait with no day
      yet and a procedure with no date. */
  epochDay: number | null;
  cost: Cost;
}

export interface CostsArea {
  /** Every costed record, by day (undated last), then by source. */
  getCosts(): Promise<CostRecord[]>;
}

const HAS_COST = '(cost_amount IS NOT NULL OR cost_refunded <> 0)';

export function makeCostsArea(driver: SqliteDriver): CostsArea {
  return {
    async getCosts() {
      const rows = await driver.query<CostRow & { source: CostSource; uuid: string; epoch_day: number | null }>(
        `SELECT source, uuid, epoch_day, cost_amount, cost_currency, cost_refunded FROM (
           SELECT 'hairRemoval' AS source, uuid, epoch_day, cost_amount, cost_currency, cost_refunded, id
             FROM hair_removal_session WHERE ${HAS_COST}
           UNION ALL
           SELECT 'appointment', uuid, epoch_day, cost_amount, cost_currency, cost_refunded, id
             FROM appointment WHERE ${HAS_COST}
           UNION ALL
           SELECT 'procedure', uuid, surgery_epoch_day, cost_amount, cost_currency, cost_refunded, id
             FROM procedure WHERE ${HAS_COST}
           UNION ALL
           SELECT 'lab', uuid, epoch_day, cost_amount, cost_currency, cost_refunded, id
             FROM lab_result WHERE ${HAS_COST}
           UNION ALL
           SELECT 'stock', uuid, recorded_epoch_day, cost_amount, cost_currency, cost_refunded, id
             FROM medication_stock WHERE ${HAS_COST}
         ) ORDER BY epoch_day IS NULL, epoch_day, source, id`
      );
      return rows.map((row) => ({ source: row.source, id: row.uuid, epochDay: row.epoch_day, cost: costFromRow(row) }));
    }
  };
}
