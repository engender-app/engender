import { describe, expect, it } from 'vitest';

import { chromelessPath, cutsInsteadOfMoving, replacesAppNavigation } from './chromeless.ts';

describe('the routes that render without chrome', () => {
  it('is onboarding, all of it', () => {
    expect(chromelessPath('/onboarding')).toBe(true);
    expect(chromelessPath('/onboarding/flag')).toBe(true);
  });

  it('is the lock screen, which is where a PIN is set', () => {
    /* /settings/lock was the second chromeless route until ticket 53 retired
       the app-lock gate. Its replacements are rendered by the layout instead
       of the app, so no path produces them. */
    expect(chromelessPath('/settings')).toBe(false);
  });

  it('is not the rest of settings', () => {
    /* A prefix here would take the bar off every settings screen, which
       is the mistake the exact match exists to prevent. */
    expect(chromelessPath('/settings')).toBe(false);
    expect(chromelessPath('/settings/lockdown')).toBe(false);
    expect(chromelessPath('/settings/export')).toBe(false);
  });

  it('is the in-the-room view, which owes its reader one way out (ticket 60)', () => {
    expect(chromelessPath('/health/appointments/in-the-room')).toBe(true);
  });

  it('is not the appointments screen or the prep list the room is a view over', () => {
    /* Exact rather than a prefix, for the same reason /settings is: a
       prefix here would take the bar off the screen the room is reached
       from. */
    expect(chromelessPath('/health/appointments')).toBe(false);
    expect(chromelessPath('/health/appointment-prep')).toBe(false);
  });

  it('is the return moment, which is a step and has nowhere to go (ticket 35)', () => {
    /* DIRECTION.md rule 15: one purpose, no navigation. A tab bar over it
       is four ways off a screen whose foot already carries the one. */
    expect(chromelessPath('/coming-back')).toBe(true);
  });

  it('is not an ordinary screen', () => {
    expect(chromelessPath('/')).toBe(false);
    expect(chromelessPath('/calendar')).toBe(false);
  });
});

describe('the routes that render instead of the app rather than inside it', () => {
  /* A second question about the same routes, and not the same answer. The
     bar is about what the shell paints; this is about whether the app
     navigated somewhere or was replaced - which is what decides between a
     tier-2 movement and an instant cut (screen-transition.ts). */
  it('is onboarding and the room, which are entered instead of a screen', () => {
    expect(replacesAppNavigation('/onboarding')).toBe(true);
    expect(replacesAppNavigation('/onboarding/flag')).toBe(true);
    expect(replacesAppNavigation('/health/appointments/in-the-room')).toBe(true);
  });

  it('is not the return moment, which Home navigates to (ticket 35)', () => {
    /* It has no bar, so it is chromeless; it is still a step the app walks
       to from Home, so it owes the movement every other step gets. Alicja
       on the ticket 35 flipbooks: the empty state arriving had "no
       animation at all, yank between frames 7 and 8" - the yank was this
       predicate answering both questions at once. */
    expect(chromelessPath('/coming-back')).toBe(true);
    expect(replacesAppNavigation('/coming-back')).toBe(false);
  });

  it('is not an ordinary screen', () => {
    expect(replacesAppNavigation('/')).toBe(false);
    expect(replacesAppNavigation('/settings')).toBe(false);
  });
});

describe('which navigations cut instead of moving', () => {
  it('cuts a cold start, which has nothing to come from', () => {
    expect(cutsInsteadOfMoving(null, '/')).toBe(true);
    expect(cutsInsteadOfMoving(null, '/onboarding')).toBe(true);
  });

  it('cuts on the way into setup, where there is no app yet', () => {
    /* The shell redirects here because `prefs.onboarded` is false, so
       nothing was navigated away from - the app had not been drawn. */
    expect(cutsInsteadOfMoving('/', '/onboarding')).toBe(true);
  });

  it('moves on the way out of setup, which is the app opening', () => {
    /* Redesign ticket 33. Somebody pressed "Start writing" and the app
       opened; rule 12 already says the sun's handover to Home is one object
       at one size, and a cut made the app's largest surface change in a
       single frame at the end of ten steps that had all moved. Both doors
       out of setup are the same act and complete() is one function for
       them. */
    expect(cutsInsteadOfMoving('/onboarding', '/')).toBe(false);
    expect(cutsInsteadOfMoving('/onboarding/flag', '/')).toBe(false);
  });

  it('still cuts between two steps of setup, which is not a navigation at all', () => {
    /* A step change is state inside one route (stepBlind.ts moves the edge
       for it), so a navigation between two onboarding paths is the redirect
       finding its way rather than a step being taken. */
    expect(cutsInsteadOfMoving('/onboarding', '/onboarding/flag')).toBe(true);
  });

  it('cuts both ways for the room, whose own ticket asked for one way in', () => {
    expect(cutsInsteadOfMoving('/health/appointments', '/health/appointments/in-the-room')).toBe(
      true
    );
    expect(cutsInsteadOfMoving('/health/appointments/in-the-room', '/health/appointments')).toBe(
      true
    );
  });

  it('moves the return moment both ways (ticket 35)', () => {
    expect(cutsInsteadOfMoving('/', '/coming-back')).toBe(false);
    expect(cutsInsteadOfMoving('/coming-back', '/')).toBe(false);
  });

  it('moves between two ordinary screens', () => {
    expect(cutsInsteadOfMoving('/', '/calendar')).toBe(false);
  });
});
