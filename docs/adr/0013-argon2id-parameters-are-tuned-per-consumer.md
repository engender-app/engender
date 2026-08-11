# Argon2id parameters are tuned per consumer, not shared

The archive key derivation targets roughly one second on a mid-range 2020 Android
device. The app-lock PIN hash targets roughly 50-100ms. Both parameter sets are
data, not inlined constants; the archive's set travels in its header (ADR-0007) so
it can evolve.

## Why

The archive key protects an export that can leave the device and sit anywhere; a
4-digit PIN has only 10,000 possible values regardless of hash cost, and the PIN
gate exists to stop a casual glance, not to resist a serious attacker (ADR-0014
puts the PIN's actual defense in a growing-delay throttle, not the hash). Paying
archive-grade derivation cost on every PIN unlock would add real latency to
something done many times a day for no corresponding security gain.

## Consequences

The exact numeric parameters (memory cost, iterations, parallelism) are not fixed
by this decision — they come from benchmarking real hardware once the crypto
module is built, and get recorded as a follow-up once measured.

Losing the archive password is unrecoverable by design; the app must warn the user
of this plainly at the moment the password is set, and again before any encrypted
export.
