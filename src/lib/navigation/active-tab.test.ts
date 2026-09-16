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

  it('lights stats for stats, timeline and every wrapped view', () => {
    expect(activeTabKey('/stats')).toBe('stats');
    expect(activeTabKey('/timeline')).toBe('stats');
    expect(activeTabKey('/wrapped')).toBe('stats');
    /* The arbitrary range recap used to own is a wrapped now (phase 5 UX
       ticket 23, spec 07), so the tab it lights comes from the /wrapped
       prefix rather than from a prefix of the deleted route's own. */
    expect(activeTabKey('/wrapped/range')).toBe('stats');
    expect(activeTabKey('/wrapped/month')).toBe('stats');
  });

  /* The route is gone. Nothing links to it, but a saved link or an old
     notification can still open one, and a URL that matches no tab lights
     none at all - which is the SH-001 regression this table exists to
     stop. What it must do is fall back the way any unknown route does. */
  it('leaves the deleted recap route to the fallback, like any unknown URL', () => {
    expect(activeTabKey('/recap')).toBe(activeTabKey('/nothing-here'));
  });

  it('lights more, but borrows its origin for settings chrome (audit item 4)', () => {
    expect(activeTabKey('/more')).toBe('settings');
    /* Settings is chrome (ADR-0076), reached from a persistent gear rather
       than a tab of its own - lighting the fourth tab for it read as
       having left whichever tab the gear was pressed from. With nothing
       to borrow it lights none, and with an origin it borrows exactly
       that, whatever it is - the caller (chrome-tab-origin.ts) decides
       which tab counts as "came from", not this table. */
    expect(activeTabKey('/settings')).toBe('');
    expect(activeTabKey('/settings/security')).toBe('');
    expect(activeTabKey('/settings', 'home')).toBe('home');
    expect(activeTabKey('/settings/access-mode', 'calendar')).toBe('calendar');
  });

  it('lights stats for the word ignore list, wherever the URL that reaches it moved from', () => {
    // /settings/words redirects here (ADR-0036); it configures Look back's
    // own reading (ticket 62), not a fourth-door area, so it is carved out
    // ahead of the general /transition prefix and takes no chrome origin.
    expect(activeTabKey('/transition/words')).toBe('stats');
    expect(activeTabKey('/transition/words', 'settings')).toBe('stats');
  });

  it('lights stats for the body map, comparison view, tally and on-this-day', () => {
    expect(activeTabKey('/body-map')).toBe('stats');
    expect(activeTabKey('/compare')).toBe('stats');
    expect(activeTabKey('/tally')).toBe('stats');
    expect(activeTabKey('/on-this-day')).toBe('stats');
  });

  it('lights settings for the care overview, the health group\'s own row', () => {
    expect(activeTabKey('/care')).toBe('settings');
  });

  it('lights settings for doses, even though its route sits outside /settings', () => {
    expect(activeTabKey('/doses')).toBe('settings');
  });

  /* Features ticket 33: the 23 hub-row screens moved off /settings/<slug>
     onto their own HubGroupKey-named address, and the tab still has to
     light for all of them - one case per new prefix, not per moved route,
     since the table matches on prefix rather than on the full path. */
  it('lights settings for every group the hub rows moved onto', () => {
    expect(activeTabKey('/body/measurements')).toBe('settings');
    expect(activeTabKey('/health/surgery')).toBe('settings');
    expect(activeTabKey('/transition/milestones')).toBe('settings');
    expect(activeTabKey('/practice/voice')).toBe('settings');
    expect(activeTabKey('/media/photos')).toBe('settings');
  });

  it('lights home for the doubt journal', () => {
    expect(activeTabKey('/doubt')).toBe('home');
  });

  it('lights home for the return surface', () => {
    expect(activeTabKey('/coming-back')).toBe('home');
  });

  it('lights calendar for an open entry', () => {
    expect(activeTabKey('/entry/123')).toBe('calendar');
    expect(activeTabKey('/entry/new/12345')).toBe('calendar');
  });

  it('lights no tab for a route it does not recognize', () => {
    expect(activeTabKey('/onboarding')).toBe('');
  });
});
