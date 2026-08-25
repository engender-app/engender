/* The shape of the first run, as data rather than as a number compared
   against in seven places (phase 5 ticket 26).

   The flow used to be `let step = $state(0)` and `{#if step === 2}`, which
   meant the order, the count, the progress label and the back button each
   knew the sequence separately and had to be edited together. Naming the
   steps makes the sequence one list, and it makes the two rules the user
   set for this ticket - every step is skippable, every step can be left -
   things a test can check rather than things to remember per branch.

   Deliberately rune-free and DOM-free, so it runs in the Node tier next to
   the rest of the pure model (ADR-0017). */

/** In order. The route renders one of these at a time and nothing else. */
export type OnboardingStep = 'welcome' | 'name' | 'flag' | 'scales' | 'lock' | 'checkin' | 'done';

/* What a first run settles, and why each one is here rather than left to
   Settings:

     name     the greeting on every Home visit after this one
     flag     the app's whole visual identity, and the one choice that
              shows its own result while it is being made
     scales   which sliders appear when logging, i.e. what the journal is
     lock     whether the app opens to anyone holding the phone
     checkin  the daily prompt, which is the difference between a journal
              kept and a journal installed

   Five settings, five steps, plus a welcome and a finish. Everything else
   the app has a preference for is either already right by default or is
   something a person goes looking for once they know the app. */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'welcome',
  'name',
  'flag',
  'scales',
  'lock',
  'checkin',
  'done'
];

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

/** The next step, or this one at the end. Clamping rather than wrapping:
    the finish is where the flow stops, and there is nothing after it. */
export function stepAfter(step: OnboardingStep): OnboardingStep {
  return ONBOARDING_STEPS[Math.min(stepIndex(step) + 1, ONBOARDING_STEPS.length - 1)];
}

export function stepBefore(step: OnboardingStep): OnboardingStep {
  return ONBOARDING_STEPS[Math.max(stepIndex(step) - 1, 0)];
}

/** Whether the step carries its own Skip.

    A step that stores a preference does, and skipping it means the stored
    default stays exactly as it was rather than being overwritten with
    nothing. The welcome and the finish store nothing, so there is no
    default for a Skip to protect there - the welcome's own primary button
    already moves past it without setting anything, and the finish is the
    end of the flow rather than a thing to get past. Both still carry the
    leave-now action, which every step has. */
export function isSkippable(step: OnboardingStep): boolean {
  return step !== 'welcome' && step !== 'done';
}

/** Where the flow hands over.

    Home, not Settings: a new person has just been told what the app is for
    and the next thing they should see is the thing itself (F16). The one
    exception is a PIN that was asked for and not yet typed - app lock is a
    choice made here and a pair of four-digit entries made on the lock
    screen, and that screen brings them Home itself once the two match. It
    also carries its own Not now, so asking for a PIN and changing your mind
    costs one tap rather than stranding anyone. */
export function onboardingDestination(appLock: boolean): string {
  return appLock ? '/settings/lock?setup=1&next=/' : '/';
}

/** How small the sun starts. Large enough to be plainly the flag from the
    first frame, small enough that the growth over the flow is the thing
    being watched rather than a detail. */
const SUN_START = 0.28;

/** The sun's scale at a given step: the app's identity being assembled as
    the setup is (DIRECTION.md, tier 0's third authored moment).

    It grows by one step's worth per step and arrives at exactly 1 on the
    finish, which is the resting size Home draws a moment later - so the
    handover between the two screens is the same object at the same size,
    not two different suns. Scale rather than ring count, because ring count
    is the flag's own and runs from three stripes to seven: growing "a ring
    per step" would mean a different flow length per palette, and a flag
    drawn with some of its bands missing is not the flag. */
export function sunGrowth(index: number, total: number): number {
  if (total <= 1) return 1;
  const progress = Math.min(Math.max(index, 0), total - 1) / (total - 1);
  return SUN_START + (1 - SUN_START) * progress;
}
