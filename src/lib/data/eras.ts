/* Pure logic for the Era (phase 6 ticket 01, ADR-0049, CONTEXT: "Era") - a
   named stretch of the person's own timeline, carrying a name and two
   bounds either of which may be absent.

   Kept apart from journal/eras.ts (the CRUD area) the same way
   journalingPause.ts sits beside journal/journalingPauses.ts: the two
   invariants below have to be answerable by the editor while someone is
   still typing, and by the area before it writes, and those are the same
   rule rather than two copies of it drifting apart.

   The invariants are enforced here rather than as a schema constraint, the
   way assertValidRule guards a reminder rule: neither of them is expressible
   as a CHECK over one row, and a constraint violation surfacing from the
   driver names a table rather than the era it collided with.

   eraCoversDay delegates to span.ts's spanCoversDay (phase 8 deepening
   ticket 11) - a domain name reads better than spanCoversDay(era, day) at
   this file's call sites, but the arithmetic lives once. */

import { spanCoversDay } from './span';

/** An era, or the draft of one. `id` is absent while it is being created,
    which is also what tells `eraConflict` there is nothing to exclude. */
export interface EraSpan {
  id?: string;
  name: string;
  /** Absent means the era reaches back before the journal does. */
  startEpochDay: number | null;
  /** Absent means the era is still running, the same way a JournalingPause
      and a RegimenEpisode say it. */
  endEpochDay: number | null;
}

/** Whether `day` falls inside the era. Both bounds are inclusive, and an
    absent one is unbounded in that direction. */
export function eraCoversDay(era: EraSpan, day: number): boolean {
  return spanCoversDay(era, day);
}

/** Which era a day falls in, or none. A day in no era is a resting state
    rather than a gap to fill (ADR-0049), so the caller gets null and not a
    placeholder.

    The first era covering the day, which the no-overlap invariant makes the
    only one - except after a merge, which can land two overlapping eras on
    purpose (archiveSections.ts). This still answers with exactly one there,
    which is what keeps a filtered read total while the person sorts the
    overlap out on /transition/eras. */
export function eraForDay<T extends EraSpan>(eras: readonly T[], day: number): T | null {
  return eras.find((era) => eraCoversDay(era, day)) ?? null;
}

/** Why an era cannot be written as it stands.

    `openStart` and `openEnd` are overlaps too - two eras that both reach
    back forever share every day before the earlier one's end - but they are
    reported apart because "only one era can have no start" is the thing the
    person did, and "this overlaps first year" is not how it looks to them. */
type EraConflict =
  | { kind: 'inverted' }
  | { kind: 'openStart'; with: EraSpan }
  | { kind: 'openEnd'; with: EraSpan }
  | { kind: 'overlap'; with: EraSpan };

/** What stops `candidate` joining `existing`, or null when nothing does.
    An era already in `existing` under the same id is the one being edited
    and is not counted against itself. */
export function eraConflict(existing: readonly EraSpan[], candidate: EraSpan): EraConflict | null {
  if (
    candidate.startEpochDay !== null &&
    candidate.endEpochDay !== null &&
    candidate.endEpochDay < candidate.startEpochDay
  ) {
    // Reported before anything else: until the two bounds are the right way
    // round there is no range for an overlap to be about.
    return { kind: 'inverted' };
  }

  const others = existing.filter((era) => era.id === undefined || era.id !== candidate.id);

  if (candidate.startEpochDay === null) {
    const other = others.find((era) => era.startEpochDay === null);
    if (other) return { kind: 'openStart', with: other };
  }
  if (candidate.endEpochDay === null) {
    const other = others.find((era) => era.endEpochDay === null);
    if (other) return { kind: 'openEnd', with: other };
  }

  const other = others.find((era) => spansOverlap(era, candidate));
  return other ? { kind: 'overlap', with: other } : null;
}

/** The write-side guard, so an era that skipped the editor cannot reach the
    table. One sentence naming what it collided with - the discriminant is not
    the message, because an error reading `era "x" openStart "y"` says less
    than the type it was read off. */
export function assertEraFits(existing: readonly EraSpan[], candidate: EraSpan): void {
  const conflict = eraConflict(existing, candidate);
  if (!conflict) return;
  const era = `era "${candidate.name}"`;
  if (conflict.kind === 'inverted') throw new Error(`${era} ends before it starts`);
  const other = `"${conflict.with.name}"`;
  if (conflict.kind === 'openStart') throw new Error(`${era} has no start, and neither does ${other}`);
  if (conflict.kind === 'openEnd') throw new Error(`${era} has no end, and neither does ${other}`);
  throw new Error(`${era} overlaps ${other}`);
}

function spansOverlap(a: EraSpan, b: EraSpan): boolean {
  const aStartsAfterBEnds = a.startEpochDay !== null && b.endEpochDay !== null && a.startEpochDay > b.endEpochDay;
  const bStartsAfterAEnds = b.startEpochDay !== null && a.endEpochDay !== null && b.startEpochDay > a.endEpochDay;
  return !aStartsAfterBEnds && !bStartsAfterAEnds;
}

/** The journal's own edges, which is what an open bound resolves against. */
export interface JournalBounds {
  firstEpochDay: number;
  lastEpochDay: number;
}

/** The concrete range a surface needing two dates reads an era as: an open
    bound takes the journal's own edge, and neither the clamp nor the bound
    it replaced is ever stored (ADR-0010) - an era is unbounded, the journal
    is not, and a stored clamp would be wrong again the next time someone
    writes an entry.

    Null when the era holds no day the journal has data for, which "before I
    knew" is on a journal whose first entry came after it ended. There is no
    range to hand back there, and inventing an inverted one would be worse
    than saying so. */
export function eraRange(era: EraSpan, bounds: JournalBounds): { startEpochDay: number; endEpochDay: number } | null {
  const startEpochDay = era.startEpochDay ?? bounds.firstEpochDay;
  const endEpochDay = era.endEpochDay ?? bounds.lastEpochDay;
  if (startEpochDay > endEpochDay) return null;
  return { startEpochDay, endEpochDay };
}

/** The same range, for a caller whose journal bounds might not be known yet
    - `getJournalBounds()` read as a liveQuery is null both while it loads
    and on a journal with no entries at all, and every adopting surface
    (`/compare`, Wrapped) hits that same moment on first paint.

    A fully-dated era needs no edge to clamp to, so it still resolves with
    no bounds in hand; an open one does, and answers null without them - the
    same "nothing to resolve" `eraRange` already gives an era that outruns
    the journal, one call earlier. */
export function eraRangeOrNull(
  era: EraSpan,
  bounds: JournalBounds | null
): { startEpochDay: number; endEpochDay: number } | null {
  const resolved =
    bounds ??
    (era.startEpochDay !== null && era.endEpochDay !== null
      ? { firstEpochDay: era.startEpochDay, lastEpochDay: era.endEpochDay }
      : null);
  return resolved ? eraRange(era, resolved) : null;
}
