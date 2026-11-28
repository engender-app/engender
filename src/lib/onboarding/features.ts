import { FEATURE_MODULE_ROWS, type HubRow, type HubRowKey } from '../data/hubRows';

/** The modules a new journal starts with, before anyone has answered the features step and
    after "straight to the app" skips it: the everyday core on, the specialist ones off. A
    journal that opened with nothing on had a near-empty More hub and no hint of what the
    app does. Photos and support are not modules and are always shown. */
export const DEFAULT_MODULES: readonly HubRowKey[] = ['care', 'appointments', 'milestones', 'effects', 'voice-benchmark'];

/** First-run preset only. An archive and an existing journal already own
    their visibility choices, including an explicit empty older pin set. */
export function firstRunModuleWrites(
  restoring: boolean,
  wasOnboarded: boolean,
  selected: readonly HubRowKey[] | null
): { row: HubRow; hidden: boolean }[] {
  if (restoring || wasOnboarded) return [];
  const enabled = new Set(selected ?? DEFAULT_MODULES);
  return FEATURE_MODULE_ROWS.map((row) => ({ row, hidden: !enabled.has(row.key) }));
}
