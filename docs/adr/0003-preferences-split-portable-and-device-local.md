# Preferences are split into portable and device-local, and live in SQLite with a small boot cache

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: ADR-0009 (merged in)

Preferences are rows in the `pref` table inside SQLite, which is authoritative (`src/lib/data/prefs/preferences.ts`). `src/lib/data/prefs/catalogue.ts` sorts every key by an explicit allowlist. `PORTABLE_KEYS` describe the journal and travel in the archive: name, active scales, metric, palette, theme, language, the daily check-in switch and time. `DEVICE_LOCAL_KEYS` describe this installation and never leave it: lock timing, disguise, screen-capture and notification flags, auto-export configuration, the last-backup stamp. A key in neither list fails `catalogue.test.ts`, so a new preference is device-local until someone makes it portable.

A third list, `BOOT_KEYS`, is mirrored into localStorage (`boot-cache.ts`): theme, palette, mood preset, language, the accessibility flags, lock timing, disguise. Its one question is "is this needed before the database is open?" That is separate from the portable split. The mirror is a cache, refreshed whole on every write and never authoritative.

## Why

An archive promises "everything, including settings", but restoring device security state would lock a user out of an app with no recovery channel. Lock secrets are not preferences at all: the PIN, passphrase and biometric live in the key wrapping (ADR-0041), so nothing in `pref` can bring an old lock back. Auto-export configuration has a milder version of the problem: a restored folder URI may not exist on the new device. The check-in is portable although it is inert on web, so a new phone keeps the ritual.

Preferences sit inside SQLite so an import is one transaction. A second store outside it could leave `activePreset` pointing at a preset that no longer exists. The boot set exists because theme, palette and language must apply on first paint, and OPFS plus WASM SQLite is not instant. `src/app.html` reads the same key and shape before any module loads; `tests/app-html-chrome.test.ts` fails if the two sides drift.

## Consequences

Replace installs the archive's portable preferences in its row transaction (`restorePortablePreferencesWithin`). Merge writes none, because what is already here wins and a preference is the one thing the user can see is set. Device-local state survives either import by construction, not by a filter.

The mirror is plaintext beside an encrypted journal, so only presentation preferences may join it (ADR-0018). The PIN hash left it when the passphrase gate took over pre-database rendering. While disguised, `bootSubset` (`preferences.ts`) writes the default palette into the mirror instead of the person's own, so the first paint and the lock screen never name their flag (ADR-0101); the table keeps the real choice and the mirror takes it back on the write that turns disguise off. Tile snoozes, letter ids and the "has entries" hint, which once sat beside the mirror in plaintext, live in the encrypted, portable `acknowledgements` preference.

`engender-boot-access-mode` is a second mirror key, not a preference: the last known access mode, read only so `initialBoot()` can start in `needs-unlock` without a splash frame. It is cleared with the preference mirror (`BOOT_MIRROR_KEYS`), so no reset leaves the journal intact and the lock gone. A passphrase mode reached in a demo build is not cached.

History: amended 2026-08 (Merge writes no preferences) and 2026-11-02 (neutral palette while disguised); absorbed ADR-0009 (boot cache) 2026-11-02.