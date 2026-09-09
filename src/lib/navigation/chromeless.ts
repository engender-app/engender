/* The routes that render without the app's chrome whoever is looking at
   them - onboarding, the lock screen where a PIN is set, the in-the-room
   view of the prep list, and the return moment.

   The last two are focused modes rather than gates. The room (phase 8
   features ticket 60) is read while somebody is being spoken to, and a tab
   bar floating over it is four ways to leave the screen by accident
   mid-sentence when what it owes the reader is one deliberate way out. The
   return moment (ADR-0062, redesign ticket 35) is a step in DIRECTION.md
   rule 15's sense - one purpose, no navigation - and its foot carries the
   one way off; the bar over it would be both the second way and a claim
   that this is a place rather than a moment.

   Apart from the gate states the layout folds in beside it (locked,
   waiting on a passphrase, schema too new), because those depend on how
   boot went and this does not. The split is what lets the tier-2
   transition ask the question about a route it has not arrived at yet
   (screen-transition.ts's `isChromeless`).

   Here rather than in the layout for the reason active-tab.ts gives: the
   rule is a table, the layout is where a table gets buried, and a rule
   nobody can run in a test is one nobody can check. */
export function chromelessPath(path: string): boolean {
  // Onboarding by prefix, since every step of it is chromeless; the room by
  // exact match, since the screens around it - appointments and the prep
  // list it is a view over - both keep their bar.
  return (
    path.startsWith('/onboarding') ||
    path === '/health/appointments/in-the-room' ||
    path === '/coming-back'
  );
}
