/* Which tier-2 pattern one screen becomes another with (phase 5 ticket 18).

   The primitives themselves were built by ticket 17 and live in
   $lib/motion/navigation.ts. What was missing was the decision: nothing in
   the app chose between them, so every navigation was the same 6px slide
   from .screen's own entrance animation whether it crossed the four tabs,
   opened a detail, or went back.

   It is a pure function and it lives here rather than in the layout for the
   same reason active-tab.ts does: the rule is a table, the layout is where
   a table gets buried, and a rule nobody can run in a test is one nobody
   can check. */

import { activeTabKey } from './active-tab';

export type ScreenTransition = 'none' | 'fade-through' | 'shared-axis' | 'shared-axis-back';

export interface NavigationFacts {
  from: string | null;
  to: string;
  /** SvelteKit's own navigation type; 'popstate' is the system or the button. */
  type: string;
  /** SvelteKit's history delta, negative when the navigation goes back. */
  delta?: number;
  /** Android draws its own back animation, and it starts before we would. */
  isAndroid: boolean;
  /** The gates and onboarding, which have no chrome and no peers. */
  isChromeless: boolean;
}

/**
 * Tier 2, mapped to this app's shape rather than applied by rote.
 *
 * The four tabs are peers, so crossing them is a fade-through and never a
 * slide: a slide implies an order the tabs do not have. Going deeper inside
 * one tab is a sequence, so that is the shared axis. Coming back up reverses
 * it - except on Android, where the system's predictive back gesture has
 * already started showing the person where they are going, and a fixed
 * animation played on top of that is worse than no animation at all.
 */
export function screenTransition(facts: NavigationFacts): ScreenTransition {
  const { from, to, type, delta, isAndroid, isChromeless } = facts;

  /* A cold start has nothing to come from, and the gates are not part of
     the app's navigation - they render instead of it. */
  if (from === null || isChromeless) return 'none';
  if (from === to) return 'none';

  if (isBack(from, to, type, delta)) return isAndroid ? 'none' : 'shared-axis-back';

  /* Within one tab the app is a stack, across tabs it is four peers. That
     is the whole rule, and it is why the tab table is the one that answers
     this rather than a second list of "detail routes" kept beside it. */
  return activeTabKey(from) === activeTabKey(to) ? 'shared-axis' : 'fade-through';
}

/* Two ways back, and both have to count.
   The system's back and the browser's arrive as a popstate with a negative
   delta. But most of the app's own back controls are ordinary links to a
   fixed parent (ScreenHeader's arrow is an <a href>, deliberately, so it
   middle-clicks and shows its target), and those arrive as a forward
   navigation to a shorter path. Treating only the first as back would send
   the header arrow sliding the wrong way on almost every screen. */
function isBack(from: string, to: string, type: string, delta?: number): boolean {
  if (type === 'popstate') return (delta ?? 0) < 0;
  /* Home is every tab's ancestor by string, and reaching it is a tab
     change rather than a step up, so it is excluded by hand. */
  if (to === '/') return false;
  return from.startsWith(to.endsWith('/') ? to : `${to}/`);
}
