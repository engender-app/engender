import { m } from '$lib/paraglide/messages';

/** A window control's segments: "30d" on the segment, "30 days" as its
    accessible name (after-release 28). The hormone curve, Wear and Tally
    draw their windows from this, so the three cannot drift apart again. */
export function dayRangeOptions(days: readonly number[]): { value: string; label: string; aria: string }[] {
  return days.map((d) => ({ value: String(d), label: m.range_days({ days: String(d) }), aria: m.range_days_aria({ days: String(d) }) }));
}
