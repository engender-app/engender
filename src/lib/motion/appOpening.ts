/* Unlock is a layout state change rather than navigation. Wrap it in a view
   transition so carryBlind and app.css can move the short gate field down
   to the app's 175px field, carrying the gate title while Today's sun stays
   still. data-nav selects each screen's motion.

   Cold start has no outgoing screen. Showing a gate during a mid-session
   lock stays instant; see GateScreen.svelte. */

import { tick } from 'svelte';

import { carryBlind } from './fieldBlind';
import { endScreenArrival } from './reveal';

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
 * Hands back a promise that settles when the opening is over, which is what
 * a caller holding "the app is opening" reads - the surfaces whose own reads
 * answer during it wait for that rather than arriving in a frame the browser
 * is not painting (see `ui.appOpening`). Nothing waits on it before the app
 * is open: `commit` has already run by then, which is what keeps "nothing
 * added delays a person typing a correct secret" true by construction.
 */
export function openApp(
  commit: () => void,
  doc: Document | undefined = globalThis.document
): Promise<void> {
  if (!doc?.startViewTransition) {
    commit();
    return Promise.resolve();
  }

  /* Before the old side is captured, and released when the transition is
     over: see $lib/motion/fieldBlind for why the name is handed over rather
     than written as a rule. */
  /* An unlock without disguise draws Today's own sun, at Today's size in Today's corner.
     Held, its rings stay unnamed on both sides and ride each side's blind capture, so the
     two photographs of the sun are the same picture in the same place and the field opens
     around one sun - rather than the gate's closing ring by ring while Today's opens. Read
     before the gate goes. */
  const holdSun = !!doc.querySelector('[data-gate-frame][data-gate-sun]');
  const blind = carryBlind(doc, { holdSun });
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

  /* `ready` rejects too when the transition is skipped, and nothing reads it
     but this. */
  void transition.ready.catch(() => {});
  return transition.finished
    /* A transition superseded by another - a lock landing on the frame the
       app opened, which an immediate lock can genuinely do - rejects rather than
       resolves, and that is not a failure. Swallowed here for the reason the
       layout swallows a superseded navigation's: one unhandled rejection per
       aborted transition buries a real one, and the walkthrough fails a whole
       run on it. */
    .catch(() => {})
    .finally(() => {
      delete root.dataset.nav;
      blind.release();
      /* The screen has stopped moving, so anything that lands from here on
         is a change within it rather than part of it arriving. Said out loud
         because this arrival outlasts the arrival window by more than twice
         its length, and the boot marks a fresh one part-way through it when
         the journal finishes opening: without this the first panel to answer
         after the app opened appeared in a single frame (reveal.ts's
         `endScreenArrival`). */
      endScreenArrival();
    });
}

/**
 * Commits a boot failure over the screen that was drawn while it booted, or a
 * retry leaving one.
 *
 * A cold start renders the route while the journal opens, so Today is on
 * screen by the time an open can fail, and the failure replaces it with the
 * notice alone; a retry puts the route back. As bare state changes those were
 * one screen gone and the other there in the same frame. This runs them as
 * the tabs' fade-through instead: one screen settles out, the other comes in,
 * and the notice, which is outside the named screen, crossfades in the root
 * group.
 */
export function crossBootFailure(
  commit: () => void,
  doc: Document | undefined = globalThis.document
): Promise<void> {
  if (!doc?.startViewTransition) {
    commit();
    return Promise.resolve();
  }
  const root = doc.documentElement;
  root.dataset.nav = 'fade-through';
  const transition = doc.startViewTransition(async () => {
    commit();
    await tick();
  });
  /* Superseded rejects rather than resolves, as for openApp above, `ready`
     included. */
  void transition.ready.catch(() => {});
  return transition.finished.catch(() => {}).finally(() => {
    delete root.dataset.nav;
  });
}
