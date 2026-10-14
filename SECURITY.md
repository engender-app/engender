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

## Authentication for recovery and access changes

Creating or replacing a recovery key and changing access mode require a new
successful check of the current protection. PIN mode verifies the current PIN
with its existing attempt accounting; passphrase mode verifies the current
passphrase; biometric protection requires a new successful biometric prompt.
A proposed replacement credential and an earlier unlock do not approve a change.
Android device-lock fallback is not offered for these operations.

Each prompt belongs to one operation in one journal session. Cancellation,
lock, reset, session replacement or credential changes invalidate pending
approval. The operation checks the persisted credential and recovery-wrap
identities again under credential serialization. It checks ownership after
key derivation or authenticator enrolment and before publishing a wrap. Browser
writes abort their swap file if approval is revoked before close; native writes
check before bridge dispatch. A write already committed cannot be rolled back
by a later cancellation. Existing atomic publication and old-binding cleanup
remain in force. If cleanup fails after a new secret is published, the change
reports failure and a retry verifies that published secret.

Web device-bound mode has no current secret. Its confirmation explains that
anyone holding the unlocked browser can create lasting access or replace the
journal's protection. Choosing a new secret is not owner authentication. This
session-authority exception applies only to web device-bound mode.

Android unlocked mode requires a fresh biometric check or the existing recovery
key. If neither is available, recovery-key and access-mode changes are blocked.
This does not introduce a device-lock fallback or a new access mode.

A successful recovery unlock approves only the immediate post-recovery
protection setup, once, in that recovered session. It does not approve general
Settings changes or recovery-key minting. If setup fails after consuming this
proof, another attempt requires the existing recovery key again. No operation
stores the typed key or adopts a newly verified key as another journal session.

Replacement still asks for confirmation and warns that the old recovery key
stops opening the journal. The separate interrupted-replacement protocol is
unchanged. The policy was approved on 14 October 2026, including its explicit
post-recovery and Android unlocked cases.

## Android signing certificates

The release verifier checks certificate SHA-256 fingerprints as well as
cryptographic signature validity. It requires one signer per artifact and
rejects a valid signature from any other certificate. These public fingerprints
were verified on 14 October 2026 against the
[v1.0.0-rc.1 artifacts](https://github.com/engender-app/engender/releases/tag/v1.0.0-rc.1)
and the Play Console certificate records:

| Certificate role | SHA-256 fingerprint |
| --- | --- |
| GitHub / Obtainium APK signer | `093e1e2967ca72559e0bef57e0a99d2584f08b4ba4c662ffbca7101ac4446f86` |
| AAB upload signer | `093e1e2967ca72559e0bef57e0a99d2584f08b4ba4c662ffbca7101ac4446f86` |
| Current Play app-signing certificate | `8fa369eb5555ade56c58622738f4f3f6f79b74926ac042340374dc73c86f0f05` |

For a downloaded or installed APK, run `apksigner verify --print-certs app.apk`
and compare `Signer #1 certificate SHA-256 digest` with the APK's channel above.
Use the GitHub APK fingerprint in tools that verify Obtainium downloads. For
an APK delivered by Play, use the current Play app-signing fingerprint and
inspect the actual installed APK. Google signs Play-delivered APKs with a
separate app-signing key; the AAB upload certificate does not establish their
installed signer or update compatibility.

For an AAB, run `jarsigner -verify app.aab` to check integrity, then
`keytool -printcert -jarfile app.aab` to inspect the upload certificate. Compare
the certificate's SHA-256 fingerprint, not the file checksum or public-key hash.
The release gate pins the GitHub APK and AAB upload roles separately in
`scripts/check-release-artifacts.mjs`; it does not accept the Play app-signing
certificate for either release artifact.

The current GitHub and Play certificates differ. Direct channel switching is
not established, and a matching fingerprint alone would not prove that an
installed update works. Before uninstalling to change an incompatible channel,
export an Archive and verify its restore on a separate disposable installation.
The current Play key is retained to preserve updates for existing Play test
installations. GitHub releases remain independently signed with the existing
developer key; Play-signed APKs are not the source for GitHub or F-Droid.

The planned F-Droid route uses reproducible-build verification to preserve the
GitHub APK signature. F-Droid receives the signed APK and public certificate
fingerprint, never the private key. Its metadata must pin the GitHub APK
fingerprint above. No F-Droid-published APK has been verified here, so
GitHub/F-Droid in-place switching remains unverified. Require the actual
reproducibility result and installed-update evidence in both directions before
claiming support. Destination versions must be compatible and equal or newer;
never downgrade a journal to change channels.

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
