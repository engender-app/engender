/* NAV-005: a handful of screens hardcoded where "back" goes, so arriving at
   Day from the Home heat-map and pressing back landed on Calendar - a screen
   the user never visited. The question this answers is whether there is an
   in-app entry behind this one to return to; where there is not - a deep
   link, or a reload - the hardcoded destination is the fallback rather than
   leaving the app.

   It used to answer that by reading `sveltekit:index` off `history.state`,
   which SvelteKit no longer writes: the state carries `sveltekit:history`
   and `sveltekit:navigation` timestamps now, and neither of them counts
   anything. So the read was `undefined` on every screen and every back
   control took its fallback - which is how opening an entry from the
   counterevidence screen landed on that entry's day, and how going into the
   dose log from a regimen came back to the More hub (Alicja, 2026-08-26).
   The unit test did not catch it because it stubbed the key itself.

   So the app counts its own depth instead. That is a number this app owns
   rather than one it reads out of another project's private state, which is
   the whole reason the old version could rot silently. */

import { goto } from '$app/navigation';

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
export function recordNavigation(type: string, delta?: number | null): void {
  const replaced = replacing;
  replacing = false;
  if (type === 'enter') depth = 0;
  else if (type === 'popstate') depth = Math.max(0, depth + (delta ?? 0));
  else if (!replaced) depth += 1;
}

/** How deep the app is in its own history, for callers outside this module. */
export function navigationDepth(): number {
  return depth;
}

/**
 * Navigate by replacing the current history entry rather than pushing one.
 *
 * The screens that do this are swapping a view of themselves - wrapped's
 * seven periods, a filter dropping out of a URL - and a pushed entry per
 * swap made back walk the switcher instead of leaving the screen. That part
 * `goto(url, { replaceState: true })` already did. What it could not do is
 * tell the count above, which sees `afterNavigate` report type `goto` and
 * has no way to know no entry was added; so a screen the app booted onto and
 * then replaced looked one deep, and its back control walked out of the app
 * instead of taking its fallback.
 *
 * Going through here rather than passing the option at the call site is what
 * keeps the two facts together. `tests/navigation-depth-boundary.test.ts`
 * holds the rest of the app to it.
 *
 * If the navigation never settles the mark is spent by whichever one settles
 * next, which undercounts by one - back takes its fallback where it could
 * have gone through history. That is the safe direction: a fallback stays
 * inside the app, and walking out of it does not.
 */
export function replaceRoute(
  url: string | URL,
  options?: Omit<NonNullable<Parameters<typeof goto>[1]>, 'replaceState'>
): Promise<void> {
  replacing = true;
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
