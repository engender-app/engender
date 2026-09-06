/* Mounts the progress bar (phase 9 audit ticket 11) with the app's own
   stylesheets.

   components.css is imported for the same reason controls-mount.ts imports
   it: the bar IS `.rail`, which lives there, and a fixture that left it out
   would photograph a component standing on a shape it does not have. */
import { mountInto, publishFixture } from './mount.ts';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import '$lib/motion/press.css';
import Gallery from './progress-gallery.svelte';

publishFixture('progress', () => mountInto(Gallery, {}, document.querySelector('#progress')!));
