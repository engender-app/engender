# Epoch day is the local calendar day

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: none

An epoch day is the number of days since 1970-01-01, counted from the device's current local calendar date, not a UTC day. It is the day an entry is for, and the unit behind calendar cells, milestones, lab results and stats ranges. Every conversion between epoch day and any calendar representation goes through one module, `src/lib/data/epochDay.ts`.

## Considered options

Anchoring epoch day to UTC would keep the stored number stable when a user travels. Rejected: "today" would then be wrong for anyone west of UTC for part of every day. A 22:00 entry in Los Angeles would land on tomorrow's calendar cell. This is a personal journal, not a distributed system, and the day the user means beats the day that travels.

Storing the local date as a `YYYY-MM-DD` string would make the ambiguity structurally impossible. Rejected: the integer is faster for range queries on a phone.

## Consequences

Timezone travel is accepted, documented drift. Entries logged before a move render under a different calendar date than the one the user saw then, because the stored number was computed under the old offset.

Parsing a date through `Date` as UTC reintroduces a one-day skew west of UTC. `epochDay.test.ts` and `epochDay.dst.test.ts` hold the round trip across timezones and DST changes.

History: streaks dropped from the list of units 2026-11-02 (see ADR-0055).