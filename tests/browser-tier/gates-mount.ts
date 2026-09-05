/* Mounts the gate gallery (phase 5 ticket 26) with the app's own
   stylesheets, in the same order +layout.svelte imports them, so the gates
   are judged against the real cascade rather than against a subset of it.
   Unlike the kit gallery this does load components.css and screens.css:
   the gates are screens, and the frame being looked at lives in both. */
import { mountInto, publishFixture } from './mount.ts';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import '$lib/styles/screens.css';
import '$lib/styles/kit.css';
import '$lib/motion/press.css';
import '$lib/motion/materials.css';
import Gallery from './gates-gallery.svelte';

publishFixture('gates', () => mountInto(Gallery, {}, document.querySelector('#gates')!));
