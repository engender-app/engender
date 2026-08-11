# Preferences live in SQLite, with a small boot cache outside it

Preferences are a key-value table inside SQLite. A deliberately small **boot set**
is mirrored into localStorage (web) and Capacitor Preferences (Android): theme,
palette, language, PIN hash, lock-on-leave, disguise. SQLite is authoritative; the
mirrored copy is a cache refreshed on every write.

## Why

Two different pressures pull in opposite directions.

Keeping preferences outside SQLite means an import writes two stores
non-atomically, so a failure between them leaves `activePreset` pointing at a
preset that no longer exists. Inside SQLite, an import is one transaction.

But some preferences are needed before the database is open. Theme, palette and
language must apply on first paint or the user sees a flash of the wrong theme, and
the PIN hash and lock flags must be readable before the lock screen renders. OPFS
plus a WASM SQLite build is not instant.

## Consequences

Membership of the boot set is decided by one question: is this needed before the
database is open? That is orthogonal to the portable/device-local split in
ADR-0003, and neither subsumes the other. Theme, palette and language are portable
*and* boot-critical; the PIN hash is device-local *and* boot-critical; display
name, active preset and metric are portable and not boot-critical. Both lists have
to be written out explicitly.
