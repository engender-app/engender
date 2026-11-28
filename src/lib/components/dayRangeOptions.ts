import { m } from '$lib/paraglide/messages';

/** A window control's segments: "30d" on the segment, "30 days" as its accessible name.
    Wear and the stats range draw their windows from this, so they cannot drift apart again. */
export function dayRangeOptions(days: readonly number[]): { value: string; label: string; aria: string }[] {
  return days.map((d) => ({ value: String(d), label: m.range_days({ days: String(d) }), aria: m.range_days_aria({ days: String(d) }) }));
}
