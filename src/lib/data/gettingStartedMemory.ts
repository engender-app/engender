/* Which Getting started rows Home last drew crossed, for this session only
   (ux-carpet ticket 288).

   A row that is already done when Home arrives paints crossed from its first
   frame. A row that became done while Home was off screen - a milestone
   added on its own screen, then back - should not simply be crossed when the
   person returns: they did the thing, and the list answering it is the
   moment worth drawing. So Home remembers what it last showed, and a done
   row it had not shown as done crosses on arrival.

   A module variable, not storage: it is nothing the person keeps, a reload
   starts the session over, and the first time Home is shown in a session
   nothing is remembered, so every done row is simply there. */

let lastCrossed: ReadonlySet<string> | null = null;

/** Whether `key`, done now, should be drawn open first and cross: Home has
    been shown in this session and did not show the row as done. */
export function crossesOnArrival(key: string): boolean {
  return lastCrossed !== null && !lastCrossed.has(key);
}

/** What Home is now showing as done, or about to. */
export function rememberCrossed(keys: Iterable<string>): void {
  lastCrossed = new Set(keys);
}
