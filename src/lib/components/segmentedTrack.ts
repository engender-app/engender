/* Keeping a segmented control's active segment inside its own strip.

   Segmented.svelte used to do this with
   `target.scrollIntoView({ inline: 'nearest', block: 'nearest' })`, and its
   comment said that never touches the page's own scroll. That is true only
   while the control is already on screen. `block: 'nearest'` on an element
   below the fold scrolls every scrollable ancestor the minimum needed to
   bring it into view, and the app's scroll region is one of those - so
   arriving on a screen whose switcher sits under a long list scrolled the
   whole screen down to the switcher, on mount, before the person had
   touched anything (found by phase 8 features ticket 66, whose batched list
   then read that scroll as "they are at the end already" and rendered
   everything).

   Moving the strip's own `scrollLeft` is what the control actually wanted,
   and it cannot move an ancestor at all. Here rather than in the component
   so the arithmetic has tests: what went wrong the first time was a claim
   about behaviour that nothing checked. */

/** The horizontal position the strip should be at for `segment` to be fully
    inside it, moving as little as possible - and the position it is already
    at when the segment is already inside.

    Both boxes are read in the strip's own coordinates, which is what
    `offsetLeft` gives while the strip is the segment's offset parent - the
    same measurement the sliding pill is placed from. */
export function nearestScrollLeft(
  track: { scrollLeft: number; clientWidth: number },
  segment: { offsetLeft: number; offsetWidth: number }
): number {
  const start = segment.offsetLeft;
  const end = start + segment.offsetWidth;

  /* A segment too wide to fit shows its start rather than its end: the
     label reads from the left, and there is no position that shows both. */
  if (segment.offsetWidth >= track.clientWidth) return start;

  if (start < track.scrollLeft) return start;
  if (end > track.scrollLeft + track.clientWidth) return end - track.clientWidth;
  return track.scrollLeft;
}
