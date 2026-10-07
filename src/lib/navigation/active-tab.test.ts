/* Ticket 09 characterization: pins the mapping that already worked (home,
   calendar, stats, settings) so the refactor to a table only changes the
   seven routes that lit no tab at all. */
import { describe, expect, it } from 'vitest';

import { activeTabKey, borrowsTab, litTabKey, RAIL_SETTINGS, railTabKey } from './active-tab.ts';

describe('activeTabKey', () => {
  it('lights home for the root path', () => {
    expect(activeTabKey('/')).toBe('home');
  });

  it('lights calendar for calendar, day and search', () => {
    expect(activeTabKey('/calendar')).toBe('calendar');
    expect(activeTabKey('/day/12345')).toBe('calendar');
    expect(activeTabKey('/search')).toBe('calendar');
  });

  it('lights stats for stats and every wrapped view', () => {
    expect(activeTabKey('/stats')).toBe('stats');
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

  /* Redesign ticket 43: /timeline is a redirect to /transition/milestones
     now, and the two have to light the same tab. They did not - the rail
     was Look back's and the list is the Transition door's - so a person
     opening an old link would have watched the tab indicator travel from
     Look back to Transition while the redirect landed. The old address
     keeps working and lights where it now leads. */
  it('lights the same tab for the old timeline address as for the screen it redirects to', () => {
    expect(activeTabKey('/timeline')).toBe('settings');
    expect(activeTabKey('/timeline')).toBe(activeTabKey('/transition/milestones'));
  });

  it('lights more, but borrows its origin for settings chrome (audit item 4)', () => {
    expect(activeTabKey('/more')).toBe('settings');
    expect(activeTabKey('/care/regimen')).toBe('settings');
    /* Settings is chrome (ADR-0076), reached from a persistent gear rather
       than a tab of its own - lighting the fourth tab for it read as
       having left whichever tab the gear was pressed from. With nothing
       to borrow (a cold load) it lights Today, where the gear lives, and
       with an origin it borrows exactly
       that, whatever it is - the caller (chrome-tab-origin.ts) decides
       which tab counts as "came from", not this table. */
    expect(activeTabKey('/settings')).toBe('home');
    expect(activeTabKey('/settings/security')).toBe('home');
    expect(activeTabKey('/settings', 'home')).toBe('home');
    expect(activeTabKey('/settings/access-mode', 'calendar')).toBe('calendar');
  });

  /* Phase 14 ticket 15 (V14): every screen under /settings follows the
     chrome rule above, with no exceptions. Eras lit the fourth door and the
     ignore list lit Look back whatever the person had come from, while
     tags and affirmations borrowed - four subpages of one hub answering
     three different ways. Each of them now lights the tab the gear (or the
     link) was pressed from, and Today on a cold load, like the hub. */
  it('lets every settings subpage borrow its origin, eras and the ignore list included', () => {
    for (const path of ['/settings/eras', '/settings/words', '/settings/tags', '/settings/affirmations', '/settings/trash']) {
      expect(activeTabKey(path, 'calendar'), path).toBe('calendar');
      expect(activeTabKey(path, 'stats'), path).toBe('stats');
      expect(activeTabKey(path), path).toBe('home');
    }
  });

  /* The body map is a Look back reading (BodyMapTile on /stats, and its
     header's back is /stats), so it lights Look back like the other
     readings rather than the fourth door the /body/* screens belong to. */
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
    expect(activeTabKey('/care/doses')).toBe('settings');
    expect(activeTabKey('/care/labs')).toBe('settings');
    expect(activeTabKey('/care/curve')).toBe('settings');
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

  /* All-four-doors ticket 21: the retired Practice prefix's own screens
     moved to addresses that say which door group holds them, and the tab
     they light is unchanged - `/voice` alone got no door prefix. */
  it('lights settings for every address the retired Practice prefix left behind', () => {
    expect(activeTabKey('/care/changes')).toBe('settings');
    expect(activeTabKey('/body/wear')).toBe('settings');
    expect(activeTabKey('/support/resources')).toBe('settings');
    expect(activeTabKey('/voice')).toBe('settings');
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

/* After-release 17 (UX-18): the editor is reached from every door, and the
   tab bar used to answer Journal whichever one it was. What the bar lights
   now borrows the door the editor was opened from; the table above, which
   screen transitions read, keeps calendar for /entry. */
describe('litTabKey', () => {
  it('lets an open entry borrow the tab it was opened from', () => {
    expect(litTabKey('/entry/new/20000', 'home')).toBe('home');
    expect(litTabKey('/entry/41', 'stats')).toBe('stats');
    expect(litTabKey('/entry/41', 'calendar')).toBe('calendar');
  });

  it('falls back to Journal for an entry opened cold', () => {
    expect(litTabKey('/entry/41')).toBe('calendar');
  });

  it('answers like activeTabKey everywhere else', () => {
    for (const path of ['/', '/calendar', '/stats', '/more', '/settings/eras', '/tally', '/onboarding']) {
      expect(litTabKey(path, 'stats'), path).toBe(activeTabKey(path, 'stats'));
    }
  });
});

/* After-release 17 (L04-07, UI-07): the desktop rail has a Settings row of
   its own, so on every /settings route the rail lights that row rather
   than borrowing a door, and the doors light nothing. */
describe('railTabKey', () => {
  it('lights the Settings row on the hub and every subpage', () => {
    for (const path of ['/settings', '/settings/permissions', '/settings/reminders/new']) {
      expect(railTabKey(path, 'calendar'), path).toBe(RAIL_SETTINGS);
      expect(railTabKey(path), path).toBe(RAIL_SETTINGS);
    }
  });

  it('lights the same door as the bar off settings', () => {
    expect(railTabKey('/entry/41', 'home')).toBe('home');
    expect(railTabKey('/more', 'home')).toBe('settings');
  });
});

describe('borrowsTab', () => {
  it('names settings chrome and the editor, and nothing else', () => {
    expect(borrowsTab('/settings')).toBe(true);
    expect(borrowsTab('/settings/permissions')).toBe(true);
    expect(borrowsTab('/entry/41')).toBe(true);
    for (const path of ['/', '/calendar', '/stats', '/tally', '/more']) expect(borrowsTab(path), path).toBe(false);
  });
});
