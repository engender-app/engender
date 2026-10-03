/* Ticket 09: seven routes matched no prefix here at all, so no tab lit for
   them - the body map, the comparison view, doses, the doubt journal, the
   tally screen, an open entry, and on-this-day. A table keyed by tab, rather
   than a chain of `path.startsWith` branches, keeps adding a route to one
   place: append the prefix to the array for the tab it belongs to. */

type TabRoute = { key: string; prefixes: string[] };

const TAB_ROUTES: TabRoute[] = [
  /* Doubt is reached from a persistent Home affordance, deliberately apart
     from the normal entry flow (CONTEXT: "Doubt entry") - it stays with
     Home rather than joining Calendar's entries. Coming-back joins it for
     the same reason: the layout opens it on arriving at Home and links it
     from nowhere else (ticket 10, ADR-0062, ADR-0045). */
  { key: 'home', prefixes: ['/doubt', '/coming-back'] },
  { key: 'calendar', prefixes: ['/calendar', '/day', '/search', '/entry'] },
  /* SH-001: a look-back view used to light no tab at all, which read as
     having left the app's structure. They group with Stats rather than
     getting IA a new tab. A wrapped joins that group even though Home is
     where it is offered from. Body map, tally and compare are the same
     kind of look-back, linked from Stats' own list. On-this-day joins for
     the same reason as wrapped - it too is offered from Home
     (OnThisDayHomeCard) rather than from Stats (ticket 09).

     `/recap` was in this list until phase 5 UX ticket 23 deleted the route
     (spec 07). Its period picker is a wrapped now, so every URL that used
     to land here still lights this tab - under /wrapped rather than under
     a prefix of its own. `/timeline` was in it until redesign ticket 43
     merged the rail into the milestones screen; it is below, with the
     screen it redirects to. */
  {
    key: 'stats',
    prefixes: [
      '/stats',
      '/wrapped',
      '/body-map',
      '/tally',
      '/compare',
      '/on-this-day'
    ]
  },
  /* Doses sits outside /settings, but it is reached from More's health
     group (regimen, hormone-curve) and joins that group's tab too
     (ticket 09). The care overview is the same case one step on: it is the
     health group's own row now (deepening ticket 07), and /doses is reached
     through it.

     The five prefixes below joined here in features ticket 33, when the 23
     hub rows still living at /settings/<slug> moved to their own
     HubGroupKey-named address. `/settings` itself is no longer one of
     them: audit item 4 took it out of this group entirely, and the note
     under this table says what it lights instead.

     `/timeline` is a stub redirecting to /transition/milestones (redesign
     ticket 43), and it is listed here rather than left to the fallback so
     that the tab the old address lights is the tab it lands on. Left with
     Look back, where the rail used to live, the indicator would have
     travelled one tab and back while the redirect resolved.

     `/support` and `/voice` joined in ticket 21, when the retired Practice
     prefix's screens moved to addresses that say which door group holds
     them (ADR-0072) - `/voice` alone got no door prefix, but the tab it
     lights is unchanged. `/practice` itself stays, since the directory
     still holds this ticket's redirect stubs. */
  {
    key: 'settings',
    prefixes: [
      '/timeline',
      '/more',
      '/doses',
      '/care',
      '/body',
      '/health',
      '/transition',
      '/support',
      '/voice',
      '/practice',
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
