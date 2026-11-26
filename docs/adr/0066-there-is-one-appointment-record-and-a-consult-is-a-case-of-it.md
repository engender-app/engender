# There is one appointment record, and a consult is a case of it

Status: Accepted
Decided: 2026-09-05
Last reviewed: 2026-11-02
Supersedes: none

An appointment is a row: a day, a kind the person names, a place, a note
and an optional link to a procedure. It is not a new table.
`procedure_consult` was this record with one field permanently filled in,
so it grew into the general case.

**The kind is free text.** Its suggestions are the kinds this person typed
before, and nothing ships.

**The prep list stays standing and unowned.** Appointment rows carry the
dates, and the prep date is a read over the soonest future appointment.

**Only the most recent past appointment offers a debrief**, one at a time.
Its link to the entry and its dismissal live in `appointment_debrief`, one
device-local row per appointment keyed by its uuid (ADR-0103).

A visit may keep a time of day, and a wait is the same record before its
day (a referral or queue, no day yet). A visit or wait can name a provider.

## Why

The concept existed in four places and had a row in none: a column on the
one ownerless checklist, the debrief that hung off it, the clinician
summary's range start, and a consult reachable only through its procedure.
Giving it a row makes the surfaces agree by construction and gives the
person a history where they had one overwritable date.

**Grow the consult, not a table.** A consult differs in one way, that it
attaches to a procedure, and that is a nullable link. Two tables for one
concept is what a glossary exists to refuse. The cost was a rename, one
nullable column and an alias on the archive apply path so older archives
restore.

**Free-text kind.** A shipped list of endocrinologist, psychologist,
surgeon is a picture of a medical path, would need translating, and would
give the app an opinion on whether a court hearing is an appointment.

**Standing prep list.** An appointment record invites a prep list per
appointment, and that would make the person retype their standing
questions each time, the work carry-forward simulates by hand.

**Only the latest past offers.** Three appointments in a month would mean
three offers, and back-filling a year would mean twelve. A past
appointment written in is a record being entered, not a visit that just
happened.

**A wait is the same row.** A referral edits into a dated visit when it gets
a day. `getAppointments` reads visits only, because every reader asks about
a day; `getWaiting` reads the rest. Waiting is stated as elapsed time and
never as an estimate of what is left (`waitingSince` in
`src/lib/data/journal/appointments.ts`).

**Providers live here.** Nothing reads one except as an appointment's who,
so they are a flat table, deleting one leaves its appointments with nobody
named, and they leave the journal only in the person's own backup.

## Consequences

Appointments are in `comingBack.ts`'s `PLANNED_AREAS` beside milestones and
procedures. Without that, booking a future appointment counts as a write
and closes the person's own return gap.

The old single date on the checklist is gone from the schema (migration
119). An older archive may still carry it as `appointmentEpochDay`; restore
accepts it.

Every past appointment draws as a chart annotation through the existing
seam. Density is that seam's problem and not a preference.

The hub row is `appointments` and fronts prep, the record and the debrief
together. A procedure keeps showing its consults, now appointments that
point at it.

## Considered and rejected

- **A second table beside `procedure_consult`.** Two names for one record.
- **A prep list per appointment.** It turns standing questions into a
  chore per visit.
- **An enum of kinds, or a shipped suggestion list.** Each is a claim about
  which appointments a transition involves.
- **A debrief for every past or back-filled appointment.** Entering history
  becomes a queue of prompts.
- **An estimate of how long a wait has left.** Elapsed time only.

History: decided 2026-09-05; waits, time of day and providers added 2026-10; folded into the body 2026-11-02; column names and the debrief table follow migration 119 (ADR-0103).