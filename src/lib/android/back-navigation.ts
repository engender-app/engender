/* NAV-002: the routing decision Android's back gesture (+layout.svelte)
   depends on, kept pure and free of Capacitor/SvelteKit imports so it is
   testable without a WebView - unlike the previous version of this seam,
   which a test could only grep for in +layout.svelte's source text.

   CARPET-05: `depth` is `navigationDepth()` from `$lib/navigation/smart-back`,
   the same count the web half's back controls decide on, so the hardware
   gesture and the arrow in a screen header answer the same question. It
   used to be `window.history.length`, which is a different number in two
   ways that both bite: it counts the boot entry, and it never comes back
   down. Walking into a screen and back out left it at 2 while the app was
   sitting on the entry it booted on, so the gesture stepped out of the
   WebView instead of going home. */

type AndroidBackAction = 'minimize' | 'history-back' | 'go-home';

export function resolveAndroidBackAction(currentPath: string, depth: number): AndroidBackAction {
  if (currentPath === '/' || currentPath === '') return 'minimize';
  if (depth > 0) return 'history-back';
  return 'go-home';
}
