import type { Handle } from '@sveltejs/kit';
import { holdModulePreloads } from '$lib/document/holdModulePreloads';

/* Runs at build time only: this is a static SPA with no server, and the
   document SvelteKit writes as the fallback page passes through here once.
   The one thing it does is hold the module hints until the first frame has
   painted (holdModulePreloads says why); app.html's pre-paint script
   releases them. */
export const handle: Handle = ({ event, resolve }) =>
  resolve(event, { transformPageChunk: ({ html }) => holdModulePreloads(html) });
