import { describe, expect, it } from 'vitest';

import { PORTABLE_KEYS } from '../data/prefs/catalogue';
import {
  archiveAnswers,
  isSkippable,
  onboardingDestination,
  onboardingSteps,
  restoreSteps,
  stepAfter,
  stepAnswers,
  stepBefore,
  stepIndex,
  sunGrowth
} from './steps';

const ONBOARDING_STEPS = onboardingSteps();

describe('the step list', () => {
  it('opens on the welcome and ends on the finish', () => {
    expect(ONBOARDING_STEPS[0]).toBe('welcome');
    expect(ONBOARDING_STEPS.at(-1)).toBe('done');
  });

  it('names every step once', () => {
    expect(new Set(ONBOARDING_STEPS).size).toBe(ONBOARDING_STEPS.length);
  });

  it('sets the five things a first run has to settle, in that order', () => {
    expect(ONBOARDING_STEPS).toEqual([
      'welcome',
      'name',
      'flag',
      'scales',
      'areas',
      'lock',
      'checkin',
      'done'
    ]);
  });

  it('walks forward and back, and stops at both ends', () => {
    const steps = ONBOARDING_STEPS;
    expect(stepAfter(steps, 'welcome')).toBe('name');
    expect(stepBefore(steps, 'name')).toBe('welcome');
    expect(stepAfter(steps, 'done')).toBe('done');
    expect(stepBefore(steps, 'welcome')).toBe('welcome');
  });

  it('indexes each step by its place in the list', () => {
    ONBOARDING_STEPS.forEach((step, i) => expect(stepIndex(ONBOARDING_STEPS, step)).toBe(i));
  });
});

describe('under disguise', () => {
  /* ADR-0079: setup does not vary by disguise. The flag step used to leave
     the flow under it, which guarded a state no real install can reach and
     kept a second flow alive that nothing rendered or tested. One list,
     whatever the preference says, and the flag step is in it. */
  it('is the same flow, and takes nothing that could make it differ', () => {
    expect(onboardingSteps.length).toBe(0);
    expect(onboardingSteps()).toEqual(ONBOARDING_STEPS);
    expect(onboardingSteps()).toContain('flag');
  });
});

describe('skipping', () => {
  /* The user's rule for this ticket: every step is skippable. A step that
     sets a preference gets its own Skip, because skipping it has to mean
     "leave the stored default alone" rather than "store nothing". The two
     that set nothing have no preference to leave alone - the welcome's
     primary button already is its skip, and the finish is where the flow
     ends rather than a step to get past. Both still carry the leave-now
     action, which is the other half of the rule. */
  it('offers a skip on every step that sets something', () => {
    expect(ONBOARDING_STEPS.filter(isSkippable)).toEqual([
      'name',
      'flag',
      'scales',
      'areas',
      'lock',
      'checkin'
    ]);
  });
});

describe('where the flow lands', () => {
  /* One destination now. The PIN detour this used to have belonged to the
     app-lock gate ticket 53 retired: how the journal opens is chosen in the
     security module, not by a toggle here. */
  it('sends a new person Home, not into Settings', () => {
    expect(onboardingDestination()).toBe('/');
  });
});

describe('the sun growing through the flow', () => {
  const total = ONBOARDING_STEPS.length;

  it('starts as a fraction of the sun rather than most of one', () => {
    /* A bound, not the number. Where exactly it starts is a taste call that
       an eye settles on the welcome step and steps.ts records; what has to
       hold is that there is visibly a sun and visibly room left for it to
       grow into, or the growth is not the thing anyone sees. */
    expect(sunGrowth(0, total)).toBeGreaterThan(0);
    expect(sunGrowth(0, total)).toBeLessThan(0.6);
  });

  it('lands at exactly the resting sun Home draws a moment later', () => {
    expect(sunGrowth(total - 1, total)).toBe(1);
  });

  it('grows on every step and never shrinks', () => {
    for (let i = 1; i < total; i++) {
      expect(sunGrowth(i, total), `step ${i}`).toBeGreaterThan(sunGrowth(i - 1, total));
    }
  });

  it('clamps rather than overshooting when it is asked for a step off either end', () => {
    expect(sunGrowth(-3, total)).toBe(sunGrowth(0, total));
    expect(sunGrowth(total + 3, total)).toBe(1);
  });

  it('still lands at 1 if the step list ever changes length', () => {
    for (const n of [2, 4, 9]) expect(sunGrowth(n - 1, n), `${n} steps`).toBe(1);
  });

  it('never divides by zero on a one-step flow', () => {
    expect(sunGrowth(0, 1)).toBe(1);
  });
});

describe('a first run that restores an archive', () => {
  /* The failure directions first, because this is the ticket where a wrong
     answer loses somebody's journal (ticket 36).

     Two ways to be wrong, and they are not symmetrical. Asking again for
     something the archive carries is the annoyance this ticket exists to
     remove: the answer is overwritten a moment later anyway. Dropping a step
     the archive does *not* carry is the one that breaks the install - the
     access mode above all, since an archive password is not an access mode
     (ADR-0041) and a journal with no key on this device does not open. */
  const RESTORED = restoreSteps();

  it('never drops a step whose answer the archive does not carry', () => {
    for (const step of onboardingSteps()) {
      if (!archiveAnswers(step)) expect(RESTORED, step).toContain(step);
    }
  });

  it('keeps the access mode step, which an archive password is not', () => {
    expect(archiveAnswers('lock')).toBe(false);
    expect(RESTORED).toContain('lock');
  });

  it('reads what the archive carries off the portable set rather than a second list', () => {
    /* The one guard against drift. `applyPortablePreferences` walks
       PORTABLE_KEYS and nothing else, so a key that leaves that list stops
       travelling - and its step has to start asking again the same day,
       not whenever somebody notices. */
    for (const step of onboardingSteps()) {
      const answers = stepAnswers(step);
      const carried =
        answers.length > 0 &&
        answers.every((key) => (PORTABLE_KEYS as readonly string[]).includes(key));
      expect(archiveAnswers(step), step).toBe(carried);
    }
  });

  it('classifies every step, so one added later cannot be silently unclassified', () => {
    for (const step of [...onboardingSteps(), ...RESTORED]) {
      expect(Array.isArray(stepAnswers(step)), step).toBe(true);
    }
  });

  it('asks nothing the archive answers', () => {
    for (const step of RESTORED) expect(archiveAnswers(step), step).toBe(false);
  });

  it('opens on the welcome, offers the restore, and ends on the finish', () => {
    expect(RESTORED).toEqual(['welcome', 'restore', 'lock', 'done']);
  });

  it('has no skip on the restore step: it is the reason this flow was entered', () => {
    expect(isSkippable('restore')).toBe(false);
  });

  it('grows the same sun over its own shorter flow, arriving at 1', () => {
    expect(sunGrowth(0, RESTORED.length)).toBe(sunGrowth(0, onboardingSteps().length));
    expect(sunGrowth(RESTORED.length - 1, RESTORED.length)).toBe(1);
  });

  it('walks forward and back over its own list', () => {
    expect(stepAfter(RESTORED, 'welcome')).toBe('restore');
    expect(stepBefore(RESTORED, 'lock')).toBe('restore');
    expect(stepAfter(RESTORED, 'restore')).toBe('lock');
  });
});
