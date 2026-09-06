/* The voice compare picker's state (ticket 25), mirroring
   photos/compare-state.ts's rules exactly - "no change to the underlying
   photo compare mode" (the ticket's own out-of-scope line) is what rules
   out reusing that module directly rather than a parallel one shaped the
   same way over DatedRecording instead of DatedPhoto.

   Generic over the anchor shape (ticket 16): a benchmark is a second kind of
   anchor the same surface compares, and all this module needs of either
   kind is an id and a day - it never reads a recording's file name or a
   benchmark's acoustic figures. */

type CompareSide = 'left' | 'right';

/* DatedAnchor stays exported only for its own test (AU-09 test-only review). */
export interface DatedAnchor {
  id: string;
  epochDay: number;
}

const TWO_ANCHORS = 2;

function recordingIndex<T extends DatedAnchor>(recordings: T[]): Map<string, number> {
  return new Map(recordings.map((recording, i) => [recording.id, i]));
}

export function orderAnchorsByJourney<T extends DatedAnchor>(selected: string[], recordings: T[]): string[] {
  const index = recordingIndex(recordings);
  const present = selected.filter((id, i) => selected.indexOf(id) === i && index.has(id));
  return present.sort((a, b) => index.get(a)! - index.get(b)!);
}

export function toComparePair<T extends DatedAnchor>(
  selected: string[],
  recordings: T[]
): { left: number; right: number } | null {
  const ordered = orderAnchorsByJourney(selected, recordings);
  if (ordered.length !== TWO_ANCHORS) return null;
  const index = recordingIndex(recordings);
  return { left: index.get(ordered[0])!, right: index.get(ordered[1])! };
}

export function toggleCompareAnchor<T extends DatedAnchor>(selected: string[], anchorId: string, recordings: T[]): string[] {
  const ordered = orderAnchorsByJourney(selected, recordings);
  if (!recordings.some((recording) => recording.id === anchorId)) return ordered;
  if (ordered.includes(anchorId)) return ordered.filter((id) => id !== anchorId);
  if (ordered.length < TWO_ANCHORS) return orderAnchorsByJourney([...ordered, anchorId], recordings);
  return orderAnchorsByJourney([ordered[1], anchorId], recordings);
}

export function stepCompareAnchor<T extends DatedAnchor>(
  selected: string[],
  side: CompareSide,
  delta: -1 | 1,
  recordings: T[]
): string[] {
  const pair = toComparePair(selected, recordings);
  if (!pair) return orderAnchorsByJourney(selected, recordings);

  if (side === 'left') {
    const nextLeft = pair.left + delta;
    if (nextLeft < 0 || nextLeft >= pair.right) return [recordings[pair.left].id, recordings[pair.right].id];
    return [recordings[nextLeft].id, recordings[pair.right].id];
  }

  const nextRight = pair.right + delta;
  if (nextRight <= pair.left || nextRight >= recordings.length) return [recordings[pair.left].id, recordings[pair.right].id];
  return [recordings[pair.left].id, recordings[nextRight].id];
}
