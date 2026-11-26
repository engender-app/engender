# There is no streak

Status: Accepted
Decided: 2026-09-04
Last reviewed: 2026-11-02
Supersedes: ADR-0032 (retired; its run-out half now lives in ADR-0046)

Home once reported a streak: the run of consecutive days with an entry, as a
line under the greeting and as a caption on the week strip. A later change deleted it, along with the journaling-pause read that kept it honest. This
record is the reason, restored under the number the code already cites.

## Decision

The app counts no run of consecutive days, anywhere. Not on Home, not in a
recap, not as a nudge. A count that climbs by showing up turns every day that
nothing was written into a loss, and the people this journal is for have days
when writing is the wrong thing to ask. A declared pause only softened that. It
did not remove the thing being measured. What stays is the plain facts that
have no verdict in them: the days that have entries. The longest run inside a
stated range, called Best streak, went with it, since it is the
same count over a window.

## What moved

ADR-0032 was written when two computations read two kinds of pause, the streak
and the stock run-out rate. The streak half is gone with the streak, and the
journaling pause itself was later cut. The other half, that the run-out rate
never reads a dose pause, still holds and is in ADR-0046.

The same change gave Home its tiered tiles, three at a time with the rest
folded. Those rules had no home of their own and are now in ADR-0073, next to
the rule that the app ranks nothing centrally.

## Consequences

Anything that reintroduces a consecutive-day count, a "don't break it" caption
or a reminder worded around one is a change to this record first.

History: decided 2026-09-04; restored under this number 2026-11-02; ADR-0032 retired into it and ADR-0046.