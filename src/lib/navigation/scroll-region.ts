/* The layout's [data-app-scroll-region] persists across navigation, so
   remember scroll position and rendered list extent per path here.
   Restore only on popstate, including system back and history.back().
   Open forward door, tab, link and goto navigation at the top.
   replaceRoute with noScroll preserves the current position.

   Use the navigation type for restoration. screen-transition.ts's
   isBack describes route hierarchy, which can differ from history. */

/* Relative, not `$lib`: the node-tier vitest loads this module and does not
   resolve the alias. */
import { scrollBehavior } from '../motion/tokens';

const positions = new Map<string, number>();

/* How far a screen's batched lists had been grown when it was left. Here rather than in the kit component because it is
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

/* SvelteKit's goto noScroll covers the window. replaceRoute reserves
   the matching address for the app scroll region. The next navigation
   may claim it only if its destination matches, and later navigation
   drops the hold. Keep it as an address so Node can test it without
   location. */
let hold: { url: string | URL; claimed: boolean } | null = null;

/** Called by `replaceRoute` for a navigation asked not to scroll. */
export function holdScroll(url: string | URL): void {
  hold = { url, claimed: false };
}

/** Called as every navigation starts, before anything is restored. */
export function claimScrollHold(to: URL | null | undefined): void {
  hold = hold && !hold.claimed && to && new URL(hold.url, to).href === to.href ? { ...hold, claimed: true } : null;
}

function held(to: URL, type: string): boolean {
  return type !== 'popstate' && !!hold?.claimed && new URL(hold.url, to).href === to.href;
}

function region(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-app-scroll-region]');
}

/** Where `restoreScroll` is about to take a screen: where it was left when
    the navigation (SvelteKit's `type`) is history going back to it, the top
    otherwise. The transition needs to know before the region has got there:
    restoring is eased, and it waits for the rows, so at the moment the
    incoming screen is photographed the region is still at 0. */
export function savedScroll(path: string | null | undefined, type: string): number {
  return (type === 'popstate' && path && positions.get(path)) || 0;
}

/** Called before leaving, while the outgoing screen can still be measured. */
export function rememberScroll(path: string | null | undefined): void {
  const el = region();
  if (!el || !path) return;
  positions.set(path, el.scrollTop);
}

/** Restore when the incoming shell mounts. Live-query skeletons
    may be too short for the saved scrollTop, so reapply as rows
    arrive for up to half a second. Stop when another action moves
    the region. The caller skips this for replaceRoute with noScroll. */
export function restoreScroll(to: URL, type: string): void {
  const el = region();
  if (!el || held(to, type)) return;

  const wanted = savedScroll(to.pathname, type);
  const reachable = () => el.scrollHeight - el.clientHeight >= wanted;
  const travel = () => el.scrollTo({ top: wanted, behavior: scrollBehavior() });
  /* Once the position can be reached it is travelled to, eased, exactly once.
     The loop below must not be the thing that animates: a smooth scroll in
     flight moves `scrollTop` every frame, which the loop would read as a
     finger and abandon, or fight by re-issuing the jump. */
  /* A screen opening at the top is a reset, not a jump: the region still
     holds the last screen's offset, and easing from it would slide every
     fresh screen up on arrival. So the top is instant. */
  if (wanted === 0) {
    el.scrollTop = 0;
    return;
  }
  if (reachable()) {
    travel();
    return;
  }

  /* Not reachable yet: the rows are still arriving. Hold the region at the
     end of what exists, instantly and without a visible move, and ease the
     rest once the layout has grown to it. */
  el.scrollTop = wanted;
  let applied = el.scrollTop;
  let frames = 0;
  const settle = () => {
    if (!el.isConnected || frames++ > 30) return;
    /* Moved by something that is not this - a finger, a wheel, a key. The
       person is reading; the number is theirs now. */
    if (el.scrollTop !== applied) return;
    if (reachable()) {
      travel();
      return;
    }
    el.scrollTop = wanted;
    applied = el.scrollTop;
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
    expand before it renders a link's row at all: both are asking about the same hash, and reading it twice with two
    different decodings would answer the question two different ways. */
export function hashRowId(hash: string = location.hash): string | null {
  if (!hash) return null;
  /* A hash is whatever the link said, and `#%` is a link anyone can send:
     a malformed escape names no row, so it reads as no hash at all rather
     than throwing inside the setup of the screen that asked. */
  try {
    return decodeURIComponent(hash.slice(1));
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}

/** Center a hash-linked record once it and its scroll region are ready.
    The target screen calls this after its rows mount, including rows
    revealed by batching. Browser anchor handling runs before async reads
    finish. Wait for the region height to stabilize across a frame so
    newly mounted rows above the target cannot move it after scrolling.
    Remove the hash once honored so later row updates do not scroll again. */
export function scrollToHash(hash: string = location.hash): void {
  const id = hashRowId(hash);
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  const region = el.closest<HTMLElement>('[data-app-scroll-region]');
  let last: number | null = null;
  let frames = 0;
  const startedAt = region?.scrollTop ?? 0;
  const settle = () => {
    /* Gone between the frames - a range edit, a superseded query - and
       nothing to honour. The hash stays for the next run to try. */
    if (!el.isConnected) return;
    /* Somebody scrolled while the list was still shaping itself: that
       number is theirs now, and an eased jump would fight their finger. */
    if (region && region.scrollTop !== startedAt) return;
    const height = region?.scrollHeight ?? document.documentElement.scrollHeight;
    if (height === last || frames++ > 30) {
      el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      history.replaceState(history.state, '', location.pathname + location.search);
      return;
    }
    last = height;
    requestAnimationFrame(settle);
  };
  requestAnimationFrame(settle);
}
