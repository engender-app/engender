/* `$app/navigation` for the pages this tier serves, beside app-state-stub.ts
   and there for the same reason: no SvelteKit router runs here, so the module
   a real screen imports does not exist.

   The entry editor is the first fixture to mount a whole screen rather than a
   gallery of parts, and a screen navigates - saving an entry ends in
   `goto('/')`, and its back button is `smartBack`, which is another goto.
   Resolves by default. The save-recovery probe can fail the next navigation
   to exercise the editor after a successful commit. */
let failNext = false;

export function failNextNavigation() {
  failNext = true;
}

export async function goto(_url: string): Promise<void> {
  if (failNext) {
    failNext = false;
    throw new Error('injected navigation failure');
  }
}
