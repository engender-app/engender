# Stock is a projection over the dose log, never a stored count

Status: Accepted
Decided: 2026-08-31
Last reviewed: 2026-11-02
Supersedes: ADR-0032 (run-out rule merged in; its streak half retired with ADR-0055)

`medication_stock` holds only what a person last reported having of one drug:
a quantity, its unit and the day it was counted. It also holds an optional
expiry day and a pharmacy note, which are logged and shown and never read by
any projection or advice. Remaining stock and the run-out day are computed
from that row and the dose log on every read (`src/lib/data/stockProjection.ts`).
Nothing decrements, nothing refunds, and nothing is floored at zero. The
run-out rate averages over every calendar day of a trailing window and never
reads `dose_pause`.

## Why

The alternative was a stored `unitsRemaining`: a dose write decrements it, a
delete refunds it, floored so it never reads negative. It has been proposed
twice, once under a citation to an ADR that was never written.

A decremented counter drifts the way `reminder.trigger_time` did (ADR-0010).
Every write that touches a dose (insert, edit, delete, and a status change
between `taken` and `skipped`, which creates no row but changes whether the
dose consumes stock) must also touch the counter, in the right direction, or
the two disagree with nothing to notice. A missed decrement reads as more
stock than exists and a missed refund as less. Fixing the drift needs a
reconciliation pass, which is a second write path with its own chance of being
wrong.

The floor makes it worse. A negative `remaining` is meaningful: the recorded
count has been outrun, which is what a person holding an empty box needs to
hear. A zero floor replaces that with "zero or less". A value computed on read
has nothing to decrement and nothing to fall out of sync, and negative is just
the number.

## The run-out rate never reads a dose pause

The trailing consumption rate deliberately never reads `dose_pause`. A paused
day stays in the plain calendar-day average, as a run of skipped doses does:
both are zero-consumption days that pull the average down. This is the
opposite of `adherence()`, which filters a pause's slots out of the expected
count, and the difference is on purpose. Nothing is taken during a pause, so
the stock lasts longer in calendar time. A rate computed only from non-paused
days rises back to the un-paused pace and projects an earlier run-out, which is
backwards. Dilution pushes the date later, which is the true direction.

The rate does not read `dose_schedule` either. A schedule is optional and one
per episode, so a figure that depended on one would vanish for someone who
never set one.

## Consequences

A count is only as good as the last one recorded. Skip a re-count for months
and the projection runs on a stale quantity. That is accepted: the alternative,
reconciling a real box count against a decrementing counter, is the drift this
ADR rejects.

Stock is scoped by drug name, matched the way an analyte's unit is (CONTEXT:
Analyte), not by regimen episode, because a dose or route change on the same
drug starts a new episode and an episode-scoped count would go stale at the
next adjustment.

A dose that names no drug while two regimen episodes overlap is excluded from
every projection rather than guessed at (the rule `attributeDose` applies
elsewhere), so an ambiguous dose is reflected in neither drug's count until
the person names it.

Expiry and the pharmacy note are log only. Nothing reads the expiry to change
a projection, raise a prompt or tell the person what to do with an expired
supply, and a future reader of either field is a change to this record.

History: decided 2026-08-31; run-out rule absorbed from ADR-0032 (decided 2026-08-19) and ADR-0055's restatement; expiry and pharmacy note added 2026-10; merged 2026-11-02.