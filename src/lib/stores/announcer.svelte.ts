/* The two regions announcer.ts writes to, held where Toasts.svelte can draw
   them. Toasts is mounted for the life of the app, over every gate, so the
   regions are on the page before anything has to be said into them. */
import { createAnnouncer } from './announcer';

export const speech = $state({ polite: '', assertive: '' });

export const announce = createAnnouncer((region, text) => (speech[region] = text));
