/* Mounts the tick-readout gallery (phase 11 UI/UX ticket 49) with the app's
   own stylesheets, in the order +layout.svelte imports them, so the plate is
   judged against the real cascade rather than a copy of it.

   The flag is refreshed here for the reason body-map-mount.ts records: the
   shell publishes it and nothing reads it for itself, so a fixture that
   stamps `data-palette` has to tell the publisher or every role draws the
   previous palette. */
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
import { setLocale } from '$lib/paraglide/runtime';
import Gallery from './chart-tick-gallery.svelte';

publishFixture('chart-tick', () => {
  /* Before the mount, and through paraglide's own setter rather than
     through whichever storage this build's strategy happens to compile to:
     the words a tick draws are the catalogue's, and both catalogues have to
     be looked at. */
  const locale = new URLSearchParams(location.search).get('locale');
  if (locale === 'en' || locale === 'pl') setLocale(locale, { reload: false });

  mountInto(Gallery, {}, document.querySelector('#chart-tick')!);

  const observer = new MutationObserver(() => refreshActiveFlag());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-theme'] });
  refreshActiveFlag();
});
