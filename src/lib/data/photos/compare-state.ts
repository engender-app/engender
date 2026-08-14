import type { DatedPhoto } from '../journal/photos';

type CompareSide = 'left' | 'right';

const TWO_ANCHORS = 2;

function photoIndex(photos: DatedPhoto[]): Map<string, number> {
  return new Map(photos.map((photo, i) => [photo.id, i]));
}

export function orderAnchorsByJourney(selected: string[], photos: DatedPhoto[]): string[] {
  const index = photoIndex(photos);
  const present = selected.filter((id, i) => selected.indexOf(id) === i && index.has(id));
  return present.sort((a, b) => index.get(a)! - index.get(b)!);
}

export function toComparePair(selected: string[], photos: DatedPhoto[]): { left: number; right: number } | null {
  const ordered = orderAnchorsByJourney(selected, photos);
  if (ordered.length !== TWO_ANCHORS) return null;
  const index = photoIndex(photos);
  return { left: index.get(ordered[0])!, right: index.get(ordered[1])! };
}

export function toggleCompareAnchor(selected: string[], anchorId: string, photos: DatedPhoto[]): string[] {
  const ordered = orderAnchorsByJourney(selected, photos);
  if (!photos.some((photo) => photo.id === anchorId)) return ordered;
  if (ordered.includes(anchorId)) return ordered.filter((id) => id !== anchorId);
  if (ordered.length < TWO_ANCHORS) return orderAnchorsByJourney([...ordered, anchorId], photos);
  return orderAnchorsByJourney([ordered[1], anchorId], photos);
}

export function stepCompareAnchor(
  selected: string[],
  side: CompareSide,
  delta: -1 | 1,
  photos: DatedPhoto[]
): string[] {
  const pair = toComparePair(selected, photos);
  if (!pair) return orderAnchorsByJourney(selected, photos);

  if (side === 'left') {
    const nextLeft = pair.left + delta;
    if (nextLeft < 0 || nextLeft >= pair.right) return [photos[pair.left].id, photos[pair.right].id];
    return [photos[nextLeft].id, photos[pair.right].id];
  }

  const nextRight = pair.right + delta;
  if (nextRight <= pair.left || nextRight >= photos.length) return [photos[pair.left].id, photos[pair.right].id];
  return [photos[pair.left].id, photos[nextRight].id];
}