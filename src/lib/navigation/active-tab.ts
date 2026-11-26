/* Ticket 09: six routes matched no prefix here at all, so no tab lit for
   them - the body map, the comparison view, doses, the doubt journal, an
   open entry, and on-this-day. A table keyed by tab, rather
   than a chain of `path.startsWith` branches, keeps adding a route to one
   place: append the prefix to the array for the tab it belongs to. */

type TabRoute = { key: string; prefixes: string[] };

const TAB_ROUTES: TabRoute[] = [
  /* Doubt is reached from a persistent Home affordance, deliberately apart
     from the normal entry flow (CONTEXT: "Doubt entry") - it stays with
     Home rather than joining Calendar's entries. Coming-back joins it for
     the same reason: the layout opens it on arriving at Home and links it
     from nowhere else (ADR-0062, ADR-0045). */
  { key: 'home', prefixes: ['/doubt', '/coming-back'] },
  { key: 'calendar', prefixes: ['/calendar', '/day', '/search', '/entry'] },
  /* SH-001: a look-back view used to light no tab at all, which read as
     having left the app's structure. They group with Stats rather than
     getting IA a new tab. A wrapped joins that group even though Home is
     where it is offered from. Body map and compare are the same
     kind of look-back, linked from Stats' own list. On-this-day joins for
     the same reason as wrapped - it too is offered from Home
     (OnThisDayHomeCard) rather than from Stats.

     The former rail route was removed when the rail joined milestones. */
  {
    key: 'stats',
    prefixes: [
      '/stats',
      '/wrapped',
      '/body-map',
      '/compare',
      '/on-this-day'
    ]
  },
  /* The More groups and the voice screen light the fourth tab. Settings
     itself remains chrome and borrows its origin below. */
  {
    key: 'settings',
    prefixes: [
      '/more',
      '/care',
      '/body',
      '/health',
      '/transition',
      '/support',
      '/voice',
      '/media'
    ]
  }
];

/* Settings is chrome (ADR-0076): reached from Today's gear, not a tab of
   its own. Every path under /settings, the hub and each subpage alike,
   lights the tab that was lit before it was opened, which the caller
   carries in `chromeOrigin` (chrome-tab-origin.ts) so this function stays
   pure. Opened cold, with nothing to borrow, it lights Today: the gear lives
   in Today's foot and the hub's back arrow goes there.

   The body map sits in Look back's group above, apart from the /body/*
   screens in the fourth door's, by the same rule the rest of this table
   follows: a screen lights the door it is reached from. The body map is
   one of Look back's readings (BodyMapTile on /stats), its back arrow goes
   to /stats, and nothing in the fourth door links to it. Lighting the
   fourth door there would move the tab under the person on every visit. */
const CHROME_PREFIX = '/settings';
const CHROME_FALLBACK = 'home';

export function activeTabKey(path: string, chromeOrigin = ''): string {
  if (path === '/') return 'home';
  if (path.startsWith(CHROME_PREFIX)) return chromeOrigin || CHROME_FALLBACK;
  return TAB_ROUTES.find((route) => route.prefixes.some((prefix) => path.startsWith(prefix)))?.key ?? '';
}

/* What the tab bar and the rail light, which is not quite the table above
   (after-release 17, UX-18). The entry editor is opened from every door -
   a mood on Today, a day in Journal, a reading in Look back, a milestone
   in Transition - and lighting Journal for all of them moved the tab under
   the person each time. It borrows the door it was opened from, the way
   settings chrome does, and Journal only when opened cold. Screen
   transitions keep reading activeTabKey, whose /entry answer the container
   transform and the Home fade are built around. */
const BORROWING_PREFIXES = ['/entry'];
const BORROWING_FALLBACK = 'calendar';

export function litTabKey(path: string, origin = ''): string {
  if (BORROWING_PREFIXES.some((prefix) => path.startsWith(prefix))) return origin || BORROWING_FALLBACK;
  return activeTabKey(path, origin);
}

/** Whether a path lights a tab it borrows rather than one of its own. */
export function borrowsTab(path: string): boolean {
  return path.startsWith(CHROME_PREFIX) || BORROWING_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** The rail's own key for its Settings row. */
export const RAIL_SETTINGS = 'rail-settings';

/* The rail has room for a Settings row the bar does not (ADR-0076 keeps it
   chrome on the bar), so on every /settings route the rail lights that row
   and borrows nothing (after-release 17, L04-07). */
export function railTabKey(path: string, origin = ''): string {
  if (path.startsWith(CHROME_PREFIX)) return RAIL_SETTINGS;
  return litTabKey(path, origin);
}
