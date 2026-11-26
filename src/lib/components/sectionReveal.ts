/* Follow the section as disclose opens. An initial scroll request
   can clamp at the current content height and leave part of the
   open section under the foot. On each frame scroll by the new
   overflow below the viewport, using the room the growth added. */

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
  /* A finger or a wheel on the region takes the scroll back: the follow
     never fights a person who has started scrolling themselves. */
  let released = false;
  const release = () => (released = true);
  const inputs = ['wheel', 'touchstart', 'pointerdown'] as const;
  for (const type of inputs) region.addEventListener(type, release, { once: true, passive: true });
  const stop = () => {
    for (const type of inputs) region.removeEventListener(type, release);
  };
  const step = () => {
    frames++;
    if (released || !section.isConnected || !region.isConnected) return stop();
    const regionBox = region.getBoundingClientRect();
    const travel = revealTravel({
      sectionBottom: section.getBoundingClientRect().bottom,
      regionTop: regionBox.top,
      regionBottom: regionBox.bottom,
      anchorTop: anchor.getBoundingClientRect().top
    });
    const before = region.scrollTop;
    if (travel > 0) region.scrollTop += travel;
    /* Clamped: the region has no room left, and asking again every frame
       until the cap would change nothing. */
    const stuck = travel > 0 && region.scrollTop === before;
    /* The first frames may land before the transition has started, and one
       frame past the last animation reads the settled height once more; a
       second's cap in case an animation never reports finishing. */
    const growing = section.getAnimations().some((a) => a.playState === 'running');
    if ((growing || (travel > 0 && !stuck) || frames < 3) && performance.now() - started < 1000) requestAnimationFrame(step);
    else stop();
  };
  requestAnimationFrame(step);
}
