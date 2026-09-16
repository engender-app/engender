/* Mounts the tile grid alone (redesign ticket 24), with the app's own
   stylesheets, so the block, its foot and its controls are judged against
   the real tokens on the real stripes.

   The kit gallery next door holds one tile grid of two plain tiles, which
   is what it needs to show the surface exists. What this ticket changes is
   the tile's shape across five of them - plain, action, dismiss, both, and
   the row weight - plus the tight pair, and a page carrying only those is
   what a sign-off can be read off. */
import { mountInto, publishFixture } from './mount.ts';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/kit.css';
/* components.css, which the kit gallery next door deliberately leaves out:
   a tile's action is a `.btn`, and `.btn` lives there. Without it the
   button renders with the browser's own border and the review would be of
   a control the app does not have. */
import '$lib/styles/components.css';
import '$lib/motion/press.css';
import Gallery from './tile-block-gallery.svelte';

publishFixture('tile-block', () => mountInto(Gallery, {}, document.querySelector('#tiles')!));
