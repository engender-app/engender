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

## Amended by ticket 09: the PIN hash left the boot set

The boot set is five preferences now: theme, palette, language, lock-on-leave,
disguise. The PIN hash was in it so the lock screen could render before the
database opened, and ticket 09 removed both halves of that reason at once: the
passphrase gate is what renders before the database now, and the mirror is
plaintext localStorage sitting beside an encrypted journal - a hash with
10,000 possible preimages in it is an offline-guessable secret, which is
exactly the "sensitive boot preference" the encryption claim covers
(ADR-0018). The hash lives only in the pref table; the gate reads it after
the real preferences land, which is before any journal query is answered. A
mirror written by an older build heals on the next preference write, which
refreshes the whole boot set.
