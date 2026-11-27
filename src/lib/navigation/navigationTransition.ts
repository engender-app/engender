/* Extracted from +layout.svelte (final audit A8), which passes in the one
   fact only the shell has: whether a gate is being drawn instead of the app.
   Everything else here is read off the navigation and the document. */
import type { OnNavigate } from '@sveltejs/kit';

import { ui } from '$lib/stores/ui.svelte';
import { closeEntryContainer } from '$lib/motion/container.svelte';
import { carryBlind } from '$lib/motion/fieldBlind';
import { dropOutgoingScreens } from '$lib/motion/outgoingScreen';
import { markScreenArrival } from '$lib/motion/screenArrival';
import { chromeTabOrigin } from './chrome-tab-origin';
import { cutsInsteadOfMoving } from './chromeless';
import { leavesHomeForEntry, screenTransition } from './screen-transition';
import { claimScrollHold, rememberScroll, restoreScroll, savedScroll } from './scroll-region';
import { animateAndroidTab, finishAndroidTab } from './androidTabMotion';
import { isAndroid } from '$lib/platform';
import { isReducedMotion } from '$lib/motion/tokens';
import { holdUntilPainted } from '$lib/motion/paintHold';

const TAB_ROOTS = new Set(['/', '/calendar', '/stats', '/more']);
let currentTransition: ViewTransition | null = null;

/* Use View Transitions to capture the old frame without remounting SvelteKit
   pages, including routes reused across parameter changes. screen-transition.ts
   chooses data-nav for app.css. Without the API, navigation cuts. */
