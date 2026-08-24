/* The demo bar's viewport preview: constrain the app to a 390px frame, or
   let it use the real viewport.

   It used to live in stores/ui.svelte.ts and double as the answer to "are
   we on Android", which is why four screens read it. That question has its
   own module now (lib/platform.ts); this is only about how wide the
   viewport looks, and only DemoBar.svelte touches it. */

export const frame = $state({
  mode: 'responsive' as 'responsive' | 'phone',

  /* Simulated window insets (phase 5 ticket 18). A desktop browser reports
     every safe-area inset as 0, which makes the whole cutout question
     invisible in exactly the place a review happens - so the shell reads
     its insets from --inset-* tokens rather than from env() at each use
     site, and this flips those tokens to a phone's numbers.

     The values are Pixel-shaped rather than arbitrary: a 24dp status bar
     over a 48dp cutout area at the top, and a 24dp gesture handle at the
     bottom. Review-only, and the demo bar is dropped from a production
     build along with everything else in this module. It is not a substitute
     for checking on a device, which is what the ticket's acceptance box
     asks for; it is what makes the intermediate passes cheap. */
  insets: false
});

export const SIMULATED_INSETS = { top: '48px', right: '0px', bottom: '24px', left: '0px' };
