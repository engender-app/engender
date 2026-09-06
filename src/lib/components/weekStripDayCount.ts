/* How many days WeekStrip draws, given how much width it has (CARPET-02).

   Two counts, not a fit-as-many-as-possible fluid width: a strip that grows
   by one cell every few pixels would relabel "last N days" to a different N
   on every resize, which is not a heading anyone could read. Desktop gets a
   deliberate second tier - 14, two full weeks, still comfortably legible at
   the container's fixed 640px column (`--content-max`, theme/base.css) - and
   nothing between phone and that tier does.

   The threshold matches app.css's `@container app (min-width: 1024px)`, the
   one breakpoint the shell already switches its whole layout on (left rail,
   centred column), and kit.css's own copy of that query for the cell-shrink
   rule - weekStripDayCount.test.ts greps both files for this exact number
   so the three can't drift apart silently. */
export const WEEK_STRIP_DESKTOP_BREAKPOINT = 1024;

/* kit.css's cell-shrink rule keys off this same number
   (`[data-strip-count='14']`) - weekStripDayCount.test.ts greps it there too,
   the same anti-drift shape as the breakpoint above. */
export const WEEK_STRIP_DESKTOP_DAY_COUNT = 14;

export function weekStripDayCount(containerWidth: number, isAndroidPlatform: boolean): number {
  if (isAndroidPlatform) return 7;
  return containerWidth >= WEEK_STRIP_DESKTOP_BREAKPOINT ? WEEK_STRIP_DESKTOP_DAY_COUNT : 7;
}
