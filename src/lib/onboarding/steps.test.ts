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

const ONBOARDING_STEPS = onboardingSteps(false);

describe('the step list', () => {
  it('opens on the welcome and ends on the finish', () => {
    expect(ONBOARDING_STEPS[0]).toBe('welcome');
    expect(ONBOARDING_STEPS.at(-1)).toBe('done');
  });

  it('names every step once', () => {
    expect(new Set(ONBOARDING_STEPS).size).toBe(ONBOARDING_STEPS.length);
  });

  it('sets the four things a first run has to settle, in that order', () => {
    expect(ONBOARDING_STEPS).toEqual([
      'welcome',
      'name',
      'flag',
      'scales',
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
  /* Ticket 26: nothing identifies the app on any of these screens while
     disguise is on. The flag step draws eight pride flags and names them,
     which is a stronger tell than the sun ADR-0035 already gates - so it
     leaves the flow rather than being hidden inside it, and the walk either
     side of it closes up with no gap to explain. */
  const disguised = onboardingSteps(true);

  it('drops the flag step entirely', () => {
    expect(disguised).not.toContain('flag');
    expect(disguised).toEqual(['welcome', 'name', 'scales', 'lock', 'checkin', 'done']);
  });

  it('keeps every other step, in the same order', () => {
    expect(disguised).toEqual(ONBOARDING_STEPS.filter((step) => step !== 'flag'));
  });

  it('walks straight from the name to the scales, with nothing in between', () => {
    expect(stepAfter(disguised, 'name')).toBe('scales');
    expect(stepBefore(disguised, 'scales')).toBe('name');
  });

  it('still ends on a full sun, one step earlier', () => {
    expect(sunGrowth(disguised.length - 1, disguised.length)).toBe(1);
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
      'lock',
      'checkin'
    ]);
  });
});

describe('where the flow lands', () => {
  it('sends a new person Home, not into Settings', () => {
    expect(onboardingDestination(false)).toBe('/');
  });

  it('sends someone who asked for a PIN to set one, and Home after that', () => {
    expect(onboardingDestination(true)).toBe('/settings/lock?setup=1&next=/');
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
