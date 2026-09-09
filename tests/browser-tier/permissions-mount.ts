/* Mounts the permission row in every state it can be in (phase 10 redesign
   ticket 31).

   components.css is imported, unlike kit-mount.ts next door: the grant
   button is a `.btn`, which lives there, and press.css keys off the
   fixture's own data-app-root. Without both, the one control on the row
   would be drawn in whatever a bare button looks like. */
import { mountInto, publishFixture } from './mount.ts';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/kit.css';
import '$lib/styles/components.css';
import '$lib/motion/press.css';
import Gallery from './permissions-gallery.svelte';

publishFixture('permissions', () =>
  mountInto(Gallery, {}, document.querySelector('#permissions')!)
);
