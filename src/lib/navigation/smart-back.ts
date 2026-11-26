/* Use in-app history for Back. A deep link or reload falls back to the
   screen's default destination so Back stays inside the app (NAV-005).

   Track depth here. SvelteKit no longer stores `sveltekit:index`;
   its history and navigation timestamps cannot count entries. */

import { goto } from '$app/navigation';
import { holdScroll } from './scroll-region';

/** Navigations pushed since the entry the app booted on. */
let depth = 0;

/** Set by `replaceRoute`, spent by the `recordNavigation` it causes. */
let replacing = false;

/**
 * Called by the shell for every settled navigation.
 *
 * `enter` is the app arriving on its first entry, which is the floor: from
 * there, back leaves the app. Anything that pushes an entry adds one, and a
 * popstate moves by its own delta - negative going back, positive going
 * forward again. A navigation that replaced the current entry instead of
 * pushing one adds nothing, which is what `replaceRoute` is for: SvelteKit
 * reports it as an ordinary `goto`, so the app has to say so itself.
 *
 * Clamped at zero because the browser's history holds entries from before
 * the app was opened, so a back gesture can walk off the bottom of what this
 * has counted. Left negative, the next navigation would climb back to zero
 * without having pushed anything and the app would think it had somewhere to
 * return to.
 */
export function recordNavigation(type: string, delta?: number | null, sameUrl = false): void {
  depth = depthAfter(type, delta, sameUrl);
  replacing = false;
}

/** The depth `recordNavigation` will record for a navigation still under
    way, without recording it: the shell keys what a history entry borrowed
    by it before the page changes (chrome-tab-origin.ts).

    `sameUrl` is a link or form to the address already showing - tapping
    the lit tab - which SvelteKit turns into a replaceState of its own
    accord, so it adds no entry either (a goto() to the same address still
    pushes, and the caller does not pass it) (after-release 17 review: counted, it put every
    entry behind it one deep too many). */
export function depthAfter(type: string, delta?: number | null, sameUrl = false): number {
  if (type === 'enter') return 0;
  if (type === 'popstate') return Math.max(0, depth + (delta ?? 0));
  return replacing || sameUrl ? depth : depth + 1;
}

/** A link or form to the address already showing, which SvelteKit makes
    a replaceState rather than a new history entry. A goto() to the same
    address still pushes, so it is not one. */
export function sameUrl(navigation: {
  type: string;
  from: { url: URL | null } | null;
  to: { url: URL | null } | null;
}): boolean {
  if (navigation.type !== 'link' && navigation.type !== 'form') return false;
  const from = navigation.from?.url?.href;
  return from !== undefined && from === navigation.to?.url?.href;
}

/** How deep the app is in its own history, for callers outside this module. */
export function navigationDepth(): number {
  return depth;
}

/**
 * Replace the current entry when switching views of the same screen.
 * SvelteKit reports these as `goto`, so mark the replacement to keep
 * the app's history depth accurate. The navigation-depth boundary test
 * requires callers to use this helper.
 *
 * If navigation never settles, the next settlement spends the mark.
 * Undercounting then favors an in-app fallback. Forward `noScroll` to
 * the app's scroll region as well as SvelteKit.
 */
export function replaceRoute(
  url: string | URL,
  options?: Omit<NonNullable<Parameters<typeof goto>[1]>, 'replaceState'>
): Promise<void> {
  replacing = true;
  if (options?.noScroll) holdScroll(url);
  return goto(url, { ...options, replaceState: true });
}

/**
 * Go back to the entry behind this one, or to `fallback` where there is none.
 *
 * The fallback replaces rather than pushes, for the same reason Android's
 * gesture does it (`platform-sync.ts`): this branch is the app running out of
 * history, so the screen it falls back to should be the entry it runs out on.
 * Pushed, back would have somewhere to go again and it would be the screen
 * that had just been backed out of - deep link into the export screen, press
 * back to Settings, press back and land on export again, with no press that
 * ever leaves. Replacing walks the fallbacks up to Home and stops there.
 */
export function smartBack(fallback: string): void {
  if (depth > 0) history.back();
  else void replaceRoute(fallback);
}

/**
 * `smartBack`, resolved once the screen it went to has landed. A caller that
 * raises something on the destination (a toast) waits for this, so that it
 * arrives on the screen it belongs to and not in the middle of the route
 * change.
 */
export async function smartBackSettled(fallback: string): Promise<void> {
  if (depth === 0) return replaceRoute(fallback);
  const from = location.href;
  history.back();
  for (let frame = 0; frame < 90 && location.href === from; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
