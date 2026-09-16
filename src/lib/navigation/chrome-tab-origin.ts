/* Which tab was lit before the person stepped into settings chrome
   (ADR-0076, audit item 4). Module state, the same shape as smart-back.ts's
   own depth counter: a fact this app owns about its own navigation, kept
   out of active-tab.ts so that module stays a pure table its own tests can
   call directly without one test's path leaking into the next one's
   answer. */

let lastTabKey = '';

/** Called on every settled navigation with the tab that path lights
    outside of chrome. A chrome path itself resolves to '' (nothing to
    remember yet, or the last tab's own memory unchanged) and is ignored -
    only a real tab overwrites what the gear will borrow next. */
export function noteTabVisit(key: string): void {
  if (key) lastTabKey = key;
}

/** The tab chrome should borrow, or '' where nothing has lit one yet - a
    fresh deep link straight into settings, which lights no tab rather
    than guessing one. */
export function chromeTabOrigin(): string {
  return lastTabKey;
}
