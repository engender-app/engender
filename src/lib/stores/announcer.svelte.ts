/* The two regions announcer.ts writes to, held where the root layout can
   draw them. It draws them for the life of the app, over every gate and
   outside the part a sheet makes inert, so the regions are on the page and
   audible before anything has to be said into them. */
import { createAnnouncer } from './announcer';
import { forgetOnLock } from '../lock/forget-content';

export const speech = $state({ polite: '', assertive: '' });

export const announce = createAnnouncer((region, text) => (speech[region] = text));
forgetOnLock(announce.clear);
