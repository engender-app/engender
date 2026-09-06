/* How many days WeekStrip draws, given how much width it has (CARPET-02).

   Two counts, not a fit-as-many-as-possible fluid width: a strip that grows
   by one cell every few pixels would relabel "last N days" to a different N
   on every resize, which is not a heading anyone could read. Desktop gets a
   deliberate second tier - 14, two full weeks, still comfortably legible at
   the container's fixed 640px column (`--content-max`, theme/base.css) - and
   nothing between phone and that tier does.

   The threshold matches app.css's `@container app (min-width: 1024px)`, the
   one breakpoint the shell already switches its whole layout on (left rail,
   centred column) - a second breakpoint invented here would drift from that
   one the first time either changed. */
export const WEEK_STRIP_DESKTOP_BREAKPOINT = 1024;

export function weekStripDayCount(containerWidth: number, isAndroidPlatform: boolean): number {
  if (isAndroidPlatform) return 7;
  return containerWidth >= WEEK_STRIP_DESKTOP_BREAKPOINT ? 14 : 7;
}
