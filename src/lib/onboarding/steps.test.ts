import { describe, expect, it } from 'vitest';

import {
  isSkippable,
  onboardingDestination,
  onboardingSteps,
  stepAfter,
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

  it('sets the five things a first run has to settle, then the list of what the app can ask for, then the last question', () => {
    expect(ONBOARDING_STEPS).toEqual([
      'welcome',
      'name',
      'flag',
      'scales',
      'areas',
      'lock',
      'permissions',
      'disguise',
      'done'
    ]);
  });

  /* Phase 10 redesign ticket 31. The daily check-in stopped being a
     question setup asks: the answers the permissions step collects belong
     to the OS, and the check-in switch stays on the reminders screen where
     it always was. A step list that still named `checkin` would mean the
     route had a branch for a step that no longer draws anything. */
  it('no longer asks about the daily check-in', () => {
    expect(ONBOARDING_STEPS).not.toContain('checkin');
  });

  /* ADR-0079 and ticket 32. Disguise is asked last because turning it on
     closes the app on Android, and setup holds every answer in memory
     until complete() writes them - so anywhere earlier in the flow the
     alias flip would take the rest of setup down with it. The finish still
     follows it: the question is last, the screen that says setup is over
     is not. */
  it('asks about disguise last, with only the finish after it', () => {
    expect(stepAfter(ONBOARDING_STEPS, 'disguise')).toBe('done');
    expect(stepBefore(ONBOARDING_STEPS, 'done')).toBe('disguise');
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
      'permissions',
      'disguise'
    ]);
  });

  /* The permissions step sets nothing of the app's own, so its Skip has
     nothing to protect - and it carries one anyway (ticket 31). Skipping it
     grants nothing and blocks nothing, which is the only honest reading of
     a step whose answers all live in the OS. */
  it('lets the permissions step be skipped like any other', () => {
    expect(isSkippable('permissions')).toBe(true);
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
