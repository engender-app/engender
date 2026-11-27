/* Which tier-2 pattern one screen becomes another with.

   The primitives themselves were built and live in $lib/motion/navigation.ts. What was
   missing was the decision: nothing in the app chose between them, so every navigation was
   the same 6px slide from .screen's own entrance animation whether it crossed the four tabs,
   opened a detail, or went back.

   It is a pure function and it lives here rather than in the layout for the same reason
   active-tab.ts does: the rule is a table, the layout is where a table gets buried, and a
   rule nobody can run in a test is one nobody can check. */

import { activeTabKey } from './active-tab';

type ScreenTransition = 'none' | 'fade-through' | 'shared-axis' | 'shared-axis-back' | 'container';

/* NavigationFacts stays exported only for its own test. */
export interface NavigationFacts {
  from: string | null;
  to: string;
  /** SvelteKit's own navigation type; 'popstate' is the system or the button. */
  type: string;
  /** SvelteKit's history delta, negative when the navigation goes back. */
  delta?: number;
  /** The gates and onboarding, which have no chrome and no peers. */
  isChromeless: boolean;
  /** Whether a sheet was open over the screen the navigation left from, so
      whatever was tapped was inside a modal rather than on the screen. */
  fromSheet: boolean;
  /** What settings chrome (`/settings`) borrows to light a tab (chrome-tab-origin.ts) -
      threaded in rather than read here so this stays a pure table its own test can call
      directly. `''` where nothing has lit a tab yet, which reads as a tab change like any
      other unknown route. */
  chromeOrigin: string;
}

/**
 * Tier 2, mapped to this app's shape rather than applied by rote.
 *
 * The four tabs are peers, so crossing them is a fade-through and never a
 * slide: a slide implies an order the tabs do not have. Going deeper inside
 * one tab is a sequence, so that is the shared axis. Coming back up reverses
 * it.
 */
export function screenTransition(facts: NavigationFacts): ScreenTransition {
  const { from, to, type, delta, isChromeless, fromSheet, chromeOrigin } = facts;

  /* A cold start has nothing to come from, and the gates are not part of
     the app's navigation - they render instead of it. */
  if (from === null || isChromeless) return 'none';
  if (from === to) return 'none';

  if (isBack(from, to, type, delta, chromeOrigin)) {
    /* Out of the editor the transform runs backwards, which is the pattern
       being symmetric rather than a second decision: the same two boxes
       swap which one is arriving. Symmetric in the carve-out too: a screen
       that did not grow the editor does not get it shrinking back into it,
       and leaving this leg alone would have spent the transform's own
       longer duration on a plain crossfade. Home's is symmetric in its own
       way - it fades forward like a tab crossing, so it fades back, which
       the popstate leg of isBack reaches before the tab rule ever could. */
    if (isEntryEditor(from)) {
      if (to === '/') return 'fade-through';
      return to !== NO_CONTAINER ? 'container' : 'shared-axis-back';
    }
    return 'shared-axis-back';
  }

  /* The one container transform in the app. It is not chosen by where the
     navigation came from, because every surface that draws an entry owes
     the same link and they are all correct sources - Home's day cards, a
     day, a search hit. What it is chosen by is the destination being the
     editor for an entry that exists, which is the only case where
     something on screen was tapped and is about to become the screen.

     /entry/new is deliberately not here. Quick add's fan, a day's add
     button and a launcher shortcut all open it with nothing behind them,
     and a container transform with no container is a crossfade wearing a
     longer duration. */
  /* Home's recent-entry rows are the exception called out on as this file's own container
     transform. From Home an entry opens as a peer crossing - the fade-through a tab switch
     gets - and Home is the one source that gets it: the day detail and search keep the
     transform, and leaving the editor back to Home already fades through the tab rule at
     the bottom, since /entry lights the calendar tab and / is no tab's step. */
  if (isEntryEditor(to)) {
    /* Out of a sheet it is a fade-through whatever screen the sheet was over. The tag
       insights on /stats open a sheet of the entries carrying a tag, and those cards are a
       correct source by the rule above - so the card's box grew out of an open modal into
       the whole screen while the sheet sat behind it, which is item 23's complaint arriving
       on a second surface. A sheet is not a place a screen grows out of: what happened is
       that a modal was dismissed and a screen replaced the one underneath it, and the
       transform says the card became the screen instead.

       A fact and not a route, unlike the two carve-outs below. /stats draws entry cards
       only inside that sheet today, so naming the route would be right by accident and
       wrong the day a screen draws them both ways. */
    if (fromSheet) return 'fade-through';
    if (from === NO_CONTAINER) return 'shared-axis';
    if (from === '/') return 'fade-through';
    return 'container';
  }

  /* A screen with several views of itself is not a sequence. Wrapped's four cadence tabs
     are one screen showing a different period, so crossing them is tier 3 - change within a
     screen - and the chart's own re-tween is what carries it. Slid as a shared axis the
     whole screen travelled and every figure on it was torn down and rebuilt.

     A table rather than a rule, and one entry long, for the same reason the rest of this
     file is a table: /entry/1 to /entry/2 is also two leaves of one route and it is
     emphatically not this - it is the container transform built. Which of the two a route
     is cannot be read off its shape. */
  if (SWITCHES_VIEWS_IN_PLACE.some((parent) => from.startsWith(parent) && to.startsWith(parent))) {
    return 'none';
  }

  /* Within one tab the app is a stack, across tabs it is four peers. That
     is the whole rule, and it is why the tab table is the one that answers
     this rather than a second list of "detail routes" kept beside it. */
  return activeTabKey(from, chromeOrigin) === activeTabKey(to, chromeOrigin) ? 'shared-axis' : 'fade-through';
}

