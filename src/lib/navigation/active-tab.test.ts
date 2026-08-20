/* Ticket 09 characterization: pins the mapping that already worked (home,
   calendar, stats, settings) so the refactor to a table only changes the
   seven routes that lit no tab at all. */
import { describe, expect, it } from 'vitest';

import { activeTabKey } from './active-tab.ts';

describe('activeTabKey', () => {
  it('lights home for the root path', () => {
    expect(activeTabKey('/')).toBe('home');
  });

  it('lights calendar for calendar, day and search', () => {
    expect(activeTabKey('/calendar')).toBe('calendar');
    expect(activeTabKey('/day/12345')).toBe('calendar');
    expect(activeTabKey('/search')).toBe('calendar');
  });

  it('lights stats for stats, recap, timeline and wrapped', () => {
    expect(activeTabKey('/stats')).toBe('stats');
    expect(activeTabKey('/recap')).toBe('stats');
    expect(activeTabKey('/timeline')).toBe('stats');
    expect(activeTabKey('/wrapped')).toBe('stats');
  });

  it('lights settings for settings and more', () => {
    expect(activeTabKey('/settings')).toBe('settings');
    expect(activeTabKey('/settings/regimen')).toBe('settings');
    expect(activeTabKey('/more')).toBe('settings');
  });

  it('lights stats for the body map, comparison view, tally and on-this-day', () => {
    expect(activeTabKey('/body-map')).toBe('stats');
    expect(activeTabKey('/compare')).toBe('stats');
    expect(activeTabKey('/tally')).toBe('stats');
    expect(activeTabKey('/on-this-day')).toBe('stats');
  });

  it('lights settings for doses, even though its route sits outside /settings', () => {
    expect(activeTabKey('/doses')).toBe('settings');
  });

  it('lights home for the doubt journal', () => {
    expect(activeTabKey('/doubt')).toBe('home');
  });

  it('lights calendar for an open entry', () => {
    expect(activeTabKey('/entry/123')).toBe('calendar');
    expect(activeTabKey('/entry/new/12345')).toBe('calendar');
  });

  it('lights no tab for a route it does not recognize', () => {
    expect(activeTabKey('/onboarding')).toBe('');
  });
});
