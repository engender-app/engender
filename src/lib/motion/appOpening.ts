/* The app opening for its owner (redesign ticket 34).

   Every other screen change in the app is a navigation, so `+layout.svelte`
   catches it in `onNavigate` and runs the blind over it. This one is not: a
   gate is not a route. It renders instead of the route, out of the `{#if}`
   chain in the layout, and it stops rendering the moment the secret is
   accepted - so the app arriving was a `{#if}` flipping, which the browser
   draws as one frame of gate and the next of Home.

   That moment is the one piece of motion in the product somebody sees
   hundreds of times, and a cut is what it was. So the state change that ends
   a gate runs inside a view transition here, with the same blind every
   navigation carries: the gate's field is short - the title and nothing else
   - and the app's is 175px of flag with a sun in it, so the edge opens
   downward, the wordmark rides down with it onto the place Home draws its
   own, and the page follows the edge instead of appearing under it.

   Nothing about the arrival is new machinery. `carryBlind` names both sides
   and publishes the two heights, app.css moves them, and `data-nav` says
   which pattern the two screens themselves take. What is new is only that
   there is no navigation to hang it on.

   The reverse - a gate arriving - deliberately does not come through here.
   A cold start has nothing to come from, and a mid-session lock arriving is
   the one state change whose whole value is being instant (GateScreen.svelte
   says why, at length). */

import { tick } from 'svelte';

import { carryBlind } from './fieldBlind';

/** What app.css keys the pattern off, the way a navigation's does. */
const PATTERN = 'open';

/**
 * Commits a state change that ends a gate, as a movement into the app.
 *
 * `commit` is called exactly once either way, so a browser without view
 * transitions - and a server, where there is no document at all - gets the
 * same state change without the animation, which is the same substitute
 * reduced motion asks for.
 *
 * Deliberately not awaited by its callers: what they own is the secret being
 * accepted, and the app is open the instant `commit` has run. Nothing waits
 * on the animation, which is what keeps AC "nothing added delays a person
 * typing a correct secret" true by construction rather than by measurement.
 */
export function openApp(commit: () => void, doc: Document | undefined = globalThis.document): void {
  if (!doc?.startViewTransition) {
    commit();
    return;
  }

  /* Before the old side is captured, and released when the transition is
     over: see $lib/motion/fieldBlind for why the name is handed over rather
     than written as a rule. */
  const blind = carryBlind(doc);
  const root = doc.documentElement;
  root.dataset.nav = PATTERN;

  const transition = doc.startViewTransition(async () => {
    try {
      commit();
      /* The gate is gone and the app has mounted, so the new side can be
         measured where it will be drawn. Before the new capture, which is
         what this callback resolving hands the browser. */
      await tick();
    } finally {
      blind.swap();
    }
  });

  void transition.finished
    /* A transition superseded by another - a lock landing on the frame the
       app opened, which lock-on-leave can genuinely do - rejects rather than
       resolves, and that is not a failure. Swallowed here for the reason the
       layout swallows a superseded navigation's: one unhandled rejection per
       aborted transition buries a real one, and the walkthrough fails a whole
       run on it. */
    .catch(() => {})
    .finally(() => {
      delete root.dataset.nav;
      blind.release();
    });
}