export function navigateWithTransition(navigation: OnNavigate, replacesApp: boolean): Promise<void> | void {
  const releasePrevious = finishAndroidTab(navigation.complete);
  /* SvelteKit can still mount a superseded route after its onNavigate
     promise resolves. Release both routes together, once the successor
     can swap, so the intermediate route never gets a painted frame. */
  /* The bar sits above quick add's scrim so the add control stays sharp
     while the fan is up, which leaves the four tabs pressable behind it.
     Rather than making them inert - which would need the button to escape
     the bar's own stacking context - any navigation closes the fan. That
     is the right answer for every other way out of it too: a deep link, a
     notification, the back button. */
  ui.chooserOpen = false;
  // Query cleanup on the same screen must preserve a legacy manager handoff.
  if (navigation.from?.url.pathname !== navigation.to?.url.pathname) ui.raisedManager = null;

  /* Before the capture, while the outgoing screen can still be measured. */
  rememberScroll(navigation.from?.url.pathname);
  /* And before anything restores: whether this is the in-place navigation
     `replaceRoute` was asked to keep still. */
  claimScrollHold(navigation.to?.url);

  /* The arrival window opens here rather than only in the layout's
     `afterNavigate`, and the difference is most of the second defect phase
     9 carpet ticket 04 was filed for. A screen whose panels have their
     reads cached draws them in the same tick it mounts, which is before
     `afterNavigate` runs - so the window was still holding the *previous*
     arrival, the panels read it as a change and played entrances, and
     Home's tile block animated from a height measured while it was still
     filling to a height 194px short of the one it settled at, then snapped
     the rest in the frame the transition ended (measured on the demo
     journal, returning from the calendar). Marking on the way out covers
     the panels that are there on mount; the mark after arrival covers the
     ones whose reads answer a few dozen milliseconds later. */
  markScreenArrival();

  if (!navigation.to) return releasePrevious();
  const pattern = screenTransition({
    from: navigation.from?.url.pathname ?? null,
    to: navigation.to.url.pathname,
    type: navigation.type,
    delta: navigation.delta,
    /* `cutsInsteadOfMoving`, not `chromelessPath`: a route with no bar is
       not therefore a route the app did not walk to. The return moment is
       on neither list, so stepping into it and back out both move
       (redesign ticket 35; Alicja read the cut as a yank between frames 7
       and 8 of the empty state's flipbook) - and setup's two legs are not
       the same question either, which is redesign ticket 33's own finding:
       arriving is the shell redirecting because there is no app yet, and
       leaving is the app opening. The table says which is which. */
    isChromeless:
      replacesApp || cutsInsteadOfMoving(navigation.from?.url.pathname ?? null, navigation.to.url.pathname),
    /* Read whether a modal is open before the outgoing screen unmounts.
       Pass that state to the pure transition rule. Use role and
       aria-modal so every accessible modal is covered. data-sheet
       is a walkthrough handle with no effect on behavior (ADR-0029). */
    fromSheet: document.querySelector('[role="dialog"][aria-modal="true"]') !== null,
    chromeOrigin: chromeTabOrigin()
  });
  /* Scopes app.css's shorter --blind-dur to just this one departure.
     See leavesHomeForEntry in screen-transition.ts for why this is separate
     from `pattern` above.
     Read here rather than inside the closure below, where TS no longer
     trusts `navigation.to`'s guard above across the function boundary. */
  const shortBlindHold = leavesHomeForEntry(
    navigation.from?.url.pathname ?? null,
    navigation.to.url.pathname
  );
  /* Before the capture below, and on every navigation rather than only the
     animated ones: a card left wearing the container name is pulled out of
     the screen's own snapshot, so it would hold still while the rest of
     the screen slid past it. Computed first because the pattern is what
     says whether this navigation is the transform. */
  if (pattern !== 'container') closeEntryContainer();
  if (
    isAndroid() &&
    !isReducedMotion() &&
    pattern === 'fade-through' &&
    TAB_ROOTS.has(navigation.from?.url.pathname ?? '') &&
    TAB_ROOTS.has(navigation.to.url.pathname)
  ) return animateAndroidTab(navigation, releasePrevious);
  if (!document.startViewTransition || pattern === 'none') return releasePrevious();

  /* The field is a blind over the content: named
     before the old side is captured, handed to the incoming screen after
     the swap, and given back when the transition is over, along with the
     two heights and the settle it measured. On every navigation rather
     than on the tab crossing alone - a screen with no field is the blind
     closed to nothing rather than a case to skip - and see
     $lib/motion/fieldBlind for why this is not a stylesheet rule. */
  const blind = carryBlind(document, {
    /* Setup's finish is the one navigation whose sun is the same object at
       the same size on both sides (redesign ticket 33, rule 12): it has
       grown one step's worth per step and arrives at Home's resting
       scale, so it holds still inside the two snapshots while the field
       closes around it rather than closing and opening its own rings. */
    holdSun: (navigation.from?.url.pathname ?? '').startsWith('/onboarding'),
    shareSun:
      (navigation.from?.url.pathname === '/' && navigation.to.url.pathname === '/settings') ||
      (navigation.from?.url.pathname === '/settings' && navigation.to.url.pathname === '/'),
    restoring: savedScroll(navigation.to.url.pathname, navigation.type) > 1
  });

  return new Promise((resolve) => {
    document.documentElement.dataset.nav = pattern;
    if (shortBlindHold) document.documentElement.dataset.blindHold = 'short';
    const transition = document.startViewTransition(async () => {
      releasePrevious();
      resolve();
      /* Both of these reject rather than resolve when a navigation is
         superseded - a redirect landing on top of it, a second tap, a
         screen that rewrites its own URL as it mounts - and neither
         rejection means anything went wrong. Swallowed here rather than
         left to the window: an unhandled rejection per aborted navigation
         is noise that buries a real one, and the walkthrough fails the
         whole run on it. */
      /* Whatever happens below, the swap has to run: it is what publishes
         the heights and the settle, and a transition that runs without
         them reads the blind's own fallbacks - a clip of the whole window
         - so the field is simply absent for its length. */
      try {
        await navigation.complete.catch(() => {});
        /* The outgoing page can still be in the DOM here, held by a
           zero-length outro that cannot finish while rendering is paused,
           and a new-side capture with two screens stacked in the scroll
           region is a picture of the wrong layout - every door with tiles
           snapped at the end of its transition. See
           $lib/motion/outgoingScreen for why waiting is not an option. */
        dropOutgoingScreens();
        /* Before the "new" side is captured, not after: a view transition
           photographs the incoming screen the instant this callback's own
           promise resolves, and the layout's `afterNavigate` - the only other
           caller of restoreScroll - fires as its own separate SvelteKit
           lifecycle callback with no ordering promised against that
           capture. Losing the race meant the photograph was always taken
           at scroll 0, and the real scroll position only snapped in once
           afterNavigate ran a moment later - on a screen with anything to
           scroll, the fade-in's last frame and that snap landed close
           enough together to read as one motion (Alicja, 2026-08-27, on
           the transition roadmap: "the fade-in jumps a lot of pixels").
           Restoring here as well as there is not a race fixed by luck -
           this one is provably before the capture, and afterNavigate's own
           call becomes a harmless no-op restoring the same value again. */
        if (navigation.to) restoreScroll(navigation.to.url, navigation.type);
      } finally {
        /* The incoming screen has mounted and the outgoing one is gone.
           Before the new capture, so each name is on exactly one element
           when the browser looks, and after the scroll above, so the
           incoming field is measured where it will be drawn. */
        blind.swap();
      }
    });
    currentTransition = transition;
    ui.screenMoving = true;
    /* `ready` rejects on its own when the browser skips a transition - a
       viewport resize mid-transition is one way - and nothing else here
       reads it, so the rejection reached the window unhandled. */
    void transition.ready.then(() => {
      /* Reduced motion's crossfade waits out --dur-crossfade before it
         starts, which already draws the incoming screen at the nil opacity
         while nothing moves; a hold would only add to the wait. */
      if (isAndroid() && !isReducedMotion()) holdUntilPainted(document);
    }, () => {});
    void transition.finished
      .catch(() => {})
      .finally(() => {
        /* A skipped transition finishes after its successor starts. Only
           the current capture may clear the flag read by arriving suns. */
        if (currentTransition === transition) {
          currentTransition = null;
          ui.screenMoving = false;
          delete document.documentElement.dataset.nav;
          delete document.documentElement.dataset.blindHold;
        }
        blind.release();
      });
  });
}
