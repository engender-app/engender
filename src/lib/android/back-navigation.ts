/* NAV-002: the routing decision Android's back gesture (+layout.svelte)
   depends on, kept pure and free of Capacitor/SvelteKit imports so it is
   testable without a WebView - unlike the previous version of this seam,
   which a test could only grep for in +layout.svelte's source text. */

export type AndroidBackAction = 'minimize' | 'history-back' | 'go-home';

export function resolveAndroidBackAction(currentPath: string, historyLength: number): AndroidBackAction {
  if (currentPath === '/' || currentPath === '') return 'minimize';
  if (historyLength > 1) return 'history-back';
  return 'go-home';
}
