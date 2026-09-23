/* The shell's route policy: which of four things the app owes the person
   before the screen the URL names, asked of the same handful of boot facts
   and answered in one order (final audit A8). Extracted from +layout.svelte
   on the recipe launch-routes.ts and screen-transition.ts already followed:
   the rule is a table, the layout is where a table gets buried, and four
   effects each deciding for themselves had an order nobody could run in a
   test. The layout still owns the reactivity and the doing - the goto, the
   chooser flag, the return moment's reads - and asks this which one.

   **The first-run exception (ticket 54).** A brand new install's very first
   boot state is `needs-setup` - nothing to unlock, nothing chosen yet -
   which used to mean the passphrase gate painted before onboarding's own
   first-run redirect ever got a chance to run, since `prefs.onboarded`
   lives in the encrypted database this state has no database for. So this
   one cannot wait for the journal to open, since a state with no database
   is exactly what it is for. Held for the whole of `needs-setup` rather
   than only up to onboarding's own access-mode step: that step wires the
   four-mode module in directly (ticket 53's AccessModeSetup, inside
   onboarding/+page.svelte) rather than asking the layout to hand the screen
   to JournalGate and back. Trying the handoff first is what found the
   reason not to - the layout's `{#if}` chain unmounts the route while a
   sibling branch renders, so a route given back after a detour through
   JournalGate remounts from scratch and loses every local answer onboarding
   was holding, `step` included.

   **A recovery unlock owes an access mode (ADR-0054, ticket sec-02).** Quick
   add is a layout-level sibling of the gate chain, not inside it, so its own
   open flag is the only thing keeping it up. PostRecoveryAccessMode arriving
   is the same kind of instead-of-the-route moment as a mid-session lock -
   not a navigation, not Escape - so it gets the same clear, for the same
   reason lockNow() does (phase 8 audit ticket 08). Ahead of the return
   moment: nothing runs behind a screen somebody has not finished, and the
   moment is asked for once the access mode is chosen and this stops
   answering.

   **The first-run gate (F16).** Onboarding is the entire first-run
   experience. Held until boot is ready, because `onboarded` lives in SQLite
   (ticket 06) and is not in the small set mirrored outside it - before the
   database opens it reads as its default, which would send every returning
   user through onboarding again. And held while locked, like everything
   below it.

   **The return moment (phase 8 features ticket 05, ADR-0062).** In the shell
   rather than on Home, which the features spec does not render on and which
   is built for somebody who was here yesterday anyway - and in the shell
   rather than as a hub row, because a place you can go and check what is
   waiting is a place that accumulates what you have not done. Only from
   Home: somebody who opened the app on a notification, a deep link or an
   Android launch route asked for something specific, and a return surface
   is not allowed to take that over. This only says the question is worth
   asking; whether there is a return to show is the layout's read. */

export interface RouteGateFacts {
  path: string;
  /** `needsOnboardingAccessMode`: a brand new install, with no database yet. */
  firstRunSetup: boolean;
  /** A recovery unlock that has not been given its new access mode yet. */
  owesAccessMode: boolean;
  ready: boolean;
  locked: boolean;
  onboarded: boolean;
}

export type RouteGate = 'onboarding' | 'close-chooser' | 'coming-back' | null;

const onOnboarding = (path: string) => path.startsWith('/onboarding');

export function routeGate(facts: RouteGateFacts): RouteGate {
  if (facts.firstRunSetup) return onOnboarding(facts.path) ? null : 'onboarding';
  if (facts.owesAccessMode) return 'close-chooser';
  if (!facts.ready || facts.locked) return null;
  if (!facts.onboarded) return onOnboarding(facts.path) ? null : 'onboarding';
  if (facts.path === '/') return 'coming-back';
  return null;
}
