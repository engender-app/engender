/* What the app calls itself right now (ADR-0035).

   Disguise replaces the app's name and icon everywhere at once - the tab,
   the launcher entry, the desktop rail's wordmark, Home's hero - and the
   cost of one surface missing the swap is not that it looks slightly
   wrong. It shows the real app name to whoever the person turned the
   disguise on to hide it from. Until this module the decoy name was five
   hand-written literals in four files with nothing coordinating them, and
   the rail's was asserted nowhere.

   So the name lives here once and every surface asks. Same seam
   activeFlag.svelte.ts already put under the pride motif: one module
   answers "what does the app look like right now", nobody derives it for
   themselves.

   Rune-free and paraglide-free (ADR-0016): the app's own name is a
   catalogue lookup, so callers pass it in and this decides which of the
   two names is the right one. */

/** The disguised name is the same in every language. */
export const DECOY_NAME = 'Notes';

/** What a surface writes where the app's name goes. `appName` is the
    catalogue's, supplied by the caller. */
export function appWordmark(disguised: boolean, appName: string): string {
  return disguised ? DECOY_NAME : appName;
}

/** The fourth tab's label (ticket 08). Undisguised it names the whole
    subject the hub holds; disguised, everything the bar says stays as
    neutral as the rest of it already is, so it reverts to the generic word
    instead. Both strings are the caller's own catalogue lookups - this only
    picks between them, same shape as `appWordmark`. */
export function hubTabLabel(disguised: boolean, hubLabel: string, subjectLabel: string): string {
  return disguised ? hubLabel : subjectLabel;
}

interface TabState {
  disguised: boolean;
  /** The app's own name, from the catalogue - the same parameter and the
      same reason as `appWordmark`, so the real name has one owner rather
      than a second copy spelled out here. */
  appName: string;
  /** The icon the preferences resolved to (documentChrome). */
  icon: string;
}

interface TabIdentity {
  title: string;
  icon: string;
}

/** Keeps the tab's name and icon consistent with the disguise preference. */
export function tabIdentity(state: TabState): TabIdentity {
  return { title: appWordmark(state.disguised, state.appName), icon: state.icon };
}
