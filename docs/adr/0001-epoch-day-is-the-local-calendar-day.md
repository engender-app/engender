# Epoch day is the local calendar day

An epoch day is days since 1970-01-01 computed in the device's current timezone,
not a UTC day. It is the day an entry is *for*, and the unit behind calendar cells,
streaks, milestones, lab results and stats ranges, so the ambiguity had to be
resolved once and enforced in a single module.

## Considered options

Anchoring epoch day to UTC would make the stored number stable when a user travels.
We rejected it because "today" would then be wrong for anyone west of UTC for part
of every day: a 22:00 entry in Los Angeles would land on tomorrow's calendar cell
and break the user's streak. This is a personal journal, not a distributed system,
and the day the user means beats the day that travels.

Storing the local date as a `YYYY-MM-DD` string instead of an integer would make
the ambiguity structurally impossible. We kept the integer for range-query speed on
a phone and to stay with the PRD's schema.

## Consequences

Timezone travel is accepted, documented drift rather than a solved problem. A user
who moves between timezones will see entries logged before the move rendered under
a different calendar date, because the stored number was computed under the old
offset. Every conversion between epoch day and any calendar representation must go
through the one epoch-day module; going through `Date` UTC parsing (as
`isoFromEpochDay` and `fmtDay` originally did) reintroduces a one-day skew west of
UTC.
