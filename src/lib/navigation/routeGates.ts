/* Choose gates from boot and navigation state. Send needs-setup straight
   to onboarding and let it own access setup so local answers survive. Read
   prefs.onboarded only after unlock. Handle the recovery access gate before
   the route or return prompt (ADR-0054) and have the layout close Quick add.
   Only Home can prompt a return. Preserve linked, notification and Android
   launch destinations. */

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
