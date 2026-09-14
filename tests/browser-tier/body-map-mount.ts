/* Mounts the body-map figure gallery (phase 10 redesign ticket 40) with the
   app's own stylesheets, in the order +layout.svelte imports them, so the
   shapes are judged against the real cascade rather than a copy of it.

   activeFlag is refreshed here for the reason day-mount.ts records: the
   shell publishes the flag and nothing reads it for itself, so a fixture
   that stamps `data-palette` has to tell the publisher, or every role draws
   the previous palette - and the figure's whole fill is a role's heat ramp,
   so a stale flag makes the scenes meaningless rather than merely wrong. */
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
import { refreshActiveFlag } from '$lib/theme/activeFlag.svelte';
import Gallery from './body-map-gallery.svelte';

publishFixture('body-map', () => {
  mountInto(Gallery, {}, document.querySelector('#body-map')!);

  const observer = new MutationObserver(() => refreshActiveFlag());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-theme'] });
  refreshActiveFlag();
});
