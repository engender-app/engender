/* Mounts the day gallery (phase 5 deepening ticket 21) with the app's own
   stylesheets, in the same order +layout.svelte imports them, so the
   composition is judged against the real cascade. Same set gates-mount.ts
   loads: this is a screen, and what it is made of lives in components.css,
   screens.css and kit.css alike.

   activeFlag is refreshed here for the reason DIRECTION records: the shell
   publishes the flag and nothing reads it for itself, so a fixture that
   stamps `data-palette` has to tell the publisher, or every role draws the
   previous palette. */
import { mountFixture } from './mount.ts';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import '$lib/styles/screens.css';
import '$lib/styles/kit.css';
import '$lib/motion/press.css';
import '$lib/motion/materials.css';
import { refreshActiveFlag } from '$lib/theme/activeFlag.svelte';
import Gallery from './day-gallery.svelte';

/* After every attribute stamp, which the gallery does in an effect. */
const observer = new MutationObserver(() => refreshActiveFlag());
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-theme'] });
refreshActiveFlag();

mountFixture('day', Gallery);
