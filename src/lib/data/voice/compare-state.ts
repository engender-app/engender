/* The voice compare picker's state (ticket 25), mirroring
   photos/compare-state.ts's rules exactly - "no change to the underlying
   photo compare mode" (the ticket's own out-of-scope line) is what rules
   out reusing that module directly rather than a parallel one shaped the
   same way over DatedRecording instead of DatedPhoto. */

import type { DatedRecording } from '../journal/voiceRecordings';

type CompareSide = 'left' | 'right';

const TWO_ANCHORS = 2;

function recordingIndex(recordings: DatedRecording[]): Map<string, number> {
  return new Map(recordings.map((recording, i) => [recording.id, i]));
}

export function orderAnchorsByJourney(selected: string[], recordings: DatedRecording[]): string[] {
  const index = recordingIndex(recordings);
  const present = selected.filter((id, i) => selected.indexOf(id) === i && index.has(id));
  return present.sort((a, b) => index.get(a)! - index.get(b)!);
}

export function toComparePair(selected: string[], recordings: DatedRecording[]): { left: number; right: number } | null {
  const ordered = orderAnchorsByJourney(selected, recordings);
  if (ordered.length !== TWO_ANCHORS) return null;
  const index = recordingIndex(recordings);
  return { left: index.get(ordered[0])!, right: index.get(ordered[1])! };
}

export function toggleCompareAnchor(selected: string[], anchorId: string, recordings: DatedRecording[]): string[] {
  const ordered = orderAnchorsByJourney(selected, recordings);
  if (!recordings.some((recording) => recording.id === anchorId)) return ordered;
  if (ordered.includes(anchorId)) return ordered.filter((id) => id !== anchorId);
  if (ordered.length < TWO_ANCHORS) return orderAnchorsByJourney([...ordered, anchorId], recordings);
  return orderAnchorsByJourney([ordered[1], anchorId], recordings);
}

export function stepCompareAnchor(
  selected: string[],
  side: CompareSide,
  delta: -1 | 1,
  recordings: DatedRecording[]
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
