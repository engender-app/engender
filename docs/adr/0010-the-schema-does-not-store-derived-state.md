# The schema does not store derived state

Three columns the PRD's schema specified were dropped because each one duplicates
something computable from data already present: `milestone.kind`,
`milestone.order_index`, and `reminder.trigger_time`.

## Why

Each had already drifted or would inevitably drift.

`kind` ('countdown' or 'anniversary') is a function of the milestone's date and
today. A milestone dated in the future stays `countdown` in the column forever
after its date passes, while the UI calls it an anniversary. `milestoneStatus()`
had already stopped reading the column.

`milestone.order_index` is never read: the timeline sorts by date and Home sorts by
next occurrence.

`reminder.trigger_time` held "next trigger" as epoch millis. It has to be rewritten
after every fire, after every reboot and after any timezone change, and a 20:00
reminder silently shifts by an hour across a DST boundary, because 20:00 local is
not a fixed offset from any epoch. Storing the rule instead (local wall-clock time,
a recurrence enum with its interval, an anchor day for "every N days", a concrete
epoch day for one-offs) also makes the editor's "Next: …" preview and the scheduler
share one function, which is the only way they stay in agreement.

## Consequences

Whether a milestone reads as a countdown or an anniversary follows from its date,
so there is no per-milestone control over annual recurrence. Every past milestone
resurfaces every year. This was considered and accepted.
