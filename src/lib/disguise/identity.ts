/* The app and decoy names come from the caller's catalogue lookups.
   This module only chooses between them, without importing Paraglide
   into the Node tier (ADR-0016). */

/** What a surface writes where the app's name goes. `appName` is the
    catalogue's, supplied by the caller. */
export function appWordmark(disguised: boolean, appName: string, decoyName: string): string {
  return disguised ? decoyName : appName;
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
  decoyName: string;
  /** The icon the preferences resolved to (documentChrome). */
  icon: string;
}

interface TabIdentity {
  title: string;
  icon: string;
}

/** Keeps the tab's name and icon consistent with the disguise preference. */
export function tabIdentity(state: TabState): TabIdentity {
  return { title: appWordmark(state.disguised, state.appName, state.decoyName), icon: state.icon };
}
