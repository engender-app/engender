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

/** Scrolls the element a navigation's hash names into view, once it exists.

    The browser's own anchor scroll gives up before this app's data does: the
    hash resolves on arrival, but the row it names is behind a liveQuery that
    answers a beat later, and nothing re-triggers the scroll when it lands
    (phase 5 ticket 99 item 15 - the clinician summary's regimen and dose rows
    link to their records across a hash, and the dose log is long enough that
    an unscrolled landing is nowhere near the record). Called by the target
    screen once its rows are in the DOM, not by the layout, because only the
    screen knows when that is.

    Not inline, and not on a fixed delay: the first frames after the rows'
    query resolves still have the rest of the list mounting underneath them -
    rows render newest first, so a record from deep in the log keeps moving
    down while the newer rows above it arrive - and a scroll computed against
    a half-built layout lands thousands of pixels short of where the row ends
    up. So this waits for the scroll region's own height to hold still across
    a frame - the list has finished shaping itself - and only then scrolls.
    Centred rather than start-at-top, so the record arrives with its
    neighbours reading around it.

    Consuming the hash - stripping it once honoured - is what makes this safe
    for a caller to run on every row change: the second run is a no-op instead
    of a second yank to the same row while the person reads. */
export function scrollToHash(hash: string = location.hash): void {
  if (!hash) return;
  const el = document.getElementById(decodeURIComponent(hash.slice(1)));
  if (!el) return;
  const region = el.closest<HTMLElement>('[data-app-scroll-region]');
  let last: number | null = null;
  let frames = 0;
  const settle = () => {
    /* Gone between the frames - a range edit, a superseded query - and
       nothing to honour. The hash stays for the next run to try. */
    if (!el.isConnected) return;
    const height = region?.scrollHeight ?? document.documentElement.scrollHeight;
    if (height === last || frames++ > 30) {
      el.scrollIntoView({ block: 'center' });
      history.replaceState(history.state, '', location.pathname + location.search);
      return;
    }
    last = height;
    requestAnimationFrame(settle);
  };
  requestAnimationFrame(settle);
}
