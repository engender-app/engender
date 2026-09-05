/* Mounts the kit gallery (phase 5 ticket 20) with the app's own stylesheets,
   so the surfaces are judged against the real tokens rather than against a
   copy of them. The fonts come from the app's static directory, which this
   tier's vite config serves as its public directory for exactly this. */
import { mountFixture } from './mount.ts';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
/* app.css for the reset alone: it is where `* { box-sizing: border-box }`
   lives, and the kit is authored against it the way every other stylesheet
   in the app is. Its shell rules have no markup to match here.
   components.css is deliberately absent - the kit stands on its own, and
   this page is where that gets checked. */
import '$lib/styles/app.css';
import '$lib/styles/kit.css';
import '$lib/motion/press.css';
import Gallery from './kit-gallery.svelte';

mountFixture('kit', Gallery);
