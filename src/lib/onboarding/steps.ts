/* The shape of the first run, as data rather than as a number compared
   against in seven places.

   The flow used to be `let step = $state(0)` and `{#if step === 2}`, which
   meant the order, the count, the progress label and the back button each
   knew the sequence separately and had to be edited together. Naming the
   steps makes the sequence one list, and it makes the two rules the user
   set for this ticket - every step is skippable, every step can be left -
   things a test can check rather than things to remember per branch.

   Deliberately rune-free and DOM-free, so it runs in the Node tier next to
   the rest of the pure model (ADR-0017). */

import { PORTABLE_KEYS, type PreferenceKey } from '../data/prefs/catalogue';

/** In order. The route renders one of these at a time and nothing else.

    `restore` is not in the ordinary flow and never appears in it: it is the
    one step a person reaches by saying on the welcome that they already have
    a journal, and the flow it belongs to is `restoreSteps()`. */
export type OnboardingStep =
  | 'welcome'
  | 'restore'
  | 'name'
  | 'flag'
  | 'scales'
  | 'features'
  | 'lock'
  | 'permissions'
  | 'disguise'
  | 'done';

/* Setup picks the greeting, flag, scales, optional screens and lock.
   Permissions show what the OS lets the app access. The daily reminder
   stays on the reminders screen.

   Disguise changes what appears outside the app (ADR-0079). Keep it last
   because enabling it on Android swaps the launcher alias and closes the
   app. complete() must persist the setup answers before the flip. */
const ALL_STEPS: readonly OnboardingStep[] = [
  'welcome',
  'name',
  'flag',
  'scales',
  'features',
  'lock',
  'permissions',
  'disguise',
  'done'
];

/** The flow. One list for everybody: setup does not vary by disguise
    (ADR-0079). This used to take a `disguised` flag and drop the flag step
    under it, guarding a state no person can be in - `prefs.disguise` lives
    inside the encrypted journal and is only settable from Settings, which
    sits behind `prefs.onboarded`, so the only way to reach setup disguised
    is the demo's own first-run control. Disguise is now the last question
    setup asks rather than a state it has to survive. The
    disguise choice affects outside identity after setup, not the unlocked
    app. */
export function onboardingSteps(): readonly OnboardingStep[] {
  return ALL_STEPS;
}

/** Map every setup step to its stored preferences. Restore checks
    those keys against the portable set (ADR-0003), and complete
    coverage makes new steps a compile-time decision. Welcome, restore
    and finish store nothing. Lock stores device-local lockAfter and
    still runs after restore because its keystore is device-bound. */
const STEP_ANSWERS: Record<OnboardingStep, readonly PreferenceKey[]> = {
  welcome: [],
  restore: [],
  name: ['name'],
  flag: ['palette'],
  scales: ['activeScales'],
  /* The one preference it writes. Its other two answers are journal rows
     (the genital-effects category), and
     those travel in an archive with the rest of the journal, so a restore
     already answers this step whole. */
  features: ['cycleTrackingChoice'],
  lock: ['lockAfter'],
  /* Nothing, and not because it was forgotten: the permissions step's
     answers live in the OS rather than in a preference, so
     there is nothing here for an archive to have carried. That is the same
     reason it survives a restore - device state is not journal state. */
  permissions: [],
  /* `disguise` is a preference, and a device-local one (ADR-0079): what a person is hiding on this phone is not a fact about
     their journal, so it does not travel and this step runs after a restore
     like any other. Listed rather than left empty, because the honest entry
     is the key it writes - if `disguise` ever became portable this map is
     where that would show up, and the step would stop being asked. */
  disguise: ['disguise'],
  done: []
};

export function stepAnswers(step: OnboardingStep): readonly PreferenceKey[] {
  return STEP_ANSWERS[step];
}

/** Whether a restored archive already holds everything this step asks for.

    A step qualifies when it stores something and every last thing it stores
    travels. Partly-portable would be the dangerous case - half the answer
    restored and half of it left at the default, with nothing on screen to
    say so - so it counts as not carried and the step runs. Nothing is
    partly-portable today; this is what keeps that true. */
export function archiveAnswers(step: OnboardingStep): boolean {
  const answers = stepAnswers(step);
  return (
    answers.length > 0 && answers.every((key) => (PORTABLE_KEYS as readonly string[]).includes(key))
  );
}

/** The flow for somebody who said on the welcome that they already have a
    journal.

    Everything the archive answers is dropped, because asking and then
    overwriting the answer a moment later is the behaviour this ticket exists
    to remove. What is left is the welcome, the restore itself, and the steps
    that are about this device rather than about the journal: the access mode
    above all, since an archive password is not an access mode (ADR-0041) and
    the key has to be made here. The permissions step joined it when ticket
    31 landed, on this same test and with no edit needed: it stores no
    preference, so it can never qualify as carried. Disguise joined it the
    same way when ticket 32 landed - device state is not journal state. */
export function restoreSteps(): readonly OnboardingStep[] {
  const rest = ALL_STEPS.filter((step) => step !== 'welcome' && !archiveAnswers(step));
  return ['welcome', 'restore', ...rest];
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
    leave-now action, which every step has.

    The restore step has none either, and for a third reason: it stores no
    preference, and skipping past the thing the person came here to do would
    leave them mid-setup with the journal still missing. Its way out is back
    to the welcome as a new person, which is the leave-now control every step
    already carries doing what it always does. */
export function isSkippable(step: OnboardingStep): boolean {
  return step !== 'welcome' && step !== 'restore' && step !== 'done';
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

/** Grow the sun each step, reaching scale 1 at the handover to Home.
    Scale keeps the flag's full stripe count visible on every palette. */
export function sunGrowth(index: number, total: number): number {
  if (total <= 1) return 1;
  const progress = Math.min(Math.max(index, 0), total - 1) / (total - 1);
  return SUN_START + (1 - SUN_START) * progress;
}

/** The welcome's sun, as a multiple of Home's resting one. The welcome is
    the first screen anyone sees, so the mark is drawn there as the hero of
    a field most of a phone tall, and "Set up the app" collapses that field
    into the first question with the sun shrinking to the first step's size.
    Large enough that the quarter fills the
    corner of a 412px phone (175px x 1.6 = 280px of reach) and leaves the
    wordmark the bottom of the field. */
export const WELCOME_SUN = 1.6;

/** The sun's scale on `step`: the welcome's hero, then the growth above. */
export function stepSun(step: OnboardingStep, steps: readonly OnboardingStep[]): number {
  return step === 'welcome' ? WELCOME_SUN : sunGrowth(stepIndex(steps, step), steps.length);
}
