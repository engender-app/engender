/* Turning a person's element picks into wrapped-card content (ticket 18).
   Ticket 16's WrappedCardContent has no field for a stat nobody chose, so
   this is the one place that choice gets made: a stat only reaches the
   card if its flag is set, and the same is true of the palette art. */

import type { WrappedCardContent, WrappedCardStat } from './wrappedCard';
import { nameSlug } from './fold';
import { dateInputValueFromEpochDay, todayEpochDay } from './epochDay';

export interface WrappedShareSelection {
  counts: boolean;
  streak: boolean;
  paletteArt: boolean;
}

/** Nothing picked, which is what the picker opens on - the acceptance rule
    that no element appears unless it was explicitly chosen. */
export const WRAPPED_SHARE_NOTHING_SELECTED: WrappedShareSelection = {
  counts: false,
  streak: false,
  paletteArt: false
};

export function wrappedShareContent(
  selection: WrappedShareSelection,
  counts: WrappedCardStat,
  streak: WrappedCardStat
): WrappedCardContent {
  const stats: WrappedCardStat[] = [];
  if (selection.counts) stats.push(counts);
  if (selection.streak) stats.push(streak);
  return { stats, paletteArt: selection.paletteArt };
}

/** `alicja-wrapped-2026-08-19.png`, matching journeyFileName's shape so a
    wrapped card and a photo journey read as siblings rather than one
    looking like a backup (deliver.ts's exportFileName is the journal's
    own name, which this deliberately does not share). */
export function wrappedShareFileName(name: string, epochDay: number = todayEpochDay()): string {
  const slug = nameSlug(name);
  return `${slug ? `${slug}-` : ''}wrapped-${dateInputValueFromEpochDay(epochDay)}.png`;
}
