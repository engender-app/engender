/* Two questions about the same handful of routes, and they do not have the
   same answer.

   **Which routes the shell paints no chrome for** - no tab bar, no rail.
   Onboarding, the in-the-room view of the prep list, and the return moment.

   **Which routes render *instead of* the app rather than inside it.** That
   is the narrower set, and it is what decides between a tier-2 movement and
   an instant cut (screen-transition.ts): a gate or onboarding is not
   somewhere the app navigated to, it is what is drawn when the app is not.
   The return moment is not one of those. It is a step Home walks to
   (+layout.svelte's own `goto`), and it lights the Today tab
   (active-tab.ts), so it owes the movement every other step inside a tab
   gets - the field's blind coming down from the sun's height to the step's.

   Conflating the two is what Alicja caught on ticket 35's flipbooks: the
   empty state arriving had "no animation at all, yank between frames 7 and
   8", and the yank was one predicate answering both questions. Home sat
   still for 107ms and then the whole screen cut.

   The room is on the narrower list because it is read while somebody is
   being spoken to and its own ticket asked for one deliberate way in and
   out; changing that is not this ticket's to do.

   Here rather than in the layout for the reason active-tab.ts gives: the
   rule is a table, the layout is where a table gets buried, and a rule
   nobody can run in a test is one nobody can check. */

/** Renders instead of the app: no chrome, and no navigation to animate. */
export function replacesAppNavigation(path: string): boolean {
  // Onboarding by prefix, since every step of it is chromeless; the room by
  // exact match, since the screens around it - appointments and the prep
  // list it is a view over - both keep their bar.
  return path.startsWith('/onboarding') || path === '/health/appointments/in-the-room';
}

/** Renders without the shell's chrome, whoever is looking at it. */
export function chromelessPath(path: string): boolean {
  /* The return moment (ADR-0062, redesign ticket 35) is chromeless and
     nothing more: it is a step in DIRECTION.md rule 15's sense - one
     purpose, no navigation - and its foot carries the one way off, so a bar
     over it would be both a second way and a claim that this is a place
     rather than a moment. */
  return replacesAppNavigation(path) || path === '/coming-back';
}
