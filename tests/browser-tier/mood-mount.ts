/* Mounts the mood gallery (phase 10 ticket 27) against the app's own tokens
   and fonts, the way the icon gallery does - a ramp judged against a copy of
   the palette is a ramp judged against the wrong colours.

   Only mood is on the page. The icon gallery next door draws both families
   at every size and is the right place to ask whether the marks read as one
   set; this one exists to answer whether the ramp reads as two colours and
   whether the five faces still tell apart, which is what ticket 27 changed
   and all it changed. */
import { mountInto, publishFixture } from './mount.ts';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import '$lib/styles/kit.css';
import '$lib/motion/press.css';
import Gallery from './mood-gallery.svelte';

publishFixture('mood', () => mountInto(Gallery, {}, document.querySelector('#mood')!));
