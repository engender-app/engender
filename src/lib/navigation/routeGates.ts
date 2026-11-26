/* Choose the route gate from boot and navigation facts. The layout
   owns side effects, including redirects and closing quick add.

   A fresh install goes straight to onboarding for all of needs-setup.
   Onboarding owns access-mode setup because the layout's gate would
   unmount the route and discard its local answers. Returning journals
   check prefs.onboarded only after SQLite attaches, while unlocked.

   A recovery unlock must finish the access-mode screen before opening
   the route or considering the return moment (ADR-0054). Close quick
   add when entering that gate because it sits outside the gate chain.

   Consider the return moment only on Home (ADR-0062). Explicit links,
   notifications and Android launch routes keep their destinations.
   The layout reads the journal to decide whether there is anything to
   show. */

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
