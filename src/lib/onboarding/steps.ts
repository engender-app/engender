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
export type OnboardingStep =
  | 'welcome'
  | 'name'
  | 'flag'
  | 'scales'
  | 'areas'
  | 'lock'
  | 'checkin'
  | 'done';

/* What a first run settles, and why each one is here rather than left to
   Settings:

     name     the greeting on every Home visit after this one
     flag     the app's whole visual identity, and the one choice that
              shows its own result while it is being made
     scales   which sliders appear when logging, i.e. what the journal is
     areas    which of the hub's areas the front page starts pinned with
              (phase 10 redesign ticket 22) - the one central guess left in
              `pinnedRows.ts`, and the cheapest moment to settle it: the
              person has just ticked their scales, which is the same
              question about the journal one step earlier
     lock     whether leaving the app locks it
     checkin  the daily prompt, which is the difference between a journal
              kept and a journal installed

   Six settings, six steps, plus a welcome and a finish. Everything else
   the app has a preference for is either already right by default or is
   something a person goes looking for once they know the app.

   The settled shape (phase 10 redesign ticket 29, DIRECTION.md rule 12) is
   ten steps, and this list becomes it as the tickets that build each step
   land:

     welcome, name, flag, scales, areas, access mode, PIN pad,
     permissions, disguise, done

   `lock` splits into the mode list and the pad (ticket 30); `checkin`
   leaves the flow, its nudge offered by the permissions step's
   notification row and kept in Settings (ticket 31); `disguise` is the
   last question, applied last (ticket 32). */
const ALL_STEPS: readonly OnboardingStep[] = [
  'welcome',
  'name',
  'flag',
  'scales',
  'areas',
  'lock',
  'checkin',
  'done'
];

/** The flow. One list for everybody: setup does not vary by disguise
    (ADR-0079). This used to take a `disguised` flag and drop the flag step
    under it, guarding a state no person can be in - `prefs.disguise` lives
    inside the encrypted journal and is only settable from Settings, which
    sits behind `prefs.onboarded`, so the only way to reach setup disguised
    is the demo's own first-run control. Disguise is now the last question
    setup asks (ticket 32) rather than a state it has to survive, and
    ADR-0035 is untouched: nothing identifying draws while disguise is on,
    and by the time it can be on, setup is over. */
export function onboardingSteps(): readonly OnboardingStep[] {
  return ALL_STEPS;
}

export function stepIndex(steps: readonly OnboardingStep[], step: OnboardingStep): number {
  return steps.indexOf(step);
}

/** The next step, or this one at the end. Clamping rather than wrapping:
    the finish is where the flow stops, and there is nothing after it. */
export function stepAfter(
  steps: readonly OnboardingStep[],
  step: OnboardingStep
): OnboardingStep {
  return steps[Math.min(stepIndex(steps, step) + 1, steps.length - 1)];
}

export function stepBefore(
  steps: readonly OnboardingStep[],
  step: OnboardingStep
): OnboardingStep {
  return steps[Math.max(stepIndex(steps, step) - 1, 0)];
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
    and the next thing they should see is the thing itself (F16).

    It used to have an exception. App lock was a choice made here and a pair
    of four-digit entries made on a separate screen, so a toggle left on sent
    the new user there instead of Home. Ticket 53 retired that gate - a PIN is
    an access mode now, chosen in the security module - so there is nothing
    left for this to route around, and ticket 54 puts the module itself into
    the flow rather than after it. */
export function onboardingDestination(): string {
  return '/';
}

/** How small the sun starts. Large enough to be plainly the flag from the
    first frame, small enough that the growth over the flow is the thing
    being watched rather than a detail. Raised from 0.28 after looking at
    the welcome step: at 0.28 the first sun is a 49px sliver in the corner
    of an otherwise empty screen, which reads as a stray graphic rather than
    as something that is about to grow. */
const SUN_START = 0.42;

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
