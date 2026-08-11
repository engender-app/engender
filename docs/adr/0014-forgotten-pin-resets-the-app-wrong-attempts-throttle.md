# Forgotten PIN resets the app; wrong attempts get a growing delay, not a wipe

A forgotten PIN has one way back in: a clearly-labeled action on the lock screen
that wipes local data and returns to onboarding. There is no data-preserving
recovery. Repeated wrong PIN attempts face an increasing delay before the next
attempt is accepted; there is no fixed attempt count that triggers an automatic
wipe.

## Why

The PIN is a hash, and app lock is a UI gate rather than at-rest encryption (the
PRD is explicit about this) — no recovery can exist that both preserves data and
survives a forgotten PIN. A deliberate reset action is more honest than silence,
and it adds no new attack surface: anyone willing to destroy the diary out of
malice already could, by uninstalling the app.

An automatic wipe after N wrong attempts was considered and rejected: layered on
top of the deliberate reset action, it becomes a second, accidental way to lose
everything — triggered by a bored kid, an argument, or a mis-tap, with nobody
choosing it. A growing delay raises the real-world cost of guessing without that
risk, consistent with the PIN being a casual-glance deterrent, not a vault.

## Consequences

PIN-set copy must tell the user, before they finish setting a PIN, that forgetting
it means using the reset action and losing all local data. The lock screen itself
must never imply that data is encrypted at rest.
