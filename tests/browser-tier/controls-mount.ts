/* Mounts the control kit (phase 5 ticket 30) with the app's own stylesheets.

   components.css is imported here and deliberately is not by kit-mount.ts:
   the surface kit stands on its own and that page is where that gets checked,
   while the controls ARE components.css - the slider, the switch, the
   segmented control and the press all live in it. Two fixtures rather than
   one for that reason. */
import { mount } from 'svelte';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import '$lib/motion/press.css';
import Gallery from './controls-gallery.svelte';

mount(Gallery, { target: document.querySelector('#controls')! });
document.body.setAttribute('data-controls-ready', '');
