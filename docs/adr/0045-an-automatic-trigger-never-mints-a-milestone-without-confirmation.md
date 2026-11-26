# An automatic trigger never mints a milestone without confirmation

Status: Accepted
Decided: 2026-08-31
Last reviewed: 2026-11-02
Supersedes: ADR-0086 (merged in)

No automatic trigger writes a record the person did not confirm. A flow that
infers a milestone should exist (ticking a roadmap goal, reaching surgery day,
adopting a tryout) opens a confirmation sheet pre-filled from the trigger and
writes only when the person confirms or edits and confirms. Declining leaves
the triggering state alone, and nothing is retried later. One narrow case is
not an inference: an instruction the person gave in advance. A dose schedule
may be switched on to log its own doses. That switch is the confirmation,
given once, in words that say what will be written, and every row it writes
carries `source: 'schedule'`.

## Why milestones ask

A milestone is a claim about the person's own timeline, not a bookkeeping row.
Minting one from "this looks like it should be a milestone" can get the date,
title or moment wrong, and a wrong entry on a transition timeline is worse
than a missing one: it has to be found and deleted, where a missed one is
just added. Confirmation also gives the one thing an automatic write cannot,
the choice not to mark the moment.

Every offer is declared in one list, `src/lib/data/offers.ts`: its trigger, the
single record it offers, its copy, and the write, which goes through the owning
area's own method. A new offer declares itself there, and no trigger calls the
milestone write path directly. Each confirmed link is recorded
(`roadmapGoalKey`, `procedureId`, the tryout's own link) so a repeating trigger
never offers the same source twice.

A milestone holds no felt-sense readings. The tryout adoption sheet still shows
how the tryout mostly felt, as a line about the tryout, and writes nothing from
it.

## The auto-logged dose

A schedule switched on writes one `taken` dose for each slot it still owes, up
to and including yesterday, from a housekeeping pass at boot. A dose event's
`source` is `'person'` or `'schedule'`, a field of its own and not a fourth
`DoseStatus`. The switch is one nullable day on the schedule,
`autoLogFromEpochDay`: the day it was turned on, or null for off. Six rules
make it safe:

1. **The person opts in per schedule**, in words that say what will be written:
   each expected dose is recorded as taken at its usual time unless they log it
   or mark it skipped, and any of them can be undone.
2. **Nothing is written before the day they asked.** Turning the switch off and
   on months later starts from the new day and fills no gap.
3. **Nothing is written for today.** A slot is written once its day has ended,
   so the app never asserts a dose the person may be about to take.
4. **Every row says where it came from**: in the dose log, the clinician summary
   and the archive.
5. **Every row is correctable in one tap**, for thirty days on the row and
   through the editor after that. Correcting sets `skipped` and keeps
   `source: 'schedule'`, so the record says both things.
6. **Nothing counts or colours a corrected row.** `adherence` reads a skipped
   dose as a filled slot rather than a miss, the stock projection consumes
   nothing for it, and no surface draws a streak, total or colour from the
   distinction.

The switch is offered only where the schedule is definite enough to write from:
it expects a dose on some day, says how much, and sits on an episode whose
route resolves to one the dose log records. An auto-logged injection carries
no site and no vehicle, because where it went is a choice made at the time.

### Why this is not an inference

The schedule already holds the day, slot and amount, because the person wrote
them. The app only carries out an instruction given once. The confirmation this ADR asks for is
still there, given in advance and in words that state what will be written.
What keeps it honest is that rows stay distinguishable (rule 4) and cheap to
correct (rule 5), which answers the real fear: a record that lies about the
person and cannot be told from one they made.

A dose written under that instruction happened by the person's standing
instruction, so it is a dose like any other to `adherence`, the stock
projection and the care spine's last-dose reading. A slot marked skipped is
stated and never counted, as with every skipped dose (the agenda never counts
what did not happen).

## Consequences

`source` is not a status. A dose can be taken, skipped or changed regardless
of who wrote it, and a screen that needs both says both. A third source later
is a new value, not a new status.

The pass is idempotent because a dose it wrote fills its own slot on the next
run, as a hand-logged one does, so no stored high-water mark exists to
disagree with the log. A dose within `slotToleranceDays` of a slot fills it,
which is under half the gap between slots. Without that, a weekly injection
logged a day late would get a second "taken" row for the slot it was late for,
and the rows would no longer be doses the person planned and did not record.
`adherence` pairs same-day doses first, then the nearest open slot in
tolerance, so each dose reaches at most one slot.

The switch travels in the archive and restores as off when the field is
absent. Importing someone's journal must never start writing doses for them on
another device.

Nothing here licenses an automatic write elsewhere. The next feature that
wants one states its own rules or opens a sheet.

History: decided 2026-08-31; amended 2026-10-21 (milestones hold no felt sense); absorbed ADR-0086 (decided 2026-09-16, amended 2026-10-06 for nearby-slot pairing) 2026-11-02.