/* Adjust the segmented strip's own scrollLeft. scrollIntoView can
   scroll all ancestors, even with block: 'nearest'. A mount below
   a long list could scroll the page and trigger extra list
   batches before someone interacts. */

/** How much of the strip each chevron hint covers (`.segmented-hint` in
    components.css, whose width a test holds to this number). The hint is a
    fade with its own ground, and on Wrapped's cadence tabs at 390px that
    ground covered the last letter of a selected "Last year" that this
    function had brought "into view" flush against the edge. */
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
  if (start < left + SCROLL_HINT_WIDTH) left = start - SCROLL_HINT_WIDTH;
  left = clamp(left);

  /* Whether that cleared it, with a hint assumed on every edge that is not
     an end of the range. A segment wider than the window less two hints
     cannot clear both, as Wrapped's "Miniony miesiąc" could not at 144px
     in a 145px track at the 200%-zoom width before its labels became one
     word each. Centred, the two hints cover it evenly,
     which keeps its label whole wherever its own 18px of padding can
     absorb the overlap; pinned to one side, the other hint took all of it. */
  const startRoom = left > 0 ? SCROLL_HINT_WIDTH : 0;
  const endRoom = left < furthest ? SCROLL_HINT_WIDTH : 0;
  const cleared = start >= left + startRoom && end <= left + track.clientWidth - endRoom;
  return cleared ? left : clamp(start + segment.offsetWidth / 2 - track.clientWidth / 2);
}
