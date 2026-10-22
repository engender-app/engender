import { FEATURE_MODULE_ROWS, type HubRow, type HubRowKey } from '../data/hubRows';

/** First-run preset only. An archive and an existing journal already own
    their visibility choices, including an explicit empty older pin set. */
export function firstRunModuleWrites(
  restoring: boolean,
  wasOnboarded: boolean,
  selected: readonly HubRowKey[] | null
): { row: HubRow; hidden: boolean }[] {
  if (restoring || wasOnboarded) return [];
  const enabled = new Set(selected ?? []);
  return FEATURE_MODULE_ROWS.map((row) => ({ row, hidden: !enabled.has(row.key) }));
}
