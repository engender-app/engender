/* `$app/navigation` for the pages this tier serves, beside app-state-stub.ts
   and there for the same reason: no SvelteKit router runs here, so the module
   a real screen imports does not exist.

   The entry editor is the first fixture to mount a whole screen rather than a
   gallery of parts, and a screen navigates - saving an entry ends in
   `goto('/')`, and its back button is `smartBack`, which is another goto.
   Resolving rather than throwing keeps the save's own `await` moving; where
   the editor went is the router's business and no fixture here asserts on it. */
export async function goto(_url: string): Promise<void> {}
