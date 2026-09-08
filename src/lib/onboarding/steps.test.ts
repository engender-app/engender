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
