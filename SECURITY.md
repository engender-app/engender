# Security policy

engender keeps journal data on the device and encrypts it at rest. Security
reports still matter, and a report should be possible without posting the
details in public first.

## What the lock protects

On the web, locking a journal that opens with a passphrase, PIN or the
device's biometric unlock closes its database, stops the worker that held
the database key, and drops the app's references to that key. Unlocking
derives the key again from your secret. While locked, the page keeps your
settings, which the lock screen needs for its theme, language and timing,
and an encrypted copy of an unsaved entry draft.

JavaScript cannot overwrite memory on demand. The browser frees what the
app let go of on its own schedule, so the lock does not promise that the
key's bytes are gone from memory, and it does not protect against
software that can read the browser's memory.

A journal in device-bound or unlocked mode has no secret to ask for, so
it does not lock mid-session. On Android, the lock hides the journal and
keeps the database open; the key stays behind Android Keystore.

Changing the passphrase or replacing the recovery key rewraps the same
data key. A copy of the journal's files taken before the change still
opens with the old passphrase or recovery key.

## Report a vulnerability

Use GitHub private vulnerability reporting for this repository:

- https://github.com/engender-app/engender/security/advisories/new

That channel is private between the reporter and maintainers.

## What to include

- App version, from Settings, then About.
- Platform and browser or device model.
- Clear reproduction steps.
- Expected result and observed result.
- A minimal proof that uses synthetic data.

## What not to include

Do not include personal journal data in a report.

- No backup or archive files.
- No screenshots that show entries, notes, reminders, labs or photos.
- No logs that carry journal content.

Confirming a bug does not need your transition history, so nothing here will ask
for it.

## What happens next

One person maintains this project, so a report is read when that person next
sits down with it rather than inside a fixed window. What follows is a
reproduction, an assessment of severity, and a disclosure timeline agreed with
the reporter. The fix ships with release notes naming the problem.
