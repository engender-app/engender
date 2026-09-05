/* Mounts the icon gallery (phase 5 ticket 31) against the app's own tokens
   and fonts, the way the kit's gallery does - a mark judged against a copy of
   the palette is a mark judged against the wrong colours.

   components.css is imported here and is not in the kit's mount: the mood
   face's own rules live there now that one component serves every surface. */
import { mountInto, publishFixture } from './mount.ts';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import '$lib/styles/kit.css';
import '$lib/motion/press.css';
import Gallery from './icons-gallery.svelte';

publishFixture('icons', () => mountInto(Gallery, {}, document.querySelector('#icons')!));
