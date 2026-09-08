/* The outgoing screen, taken out of the DOM before the new side of a view
   transition is captured (phase 10 redesign ticket 25).

   SvelteKit resolves `navigation.complete` once the incoming page has
   rendered, and by then the outgoing page's component is unmounted - except
   that its nodes stay in the DOM until every outro on them has finished.
   Home and Look back carry tiles whose `transition:collapse|global` runs on
   the way out with `skip`, a zero-length outro, and a zero-length WAAPI
   animation still finishes on the next rendering step rather than now. The
   view transition's update callback runs with rendering paused, so that
   step never comes before the new capture: the browser photographs both
   screens stacked in one scroll region, the incoming field 239px down under
   the outgoing page's remains, and the transition then animates towards a
   picture that is wrong and cuts to the real layout when it ends (Alicja,
   2026-09-08, on the round-one flipbooks: "looks like today to today", "a
   complete yank between 25 and 26").

   Waiting is not an option for the same reason - a requestAnimationFrame or
   an animation's `finished` never resolves while rendering is paused, and
   the update callback times out. So the shell removes what is already dead:
   every top-level screen but the last. Svelte's own removal, when the
   outro's finished event does arrive, calls `remove()` on nodes that are
   already detached, which is a no-op. Held to that shape by
   outgoingScreen.test.ts. */

const SCREENS = '[data-app-scroll-region] .screen';

/** Removes every screen but the incoming one - the last in document order,
    which is where SvelteKit mounts the new page - and hands back how many
    went. Zero on the ordinary navigation, where the outgoing page has
    already left. */
export function dropOutgoingScreens(doc: Document = document): number {
  const screens = [...doc.querySelectorAll<HTMLElement>(SCREENS)].filter(
    (el) => !el.parentElement?.closest('.screen')
  );
  const outgoing = screens.slice(0, -1);
  for (const el of outgoing) el.remove();
  return outgoing.length;
}
