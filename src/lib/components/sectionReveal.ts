/* Bringing a section into view while it opens (phase 15 after-release
   ticket 04, audit UX-05).

   The entry editor's chip row is the last thing on its screen, so with the
   page scrolled to the end there is no room left to scroll when a chip is
   tapped. The section then grows from 0 under `disclose`, and a single
   smooth scroll asked for on the first frame was clamped by the browser to
   the room that existed at that moment: the opened Photos section ended
   92px under the foot and the tap looked like it did nothing.

   So the region follows the growth instead. Every frame of the disclosure,
   it moves by however much of the section has grown past the region's
   bottom, which is at most what the section grew that frame - exactly the
   room that growth added - so the browser never has a reason to clamp it.
   The section's bottom edge reads as pinned above the foot while the page
   over it rises on the disclosure's own clock. */

export interface RevealGeometry {
  sectionBottom: number;
  regionTop: number;
  regionBottom: number;
  /** The top of what must stay on screen: the chip row that was tapped. */
  anchorTop: number;
}

/** Clear space kept under the opened section. */
const GAP = 20;
/** How close the anchor may come to the region's top edge. */
const KEEP = 8;

/** How far to scroll on one frame; never negative. */
export function revealTravel({ sectionBottom, regionTop, regionBottom, anchorTop }: RevealGeometry): number {
  const overflow = sectionBottom + GAP - regionBottom;
  const room = anchorTop - regionTop - KEEP;
  return Math.max(0, Math.min(overflow, room));
}

/** Follows `section` open inside `region` until its animations finish,
    keeping `anchor` on screen. */
export function followReveal(section: HTMLElement, region: HTMLElement, anchor: HTMLElement): void {
  const started = performance.now();
  let frames = 0;
  const step = () => {
    frames++;
    if (!section.isConnected || !region.isConnected) return;
    const regionBox = region.getBoundingClientRect();
    const travel = revealTravel({
      sectionBottom: section.getBoundingClientRect().bottom,
      regionTop: regionBox.top,
      regionBottom: regionBox.bottom,
      anchorTop: anchor.getBoundingClientRect().top
    });
    if (travel > 0) region.scrollTop += travel;
    /* The first frames may land before the transition has started, and one
       frame past the last animation reads the settled height once more; a
       second's cap in case an animation never reports finishing. */
    const growing = section.getAnimations().some((a) => a.playState === 'running');
    if ((growing || travel > 0 || frames < 3) && performance.now() - started < 1000) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
