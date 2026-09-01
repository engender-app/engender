/* `$app/state` for the pages this tier serves.

   The kit gallery mounts real kit components, and Notice.svelte reads
   `navigating.to` to decide whether its exit is a screen change or a
   dismissal (reveal.ts's `disclose`). There is no SvelteKit router here -
   this tier runs plain vite with the svelte plugin and no route tree - so
   the module SvelteKit would provide does not exist and the gallery failed
   to mount at all once Notice started importing it.

   Nothing here is under test: a gallery page never navigates, so `to` is
   always null and the notice's exit plays the way it does on a screen
   somebody is still looking at. */
export const navigating = { from: null, to: null, type: null, willUnload: false, delta: null, complete: null };
export const page = { url: new URL('http://localhost/'), params: {}, route: { id: null }, status: 200, error: null, data: {}, form: null, state: {} };
export const updated = { current: false, check: async () => false };
