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

## Amended by ticket 14: which import writes preferences at all

A Replace installs the archive's portable preferences over this device's; a Merge
writes none of them. Merge's rule for rows is that what is already here wins, and a
preference is the one thing on this screen the user can see is already set - having
an import silently change the palette and the display name while explicitly leaving
every row alone would make "merge into current" mean two different things at once.

Preferences are not a journal area, so neither operation touches the `pref` table:
the journal restores rows, and the screen that drove it writes the preferences
afterwards. That is also what makes "Replace leaves the PIN alone" true by
construction rather than by a filter someone has to remember to apply.
