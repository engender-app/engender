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
  /* SH-001: Timeline used to light no tab at all, which read as having left
     the app's structure. It groups with Stats as a look-back view over the
     same journal, rather than getting IA a new tab. A wrapped joins that
     group for the same reason, even though Home is where it is offered
     from. Body map, tally and compare are the same kind of look-back,
     linked from Stats' own list. On-this-day joins for the same reason as
     wrapped - it too is offered from Home (OnThisDayHomeCard) rather than
     from Stats (ticket 09).

     `/recap` was in this list until phase 5 UX ticket 23 deleted the route
     (spec 07). Its period picker is a wrapped now, so every URL that used
     to land here still lights this tab - under /wrapped rather than under
     a prefix of its own. */
  {
    key: 'stats',
    prefixes: ['/stats', '/timeline', '/wrapped', '/body-map', '/tally', '/compare', '/on-this-day']
  },
  /* Doses sits outside /settings, but it is reached from More's health
     group (regimen, hormone-curve) and joins that group's tab too
     (ticket 09). The care overview is the same case one step on: it is the
     health group's own row now (deepening ticket 07), and /doses is reached
     through it.

     The five prefixes below joined here in features ticket 33, when the 23
     hub rows still living at /settings/<slug> moved to their own
     HubGroupKey-named address - /settings itself stays, since the
     redirects, /settings/reminders[/...] and the hand-written
     Appearance/Tracking/Privacy sections all remain there. */
  {
    key: 'settings',
    prefixes: [
      '/settings',
      '/more',
      '/doses',
      '/care',
      '/body',
      '/health',
      '/transition',
      '/practice',
      '/media'
    ]
  }
];

export function activeTabKey(path: string): string {
  if (path === '/') return 'home';
  return TAB_ROUTES.find((route) => route.prefixes.some((prefix) => path.startsWith(prefix)))?.key ?? '';
}
