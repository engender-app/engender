/* The demo bar's viewport preview: constrain the app to a 390px frame, or
   let it use the real viewport.

   It used to live in stores/ui.svelte.ts and double as the answer to "are
   we on Android", which is why four screens read it. That question has its
   own module now (lib/platform.ts); this is only about how wide the
   viewport looks, and only DemoBar.svelte touches it. */

export const frame = $state({
  mode: 'responsive' as 'responsive' | 'phone'
});
