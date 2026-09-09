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

import { PORTABLE_KEYS, type PreferenceKey } from '../data/prefs/catalogue';

/** In order. The route renders one of these at a time and nothing else.

    `restore` is not in the ordinary flow and never appears in it: it is the
    one step a person reaches by saying on the welcome that they already have
    a journal (ticket 36), and the flow it belongs to is `restoreSteps()`. */
export type OnboardingStep =
  | 'welcome'
  | 'restore'
  | 'name'
  | 'flag'
  | 'scales'
  | 'areas'
  | 'lock'
  | 'permissions'
  | 'disguise'
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
     permissions
              everything the app can ask this device for, with a reason
              each and a button each (phase 10 redesign ticket 31). Not a
              preference: the answers live in the OS, so this is the one
              step that settles nothing of the app's own. It is here
              because for an app whose claim is that nothing leaves the
              device, the list of what it can reach is the claim made
              concrete, and because saying it once beats four inline
              explanations nobody sees together.
     disguise whether the app wears a different name and icon outside
              itself (phase 10 redesign ticket 32, ADR-0079) - the one
              privacy control nobody can discover before they need it,
              because everything it changes is in the launcher, the tab
              strip and the home screen rather than on any screen the app
              draws

   Five settings, one list and one last question, plus a welcome and a
   finish. Everything else the app has a preference for is either already
   right by default or is something a person goes looking for once they
   know the app.

   The settled shape (phase 10 redesign ticket 29, DIRECTION.md rule 12) is
   ten steps, and this list becomes it as the tickets that build each step
   land:

     welcome, name, flag, scales, areas, access mode, PIN pad,
     permissions, disguise, done

   `lock` is the one step left to split, into the mode list and the pad
   (ticket 30). What ticket 31 landed: `checkin` left the flow and
   `permissions` took its place. The daily nudge is not asked for in setup
   any more - the notification row's reason line is what names it, and the
   switch itself stays on the reminders screen, where skipping the step
   leaves it exactly as it was.

   What ticket 32 landed: `disguise`, after the permissions and before the
   finish. It sits there for a mechanical reason rather than a rhetorical
   one - turning it on swaps the Android launcher alias, which closes the
   app, and the flow holds every answer in memory until `complete()` writes
   them. A disguise switch anywhere earlier would take the rest of setup
   down with it. Last question, applied last. */
const ALL_STEPS: readonly OnboardingStep[] = [
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

/** What each step settles, named as the preferences it writes.

    Written down because ticket 36 needs to answer "does the archive already
    know this?" per step, and the honest way to answer it is to say what the
    step stores and ask the portable set (ADR-0003). The alternative was a
    second list of steps to skip after a restore, which would be a copy of
    this one kept by hand and wrong the first time a preference moved between
    PORTABLE_KEYS and DEVICE_LOCAL_KEYS.

    The welcome, the restore step and the finish store nothing, so they are
    empty rather than absent: `stepAnswers` has to be total, or a step added
    later is unclassified rather than a compile error.

    `lock` is listed by the one preference it stores. The access mode itself
    is not a preference at all - it is a keystore made on this device - which
    is the deeper reason that step survives a restore, and `lockOnLeave`
    being device-local says the same thing in the shape this map can check. */
const STEP_ANSWERS: Record<OnboardingStep, readonly PreferenceKey[]> = {
  welcome: [],
  restore: [],
  name: ['name'],
  flag: ['palette'],
  scales: ['activeScales'],
  areas: ['onboardingAreas'],
  lock: ['lockOnLeave'],
  /* Nothing, and not because it was forgotten: the permissions step's
     answers live in the OS rather than in a preference (ticket 31), so
     there is nothing here for an archive to have carried. That is the same
     reason it survives a restore - device state is not journal state. */
  permissions: [],
  /* `disguise` is a preference, and a device-local one (ticket 32,
     ADR-0079): what a person is hiding on this phone is not a fact about
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
    journal (ticket 36).

    Everything the archive answers is dropped, because asking and then
    overwriting the answer a moment later is the behaviour this ticket exists
    to remove. What is left is the welcome, the restore itself, and the steps
    that are about this device rather than about the journal: the access mode
    above all, since an archive password is not an access mode (ADR-0041) and
    the key has to be made here. The permissions step joined it when ticket
    31 landed, on this same test and with no edit needed: it stores no
    preference, so it can never qualify as carried. Disguise will join it the
    same way when ticket 32 lands - device state is not journal state. */
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
