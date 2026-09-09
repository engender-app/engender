import { describe, expect, it } from 'vitest';

import { chromelessPath } from './chromeless.ts';

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
