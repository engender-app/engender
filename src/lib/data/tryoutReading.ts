/* What a tryout is, right now (phase 10 redesign ticket 53, DIRECTION.md
   rule 16). Pure, and kept above the journal seam beside procedureRail.ts
   and careSpine.ts for those modules' reason: nothing here is stored, which
   day is "today" is a local calendar question the data layer has no
   business answering, and putting several days on one line is arithmetic
   that wants one home with tests while the wording stays with the screen.

   A tryout has no pivot. A procedure is read out from its date - consults
   behind it, healing after it - so procedureRail anchors on that date and
   compresses the far days under a root scale. A tryout is a stretch with
   one end still open, and every day inside it is the same kind of day, so
   the scale here is linear from the first day to the last and a length
   along it is a length of time. That is the whole of the difference from
   that module, and it is why this is its own rather than an option on it.

   ## What this refuses to compute

   No average, no score, no verdict (ADR-0012: a felt-sense reading is
   drawn, never averaged into a verdict). The app does not decide whether a
   name suited somebody, so there is nothing here that reduces several
   readings to one, nothing that calls a direction good, and no trend line
   fitted through them. The reference sweep for this ticket found all three
   in the wild - two journals smooth a fortnight of moods into one curve,
   one prints a "dominant mood", one opens on a completion rate - and each
   is a claim about days nobody wrote anything on.

   What it does compute is where each reading falls in time and where it
   falls on the scale it was chosen from, which is the reading itself and
   nothing added to it. Joining consecutive marks is the screen's business
   (TryoutFeltSenseArc.svelte says what that line may and may not mean). */

import type { FeltSenseEntry, Tryout } from './types';

/** The felt-sense scale's ends (feltSense.ts validates the same 1..5 on the
    way in, and vocabulary/labels.ts names each step). Both ends are named
    here so `level` reads as a position on a known scale rather than as
    arithmetic with two bare numbers in it. */
const MOOD_LOW = 1;
const MOOD_HIGH = 5;

export interface TryoutFeltMark {
  /** The entry's own id, so an `{#each}` keys on it and a reading added or
      deleted moves the marks either side of it rather than redrawing the
      whole line. */
  id: string;
  /** The day it was recorded, never clamped. */
  epochDay: number;
  /** The step that was chosen, 1 to 5. Carried through unchanged so the
      screen can name it - the drawing is a position, the label is a word,
      and neither is a number this module invented. */
  mood: number;
  /** Where it is drawn along the span, 0 at its first day and 1 at its
      last. */
  position: number;
  /** Where it is drawn up the scale, 0 at the lowest step and 1 at the
      highest. Not a score: no end of this is the good end, which is why
      the scale has a middle (`neutralLevel`) and no direction. */
  level: number;
  /** True where the day fell outside the tryout's own span, so the mark is
      drawn at the end it was pulled in to and the screen can say the line
      does not reach it. Possible because a tryout's start and end are both
      editable after its readings were written. */
  beyondSpan: boolean;
}

export interface TryoutReading {
  /** No end day set. */
  running: boolean;
  fromEpochDay: number;
  /** Today while it runs, its end day once it has ended. */
  toEpochDay: number;
  /** How many days it has run for, counting the first day as day one. */
  dayCount: number;
  /** Oldest first. */
  marks: TryoutFeltMark[];
  /** The most recent reading's day, or null where there are none. */
  latestEpochDay: number | null;
  /** Where the middle step of the scale sits, which is where the drawing's
      own guide goes. A constant, exported through the reading so a screen
      draws the guide from the same source the marks are placed against. */
  neutralLevel: number;
}

export function tryoutReading(
  tryout: Tryout,
  entries: readonly FeltSenseEntry[],
  todayEpochDay: number
): TryoutReading {
  const running = tryout.endEpochDay == null;
  const fromEpochDay = tryout.startEpochDay;
  /* Never behind the start. A tryout can be dated to begin next week - the
     editor takes any date - and a span running backwards would draw every
     mark past its own right end and report a negative length. It collapses
     onto its first day instead, which reads as day one of something that
     has not got going yet, and the range the screen writes out beside it
     still says which date that is. */
  const toEpochDay = Math.max(fromEpochDay, tryout.endEpochDay ?? todayEpochDay);
  const span = toEpochDay - fromEpochDay;

  const marks: TryoutFeltMark[] = entries
    .map((entry) => ({
      id: entry.id,
      epochDay: entry.epochDay,
      mood: entry.mood,
      /* A span one day wide has no distance to divide by, so a reading is
         placed by which side of the day it fell on: one dated before the
         start goes to the left end and everything else to the right, which
         is the same "drawn at the end it was pulled in to" `beyondSpan`
         below promises. Pinning every one of them to the right end drew a
         reading written before the tryout began as though it came after
         it. */
      position:
        span === 0
          ? (entry.epochDay < fromEpochDay ? 0 : 1)
          : (Math.min(Math.max(entry.epochDay, fromEpochDay), toEpochDay) - fromEpochDay) / span,
      level: (entry.mood - MOOD_LOW) / (MOOD_HIGH - MOOD_LOW),
      beyondSpan: entry.epochDay < fromEpochDay || entry.epochDay > toEpochDay
    }))
    .sort((a, b) => a.epochDay - b.epochDay);

  return {
    running,
    fromEpochDay,
    toEpochDay,
    dayCount: span + 1,
    marks,
    latestEpochDay: marks.length ? marks[marks.length - 1].epochDay : null,
    neutralLevel: 0.5
  };
}
