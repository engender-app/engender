# Preferences are split into portable and device-local

Preferences are divided by an explicit allowlist. Portable ones describe the
journal and travel inside the export archive: display name, active preset, metric,
palette, theme, language, and the daily check-in's enabled flag and time. Device-
local ones describe this installation and never leave it: PIN hash, app-lock and
disguise flags, auto-export configuration, and the last-backup timestamp.

The check-in is portable despite being Android-only behaviour, so that moving to a
new phone brings the ritual along; it is simply inert on web.

## Why

F14 promises the archive contains "everything, including settings", which read
literally means a REPLACE import restores the archive's PIN hash over the current
one. If the archive is a year old and the user has forgotten that PIN, they are
locked out of an app that by design has no recovery path and no support channel
that could reach their data. Auto-export configuration has a milder version of the
same problem: a restored folder URI may not exist on the importing device.

## Consequences

The split is an allowlist, not an "everything except" filter, so a preference added
later defaults to device-local and cannot leak into archives by accident. A REPLACE
import discards journal data but leaves the device's own security state intact.
