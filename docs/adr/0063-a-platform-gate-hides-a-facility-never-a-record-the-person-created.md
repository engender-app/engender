# A platform gate hides a facility, never a record the person created

Status: Accepted
Decided: 2026-09-05
Last reviewed: 2026-11-02
Supersedes: none

An `isAndroid()` gate decides what the web build shows. It may take away
the native facility and nothing else. Rows the person created stay visible
on both platforms, and a screen that mixes the two shows the records and
drops the facility rather than hiding both behind one gate.

## Why

The app is local-only and syncs nowhere, so the same database can be
opened by the web build and by the APK at different points in its life, and
an archive carries every row between them. A gate that hides records hides
data the person entered, on a platform where it is still there and still
theirs. The reminders screen once conflated "this device cannot ring an
alarm" with "you cannot see your reminders", and only the first half was
true.

The worse failure is a silent one. `wearSessions` writes a `Reminder` row
with a `wear:` marker through the shared data layer, ungated, and the wear
editor has no platform gate. A person could set an elapsed alarm on the web
build and get a row that appeared nowhere and never fired.

Splitting a screen costs more than gating it: two copy sets, an authoring
path closed off separately, a per-row decision about what survives. It is
worth paying because a record is the one thing the app cannot regenerate.

## Consequences

A gate goes on the narrowest thing that genuinely needs the bridge: the
firing, the permission notices, the battery-settings link, and authoring
something that could only ever fire. Reading is not gated.

`settings/notifications` shows the pattern. On web it hides the rows that
exist only to fire a notification and keeps the rows that switch an in-app
surface. `settings/reminders` on web lists the rows the journal holds with
a notice pointing at export and import, drops the add button, and keeps a
delete.

Where a gate removes the only path to cancel something, the cancel lands
elsewhere in the same change. The web reminders list carries a delete
because the wear editor's toggle, the cancel path on Android, is gone on
web. The asymmetry is the correct outcome.

A facility with no records behind it needs no split. The daily check-in has
no name, type or recurrence and its only effect is an alarm, so it stays
whole behind the gate. So do the scheduled backup and the Keystore-wrapped
reminder payload. The disguise is a facility of the same kind (ADR-0101).

## Considered and rejected

- **Full CRUD on web for reminders.** Authoring a reminder that can only
  fire after an export and import onto a phone is a workflow nobody has.
- **Gate the whole screen and fix only the wear write.** It keeps the
  invisible-row bug for stock run-out reminders and still hides rows an
  archive imported from a phone.
- **A boot-time sweep that deletes wear reminders on web.** Deleting the
  person's row to resolve the app's own confusion, silently.

History: decided 2026-09-05; Home-tile column example replaced (tile switches moved to Today, ADR-0073) and disguise pointed at ADR-0101 2026-11-02.