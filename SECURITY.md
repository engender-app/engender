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

Before a reopened web connection becomes available, the existing migration
rules refuse a journal newer than the running build. Unlock and retained
navigation check compatibility before reading private preferences or content.

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

Moving from device-bound access to a secret reports success only after the
old device-bound wrap is removed. The web verifies removal of both its key
and metadata. If an interrupted change leaves both wraps, the next successful
secret unlock retries cleanup; a failed cleanup remains visible to the next
boot. Cleanup checks the current credential owner before removing anything.

Web journal text fields request `autocomplete="off"` to keep their contents out
of browser autofill and session restoration. This does not erase copies left by
older versions. Android always sends `IME_FLAG_NO_PERSONALIZED_LEARNING` for
text input, asking the keyboard not to learn. This is advisory: the keyboard
controls its own storage, and previously learned words are not removed.

An Archive header is checked before its password starts key derivation. It
can request at most 64 MiB of Argon2id memory, six iterations, one lane and a
32-byte output. Higher costs are refused as a corrupt Archive. Export keeps
the released 64 MiB, three-iteration profile; the import ceiling allows twice
its combined cost without increasing the memory request.

## Accepted authentication policy, implementation pending

On 14 October 2026, the owner approved fresh authentication for each recovery
key mint, recovery key replacement and access-mode change. This decision does
not add those checks to the app. The current recovery and access-mode flows
can use an already unlocked session; the implementation remains separate work.
Recovery replacement already asks for confirmation and warns that the old key
will stop opening the journal. Credential serialization prevents conflicting
changes, but does not authenticate the person making them.

The follow-up must verify the current PIN in PIN mode, the current passphrase
in passphrase mode, or require a new successful biometric authentication in
biometric mode. An earlier unlock or a proposed new credential is insufficient.
Failed or cancelled authentication must not fall back to session authority.
Android device-lock fallback is not an approved substitute for biometrics.

Approval must authorize only one operation in the current journal and session.
Cancellation leaves the current recovery wrap and access mode unchanged. Lock,
reset, session replacement or credential changes invalidate approval, including
late successful authentication callbacks. The operation must recheck ownership
before publishing any change.

Web device-bound mode is the explicit exception for both recovery changes and
access-mode changes: it has no current secret, so an unlocked session is
sufficient. The flow must explain this exception. Someone holding an unlocked
web journal can create lasting access or replace its protection; choosing a new
secret during that flow is not authentication of the current owner. This
exception does not extend to Android or create another access mode.

Implementation must preserve PIN throttling, existing failure behavior, durable
credential publication, and the recovery replacement confirmation and old-key
warning. Synthetic-journal tests must cover successful operations, wrong
credentials, biometric failure and cancellation, single-operation approval,
and invalidation races, as well as the web device-bound exception. The separate
recovery replacement protocol decision remains outside this authentication
policy; this decision does not settle interrupted replacement behavior.

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


Web Start over uses logical reset recovery. Ordinary app-owned mirrors are
cleared before asynchronous file deletion; credential wraps remain until the
other OPFS entries are removed. If a browser crash restores old mirror values
after the journal is gone, boot discards them before onboarding. Browser
storage does not expose fsync or guarantee erasure of old physical log bytes.
