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
import { rememberScroll, restoreScroll } from './scroll-region';

/* Tier 2 (phase 5 ticket 18): one screen becoming another.

   Driven by the View Transitions API rather than by a keyed block with
   Svelte transitions on it. A keyed block is the usual way to get an
   outgoing and an incoming screen on screen together, and it would have
   cost a remount of every page component on every navigation - including
   the ones SvelteKit deliberately reuses across a parameter change. The
   view transition captures the old frame as an image instead, so nothing
   unmounts, nothing re-queries, and the whole pair composites off the
   main thread, which is the performance contract on a mid-range phone.

   Where the API is missing the guard below returns immediately and the
   navigation is an instant cut, which is a fair substitute and the same
   one reduced motion asks for.

   The pattern itself is chosen by screen-transition.ts and lands on
   <html> as a data attribute for app.css to read - the decision is a
   table, and this is only the wiring. */
export function navigateWithTransition(navigation: OnNavigate, replacesApp: boolean): Promise<void> | void {
  /* The bar sits above quick add's scrim so the add control stays sharp
     while the fan is up, which leaves the four tabs pressable behind it.
     Rather than making them inert - which would need the button to escape
     the bar's own stacking context - any navigation closes the fan. That
     is the right answer for every other way out of it too: a deep link, a
     notification, the back button. */
  ui.chooserOpen = false;

  /* Before the capture, while the outgoing screen can still be measured. */
  rememberScroll(navigation.from?.url.pathname);

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

  if (!navigation.to) return;
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
    /* Gathered here: whether a sheet is open over the outgoing screen is
       not something the two URLs can answer, and screen-transition.ts
       stays a pure table by being told rather than by looking. Read off the
       shell rather than plumbed down from Sheet, because a navigation out
       of a sheet is started by whatever is inside it and none of those
       callers know they are in one. Still open at this point - the sheet
       unmounts with the screen it belongs to, which happens inside the
       capture below.

       The selector is the dialog's ARIA, not `[data-sheet]`, which is a
       walkthrough handle: ADR-0029 grants those on the terms that they
       "carry no styling and change no component's behavior", and a
       navigation animation keyed on one makes renaming it a silent
       behaviour change that only the walkthrough would catch. `role` and
       `aria-modal` are Sheet's own contract with assistive tech and
       cannot be renamed at all, and any future modal that sets them
       honestly is a modal for this purpose too. */
    fromSheet: document.querySelector('[role="dialog"][aria-modal="true"]') !== null,
    chromeOrigin: chromeTabOrigin()
  });
  /* Scopes app.css's shorter --blind-dur to just this one departure
     (ticket 159) - see screen-transition.ts's own comment on
     leavesHomeForEntry for why this is not folded into `pattern` above.
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
  if (!document.startViewTransition || pattern === 'none') return;

  /* The field is a blind over the content (redesign ticket 28): named
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
    holdSun: (navigation.from?.url.pathname ?? '').startsWith('/onboarding')
  });

  return new Promise((resolve) => {
    document.documentElement.dataset.nav = pattern;
    if (shortBlindHold) document.documentElement.dataset.blindHold = 'short';
    const transition = document.startViewTransition(async () => {
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
           snapped at the end of its transition (redesign ticket 25). See
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
        if (navigation.to) restoreScroll(navigation.to.url.pathname);
      } finally {
        /* The incoming screen has mounted and the outgoing one is gone.
           Before the new capture, so each name is on exactly one element
           when the browser looks, and after the scroll above, so the
           incoming field is measured where it will be drawn. */
        blind.swap();
      }
    });
    void transition.finished
      .catch(() => {})
      .finally(() => {
        delete document.documentElement.dataset.nav;
        delete document.documentElement.dataset.blindHold;
        blind.release();
      });
  });
}
