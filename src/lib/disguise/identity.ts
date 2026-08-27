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

import { NEUTRAL_TAB_ICON } from '../data/prefs/documentChrome';

/** The name the app answers to while disguised. A plain notes app is the
    thing it claims to be, down to the decoy screen quick exit shows
    (DecoyNotes.svelte), and it is this word in every language - which is
    why it is a literal here rather than a catalogue entry. */
export const DECOY_NAME = 'Notes';

/** The app's own name in the tab strip. Not the catalogue's `app_name`,
    because the tab is stamped from an effect that has already resolved
    the disguise; the two are the same string and docs/ui-copy.md is what
    keeps them that way. */
const APP_NAME = 'enGender';

/** What a surface writes where the app's name goes. `appName` is the
    catalogue's, supplied by the caller. */
export function appWordmark(disguised: boolean, appName: string): string {
  return disguised ? DECOY_NAME : appName;
}

export interface TabState {
  disguised: boolean;
  /** Quick exit is holding the tab over the app. */
  blanked: boolean;
  /** The icon the preferences resolved to (documentChrome), which the
      blank overrides and nothing else does. */
  icon: string;
}

export interface TabIdentity {
  title: string;
  icon: string;
}

/** The tab's identity, decided once: a tab called "Notes" next to a trans
    flag is not disguised at all, and the icon is the half of it that
    survives a narrow tab strip, a background tab and the bookmark list.

    The blank is this side's alone - app.html, which stamps the icon before
    first paint, has no notion of a quick exit - so it sits on top of the
    resolved icon rather than inside it. */
export function tabIdentity(state: TabState): TabIdentity {
  if (state.disguised) return { title: DECOY_NAME, icon: state.icon };
  /* Undisguised, quick exit is a blank page rather than the decoy, so the
     tab says what an unused tab says and drops the flag with it. */
  if (state.blanked) return { title: 'New tab', icon: NEUTRAL_TAB_ICON };
  return { title: APP_NAME, icon: state.icon };
}
