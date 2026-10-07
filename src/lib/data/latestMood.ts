/* The mood Today rings once something is logged today (after-release 06,
   UX-16): the latest of the day's entries that carries one, and when it
   was logged. Rune-free so the node tier can hold the rule. */

export type LoggedMood = { mood: number; timestamp: number };

export function latestMood(entries: readonly { mood: number | null; timestamp: number }[]): LoggedMood | null {
  let latest: LoggedMood | null = null;
  for (const { mood, timestamp } of entries) {
    if (mood == null) continue;
    if (!latest || timestamp > latest.timestamp) latest = { mood, timestamp };
  }
  return latest;
}
