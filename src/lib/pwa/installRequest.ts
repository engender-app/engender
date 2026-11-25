/* The landing site's "Add to home screen" (ADR-0019 keeps it on its own
   origin, and a browser installs only the page's own) links here with
   `?install`. This is the part of that hand-off that cannot wait for the
   install sheet's own chunk, so it stays small: it is in the first load.

   It reads the request once and takes it off the address straight away, so
   a reload, a bookmark or the installed app's start URL never asks again.
   And it starts holding Chromium's `beforeinstallprompt`, which can fire
   long before boot lets the sheet mount: held, the browser's own banner
   stays away and the sheet's Install button can replay it on a tap. Only on
   a request, so a visit without one keeps the browser's defaults.

   A demo build also takes a variant name (`?install=ios`) to force one
   surface for review; a production build folds that branch away. */

export interface DeferredInstallPrompt extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const installRequest: {
  /** Asked for and not yet shown. The sheet clears it once it opens. */
  pending: boolean;
  forced: string | null;
  prompt: DeferredInstallPrompt | null;
  at: number;
} = { pending: false, forced: null, prompt: null, at: 0 };

let wake: (() => void) | null = null;

export function takeInstallRequest(): boolean {
  if (typeof location === 'undefined') return false;
  const url = new URL(location.href);
  if (!url.searchParams.has('install')) return false;
  if (__DEMO__) installRequest.forced = url.searchParams.get('install') || null;
  url.searchParams.delete('install');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  installRequest.pending = true;
  installRequest.at = Date.now();
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installRequest.prompt = event as DeferredInstallPrompt;
    wake?.();
  });
  return true;
}

/** Until the prompt is held or `ms` have passed since the request, whichever
    is first. Measured from the request, so a slow boot has already spent it. */
export function waitForInstallPrompt(ms: number): Promise<void> {
  const left = installRequest.at + ms - Date.now();
  if (installRequest.prompt || left <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, left);
    wake = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}
