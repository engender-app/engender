/* The first run's step order, in one place (phase 10 redesign ticket 33).

   Three of this ticket's scripts walk the flow - the shots, the flipbooks
   and the contrast pass - and each declared the nine steps for itself until
   a code review pointed at the proof that this drifts:
   `tests/setup-shape-gallery.mjs`, written for ticket 29, still carries an
   eight-step copy with `checkin` in it, which left the flow when ticket 31
   landed.

   The runtime list is `onboardingSteps()` in `$lib/onboarding/steps`, which
   is TypeScript inside the app and so cannot be imported by a plain script;
   this is the one place that restates it, and `tests/gates-surfaces.test.ts`
   is what holds the app's own list to what a screen may assume. */

/** In order. `lock` is the access-mode step, which draws its own two screens
    inside one step (ticket 30). */
export const SETUP_STEPS = [
  'welcome',
  'name',
  'flag',
  'scales',
  'areas',
  'lock',
  'permissions',
  'disguise',
  'done'
];
