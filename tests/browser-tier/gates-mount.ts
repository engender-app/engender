/* Mounts the gate gallery (phase 5 ticket 26) with the app's own
   stylesheets, in the same order +layout.svelte imports them, so the gates
   are judged against the real cascade rather than against a subset of it.
   Unlike the kit gallery this does load components.css and screens.css:
   the gates are screens, and the frame being looked at lives in both. */
import { mount } from 'svelte';
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

mount(Gallery, { target: document.querySelector('#gates')! });
document.body.setAttribute('data-gates-ready', '');
