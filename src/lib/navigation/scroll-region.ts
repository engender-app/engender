/* Where each screen was scrolled to.

   The app scrolls `[data-app-scroll-region]` rather than the window, so the
   browser's own scroll restoration never sees it and SvelteKit's does not
   either: the element lives in the layout and survives every navigation, so
   a new screen simply inherits wherever the last one was left. Opening
   Support and resources from the bottom of the More hub put it half way down
   a screen it had never been scrolled on (Alicja, 2026-08-26).

   Each path remembers its own position, and that is the whole rule. A screen
   you have never scrolled starts at the top, which is the complaint; a screen
   you are coming back to starts where you left it, which is what the browser
   would do for you if this were the window scrolling.

   Deliberately not asked of `screen-transition.ts`'s `isBack`, which was the
   first attempt: that one answers "is this a step back up a path", and the
   hub links to `/settings/*` routes that are nowhere underneath `/more`, so
   neither leg of hub to screen to hub qualifies. Remembering per path needs
   no notion of direction at all.
*/

const positions = new Map<string, number>();

function region(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-app-scroll-region]');
}

/** Called before leaving, while the outgoing screen can still be measured. */
export function rememberScroll(path: string | null | undefined): void {
  const el = region();
  if (!el || !path) return;
  positions.set(path, el.scrollTop);
}

/** Called once the incoming screen is in the DOM. */
export function restoreScroll(path: string): void {
  const el = region();
  if (!el) return;
  el.scrollTop = positions.get(path) ?? 0;
}
