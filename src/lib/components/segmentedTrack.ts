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

/** How much of the strip each chevron hint covers (`.segmented-hint` in
    components.css, whose width a test holds to this number). The hint is a
    fade with its own ground, and on Wrapped's cadence tabs at 390px that
    ground covered the last letter of a selected "Last year" that this
    function had brought "into view" flush against the edge (last-audit UI
    ticket 26). */
export const SCROLL_HINT_WIDTH = 26;

/** The horizontal position the strip should be at for `segment` to be fully
    inside it and clear of the chevron hints, moving as little as possible -
    and the position it is already at when the segment is already there.

    A hint is drawn on an edge only while there is more of the strip past
    it, so neither end of the scroll range needs room for one. Clamping to
    that range is what gives the first and last segments their edges back.

    Both boxes are read in the strip's own coordinates, which is what
    `offsetLeft` gives while the strip is the segment's offset parent - the
    same measurement the sliding pill is placed from. */
export function nearestScrollLeft(
  track: { scrollLeft: number; clientWidth: number; scrollWidth: number },
  segment: { offsetLeft: number; offsetWidth: number }
): number {
  const start = segment.offsetLeft;
  const end = start + segment.offsetWidth;
  const furthest = Math.max(0, track.scrollWidth - track.clientWidth);
  const clamp = (left: number) => Math.min(Math.max(left, 0), furthest);

  /* A segment too wide to fit shows its start rather than its end: the
     label reads from the left, and there is no position that shows both. */
  if (segment.offsetWidth >= track.clientWidth) return clamp(start);

  let left = track.scrollLeft;
  if (end > left + track.clientWidth - SCROLL_HINT_WIDTH) left = end + SCROLL_HINT_WIDTH - track.clientWidth;
  /* Second, so a segment too wide to clear both hints keeps its start
     clear, for the same reason as above. */
  if (start < left + SCROLL_HINT_WIDTH) left = start - SCROLL_HINT_WIDTH;
  return clamp(left);
}
