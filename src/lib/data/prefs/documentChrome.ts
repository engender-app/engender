/* What the document wears: the palette, the mood preset, the theme, the
   three accessibility attributes, the tab icon and the manifest (ADR-0009).

   Eight stamps, decided in two places that cannot share code. The layout's
   effect calls this function once the app is running. The inline script at
   the top of src/app.html stamps the same eight before first paint, because
   waiting for the layout means a flash of the wrong theme on every cold
   start and, while disguised, a flash of the flag in the tab strip. That
   script runs before any module is parsed, so it cannot import this file
   and writes the rule out again in its own words.

   Neither can be deleted for the other, so what stops them disagreeing is
   fixtures/document-chrome.json: documentChrome.test.ts drives this
   function against it and tests/app-html-chrome.test.ts drives the script
   text against it, the same standoff ADR-0028 pinned for launch routes. Add
   a preference to one adapter and not the other and the fixture is what
   goes red, rather than a cold start looking wrong to somebody.

   Rune-free on purpose: the layout holds the reactivity, this holds the
   rule, and a node test can call it. */

import type { BootPreferences } from './preferences.ts';

/** The boot preferences the document actually wears - the subset both
    adapters read, so the fixture holds these seven and nothing else. */
export type ChromePreferences = Pick<
  BootPreferences,
  | 'palette'
  | 'moodPreset'
  | 'theme'
  | 'a11yTextSizeBoost'
  | 'a11yLegibilityBoost'
  | 'a11yMotionReduce'
  | 'disguise'
>;

/** What the two media queries report. Passed in rather than read here,
    because the pre-paint script asks them directly and the layout keeps
    them in state through a change listener. */
export interface SystemPreferences {
  prefersDark: boolean;
  prefersReducedMotion: boolean;
}

/** The tab icon that says nothing about the app: the disguised face, and
    also what the quick-exit blank wears over an undisguised tab
    (disguise/identity.ts). Named because two rules reach for the same
    asset and neither owns it more than the other. */
export const NEUTRAL_TAB_ICON = 'favicon-notes.svg';

export interface DocumentChrome {
  palette: string;
  moodPreset: string;
  theme: 'light' | 'dark';
  a11yTextSize: 'normal' | 'boost';
  a11yLegibility: 'normal' | 'boost';
  a11yMotion: 'normal' | 'reduce';
  icon: string;
  manifest: string;
}

export function documentChrome(prefs: ChromePreferences, system: SystemPreferences): DocumentChrome {
  return {
    palette: prefs.palette,
    moodPreset: prefs.moodPreset,
    /* `system` is a stored value and not an attribute: the document only
       ever carries a resolved light or dark. */
    theme: prefs.theme === 'system' ? (system.prefersDark ? 'dark' : 'light') : prefs.theme,
    a11yTextSize: prefs.a11yTextSizeBoost ? 'boost' : 'normal',
    a11yLegibility: prefs.a11yLegibilityBoost ? 'boost' : 'normal',
    /* Either source reducing motion reduces it; the preference can only
       turn it off, never back on against the system's answer. */
    a11yMotion: prefs.a11yMotionReduce || system.prefersReducedMotion ? 'reduce' : 'normal',
    icon: prefs.disguise ? NEUTRAL_TAB_ICON : 'favicon.svg',
    manifest: prefs.disguise ? 'manifest-notes.webmanifest' : 'manifest.webmanifest'
  };
}
