/* The routes that render without the app's chrome whoever is looking at
   them - onboarding and the lock screen, which is where a PIN is set.

   Apart from the gate states the layout folds in beside it (locked,
   waiting on a passphrase, schema too new), because those depend on how
   boot went and this does not. The split is what lets the tier-2
   transition ask the question about a route it has not arrived at yet
   (screen-transition.ts's `isChromeless`).

   Here rather than in the layout for the reason active-tab.ts gives: the
   rule is a table, the layout is where a table gets buried, and a rule
   nobody can run in a test is one nobody can check. */
export function chromelessPath(path: string): boolean {
  return path.startsWith('/onboarding') || path === '/settings/lock';
}
