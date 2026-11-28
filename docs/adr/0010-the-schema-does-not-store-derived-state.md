# The schema does not store derived state

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: none

A column that duplicates something computable from data already present does not belong in the schema. Three columns the original spec listed were dropped on that ground: `milestone.kind`, `milestone.order_index` and `reminder.trigger_time`. The test for a stored value is not "is recomputing expensive" but "is the thing it was computed from still there". If it is, compute it. If it is not, the value is a recorded observation and is stored.

## Why

`kind` ('countdown' or 'anniversary') is a function of the milestone's date and today. A future-dated milestone would stay `countdown` forever, while the UI called it an anniversary (`milestoneStatus()` in `milestoneStatus.ts` had already stopped reading it). `order_index` was never read: the timeline sorts by date and Home by next occurrence.

`reminder.trigger_time` held the next trigger as epoch millis. It must be rewritten after every fire, reboot and timezone change, and a 20:00 reminder shifts by an hour across a DST boundary, since 20:00 local is no fixed offset from an epoch. Storing the rule (local wall-clock time, a recurrence of daily or every N days, an anchor day, or one concrete day for a one-off) avoids all of that.

## Consequences

Whether a milestone reads as a countdown or an anniversary follows from its date, and every past milestone resurfaces yearly. A per-milestone `celebrate` flag exists, but it is a choice about Home celebration, not a derived value.

**The rule is written twice, on purpose.** `nextOccurrence()` in `src/lib/data/reminderRule.ts` serves the editor's preview. What fires a notification is `ReminderPlanner.nextOccurrence` in Java, which runs before any WebView exists and cannot import TypeScript. The two had drifted on an elapsed one-off. `src/lib/android/fixtures/reminder-rule.json` now holds them together: both suites iterate it, and an elapsed one-off has no next occurrence.

**Stored on purpose: three recorded observations.**
- A regimen episode's `end_epoch_day`. "The next episode's start ends this one" stopped holding once episodes for different drugs overlap, so there is nothing left to derive an end from.
- `lab_result`'s four timing columns (draw time, route, hours since dose, day of interval). They record the dosing context against the dose log as it stood when the draw was entered. A dose corrected in November must not rewrite the context of an August result already discussed at an appointment. Correcting the draw's own day or time does recompute it.
- Editing a dose event never touches a saved context.

The counterevidence snapshot pair was a third such exception and was removed (migration 96), because it let a deleted entry's note outlive the entry (ADR-0037).

History: amended 2026-08 (regimen end day), 2026-09 (preview and scheduler never shared a function; two recorded observations) and 2026-10 (snapshots removed); folded 2026-11-02.