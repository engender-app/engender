# What is coming up is one read, and five kinds of fact earn a mark

Status: Accepted
Decided: 2026-09-06
Last reviewed: 2026-11-02
Supersedes: none

The app knows many future days. There is one read for them, it is not the
care spine, and most of those days do not get drawn.

**One read.** `dayAhead(from, to)` in `src/lib/data/journal/dayAhead.ts` is
a registry in the shape `day.ts` and `lastWrite.ts` share: a key, the
tables touched, a read and an opt-out record naming every excluded area
with a reason. It takes a range, because the calendar asks for a month,
Today for a week and a day view for one day.

**Five kinds earn a mark** (`DAY_AHEAD_MARK_KINDS`): an appointment, a
surgery date, a milestone whose day is ahead, a letter's unlock day, and a
dose slot only where the schedule is not daily.

**Other kinds do not**, each with a reason in the opt-out: a medication
run-out day, a reminder, a daily dose slot, a taper's expected sessions
and the next fixed-position hair photo.

**A mark is a day and a kind**, never a countdown, due date or verdict.

## Why

Everything the app draws looks backwards, while the surgery date, the
letter unlock, the appointment and Thursday's injection are already in the
database.

**Not a wider care spine.** `careSpine.ts` is a forward composite, but its
marks are all medication and its header says none is late or due.
Widening it puts a court hearing on a medication rail. A sibling registry
is this repo's pattern, and the spine becomes one consumer of the read.

**The test** is whether a fact is a day somebody would look for on a
calendar or a derived state that only looks like one.

A run-out day is a projection off a trailing rate and moves when
consumption moves, so it reads as a date and is not one. `/care` carries
it where its nature is legible. A reminder is already a notification, and
drawing it turns the calendar into a to-do list of a transition. Daily dose
slots and taper sessions put a mark on every day, which is wallpaper, while
a weekly injection is a real calendar fact. A hair photo schedule refuses
due framing (`hairRemovalSchedule.ts`) and a calendar mark is a due date
whatever the copy says.

**Letter unlock earns a mark** because a letter is written deliberately to
a future self with a chosen date, and the mark never says which letter.

## Consequences

The calendar keeps one grid. A future day cannot carry heat, so heat and
marks never collide in a cell. Future cells become links, and the month
stepper stays unclamped.

`/day/[day]` branches on whether the day is after today. A future day reads
`dayAhead`, today shows both with what is coming first, a past day is
untouched.

Today draws the same read as the agenda. Home's live tiles
are separate (ADR-0073), and an appointment on today's date is the
agenda's today row, not a tile.

Nothing new is stored. Every fact behind a mark is an existing column or a
schedule that already computes (ADR-0010). A fact needing a new column is
not a mark, which is why the roadmap and hair removal contribute nothing.

**Where a gap may be stated.** A gap such as "in 12 days" is allowed on an
area's own screen and on that area's hub or pinned row, because the person
went there to read about it and it is arithmetic off the printed date. It
is not allowed on a calendar mark, which keeps its day and kind. Stock
keeps its date alone, since a countdown on a projection states confidence
the arithmetic lacks. A gap makes nothing late, due or ranked, and is never
coloured by distance (ADR-0012). One function formats every gap, `gapTo` in
`src/lib/data/vocabulary/hubLabels.ts`, so a row and its screen cannot
disagree.

## Considered and rejected

- **Widening `careSpine`.** Fewer files and a worse screen.
- **A forward horizon constant.** A range is what callers want.
- **A separate future calendar or a past/future toggle.** The grid already
  separates them.
- **A "you have an appointment tomorrow" notification.** What is coming is
  found on opening the app, never a reason to open it.
- **Any progress reading over forward items**, such as how many are left.

History: decided 2026-09-06; gap amendment 2026-09-16 folded in; revisits removed from the opt-outs 2026-10; refreshed 2026-11-02.