/**
 * Use shared-axis motion between Safe Space's good-days evidence list
 * and an entry. A cited entry should feel like a step into the detail,
 * not a card opening into the whole screen. This also pairs the entrance
 * with the editor's return instead of fading one way and sliding back.
 *
 * Keep the exception in this rule table. The layout removes the
 * container name when this function chooses a different transition.
 */
const NO_CONTAINER = '/doubt';

/** Routes whose sub-paths are views of one screen rather than steps into it. */
const SWITCHES_VIEWS_IN_PLACE = ['/wrapped/'];

/** The editor for an entry that already exists. `/entry/new/...` is a
    different screen for this purpose, whatever it shares underneath. */
function isEntryEditor(path: string): boolean {
  return /^\/entry\/\d+$/.test(path);
}

/** Use a shorter blind hold when Home opens /entry/new so the hold does not
    cover its sun. Apply it to every entry path, including Quick add and the
    debrief link. The layout scopes --blind-dur to that transition. */
export function leavesHomeForEntry(from: string | null, to: string): boolean {
  return from === '/' && to.startsWith('/entry/new');
}

/* Two ways back, and both have to count.
   The system's back and the browser's arrive as a popstate with a negative
   delta. But most of the app's own back controls are ordinary links to a
   fixed parent (ScreenHeader's arrow is an <a href>, deliberately, so it
   middle-clicks and shows its target), and those arrive as a forward
   navigation to a shorter path. Treating only the first as back would send
   the header arrow sliding the wrong way on almost every screen. */
function isBack(from: string, to: string, type: string, delta: number | undefined, chromeOrigin: string): boolean {
  if (type === 'popstate') return (delta ?? 0) < 0;
  /* Home is every tab's ancestor by string, and reaching it is a tab
     change rather than a step up, so it is excluded by hand. */
  if (to === '/') return false;
  if (from.startsWith(to.endsWith('/') ? to : `${to}/`)) return true;
  /* /more is the settings tab's own hub, the same role /stats or /calendar plays for theirs
     - but a features-phase ticket already reaches it from routes a URL prefix cannot see it
     under (/care/doses) and links straight to /settings/* pages that skip an intervening
     /settings step (the roadmap and the rest of More's rows), so the check above never
     fires for the one back link most of those screens actually have. Without this, closing
     the roadmap read as a step deeper instead of a step up - the wrong shared-axis
     direction, which is what a slide in the wrong direction off the bottom of an easing
     curve reads as a yank. */
  return to === '/more' && activeTabKey(from, chromeOrigin) === 'settings';
}
