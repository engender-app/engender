/** Everything below is about ids and positions in a list, never about what
    a photograph holds, so the list it reads is anything with an id: the
    journal's own photos on `/media/photos` and a hair progress photo on
    `/body/hair-progress`, which are two different rows of two different
    tables wanting the same answer. */
type Identified = { id: string };

/** Which two photographs of a list are being compared, by index: the earlier
    one on the left of the wipe and the later one on its right
    (PhotoWipe.svelte). Indices rather than ids because both callers of the
    wipe already hold the list, and "the one before this" is a question about
    the list rather than about either photograph. */
export interface ComparePair {
  left: number;
  right: number;
}

export type CompareSide = 'left' | 'right';

const TWO_ANCHORS = 2;

function photoIndex(photos: Identified[]): Map<string, number> {
  return new Map(photos.map((photo, i) => [photo.id, i]));
}

export function orderAnchorsByJourney(selected: string[], photos: Identified[]): string[] {
  const index = photoIndex(photos);
  const present = selected.filter((id, i) => selected.indexOf(id) === i && index.has(id));
  return present.sort((a, b) => index.get(a)! - index.get(b)!);
}

export function toComparePair(selected: string[], photos: Identified[]): ComparePair | null {
  const ordered = orderAnchorsByJourney(selected, photos);
  if (ordered.length !== TWO_ANCHORS) return null;
  const index = photoIndex(photos);
  return { left: index.get(ordered[0])!, right: index.get(ordered[1])! };
}

/** The pair one press of an earlier/later control lands on, or null where
    that press has nowhere to go - which is also what disables the control,
    so the two questions have one answer rather than two that can disagree.

    The sides never cross and never meet: the earlier photograph stays
    earlier. A wipe between a photograph and itself compares nothing, and a
    wipe whose left side is the later one would put the journey backwards
    without saying so. */
export function stepPair(
  pair: ComparePair,
  side: CompareSide,
  delta: -1 | 1,
  count: number
): ComparePair | null {
  if (side === 'left') {
    const left = pair.left + delta;
    if (left < 0 || left >= pair.right) return null;
    return { left, right: pair.right };
  }

  const right = pair.right + delta;
  if (right <= pair.left || right >= count) return null;
  return { left: pair.left, right };
}

/** The two photographs a screen opens the wipe on when nobody has picked a
    pair yet: the oldest and the newest, which is the widest comparison the
    list holds and the one an area screen is asking about when it opens
    (DIRECTION.md rule 16). Null with fewer than two, where there is nothing
    to compare.

    Not a pairing rule in ADR-0012's sense - nothing here matches poses,
    faces or framing, and both ends move under the person's own controls the
    moment they touch them. */
export function openingPair(count: number): ComparePair | null {
  return count < TWO_ANCHORS ? null : { left: 0, right: count - 1 };
}
