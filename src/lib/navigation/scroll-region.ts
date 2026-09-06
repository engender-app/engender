/* Where each screen was scrolled to, and how much of its long lists was
   rendered when it was left.

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

/* How far a screen's batched lists had been grown when it was left (phase 8
   features ticket 66). Here rather than in the kit component because it is
   the same fact as the position above and exists to serve it: a list that
   comes back rendering one batch is a short region, and a remembered
   position restored against a short region is clamped to the end of what is
   there. Both halves of "what this screen looked like when you left it" are
   remembered in one place and for one lifetime - the tab's, not the
   journal's.

   Keyed by the list as well as the path: a screen can hold two batched
   lists, and growing one is not growing the other. */
const batches = new Map<string, number>();

const batchKey = (path: string, list: string) => `${path}#${list}`;

function region(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-app-scroll-region]');
}

/** Called before leaving, while the outgoing screen can still be measured. */
export function rememberScroll(path: string | null | undefined): void {
  const el = region();
  if (!el || !path) return;
  positions.set(path, el.scrollTop);
}

/** Called once the incoming screen is in the DOM.

    "In the DOM" is the shell, not the content. Every screen with a list
    reads it behind a liveQuery, so at the moment this runs the region holds
    a skeleton and is a few hundred pixels tall - and a browser clamps a
    scrollTop to what there is to scroll, which for a remembered position
    deep in a long screen means 0. Leaving the photo grid, the side effects
    log or the wear log part way down and coming back landed at the top,
    every time, on every screen whose rows are read rather than mirrored
    (measured across three of them, phase 8 features ticket 66).

    So the position is re-applied as the rows arrive, for up to half a
    second, and abandoned the moment anything else moves the region -
    somebody scrolling while their screen is still filling in owns that
    number, not this. The same shape `scrollToHash` below already uses for
    the same reason, and the same reason it is a loop rather than a single
    delayed retry: what is being waited for is a layout, and nothing fires
    an event when one has finished growing. */
export function restoreScroll(path: string): void {
  const el = region();
  if (!el) return;

  const wanted = positions.get(path) ?? 0;
  el.scrollTop = wanted;
  /* The top is always reachable, so a screen being sent there is done. */
  if (wanted === 0 || el.scrollTop === wanted) return;

  let applied = el.scrollTop;
  let frames = 0;
  const settle = () => {
    if (!el.isConnected || frames++ > 30) return;
    /* Moved by something that is not this - a finger, a wheel, a key. The
       person is reading; the number is theirs now. */
    if (el.scrollTop !== applied) return;
    el.scrollTop = wanted;
    applied = el.scrollTop;
    if (applied === wanted) return;
    requestAnimationFrame(settle);
  };
  requestAnimationFrame(settle);
}

/** Called by a batched list whenever it grows, so leaving now and coming
    back renders the same rows again. */
export function rememberBatches(path: string, list: string, count: number): void {
  batches.set(batchKey(path, list), count);
}

/** What a batched list should mount rendering. One batch for a screen
    nobody has grown, which is every screen the first time. */
export function restoredBatches(path: string, list: string): number {
  return Math.max(1, batches.get(batchKey(path, list)) ?? 1);
}

/** The id a navigation's hash names, decoded - or null when there is none.

    Shared by `scrollToHash` below and by a batched screen deciding how far to
    expand before it renders a link's row at all (phase 8 features ticket
    67): both are asking about the same hash, and reading it twice with two
    different decodings would answer the question two different ways. */
export function hashRowId(hash: string = location.hash): string | null {
  return hash ? decodeURIComponent(hash.slice(1)) : null;
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

    A batched list's row exists in the DOM only once the screen has expanded
    it far enough (ticket 67's own `batchesFor`) - this waits for the element
    the same way regardless of why it was missing a moment ago, so nothing
    here has to know whether the row was behind a slow read or behind a
    batch.

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
  const id = hashRowId(hash);
  if (!id) return;
  const el = document.getElementById(id);
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
