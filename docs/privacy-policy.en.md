# Privacy policy

Last updated: 2026-09-17

This policy describes what is true for enGender as shipped. Each surface is
covered from the day it is published, and not before.

## Scope

enGender has separate surfaces with different observers:

- The hosted web app at `app.engender.dev`, once hosting is published.
- Distribution channels for Android releases (Google Play, F-Droid, direct APK)
  once Android builds are published.
- Whatever destination you choose for an encrypted backup or an unencrypted
  export you share off the device.

One sentence cannot describe all three safely, so this policy keeps them
separate.

## Hosted web app

The web host observes standard web-server metadata when the app is loaded or
updated:

- Source IP address.
- Request timestamp.
- Requested resource paths and file sizes.
- User-Agent and referrer headers sent by the browser.

The web host receives no user accounts, profile identifiers, analytics or
journal uploads. Journal content is stored in browser storage on your device.

On the device itself, the local journal opens through one of four access modes:

- A typed passphrase, derived with Argon2id.
- A four-digit PIN, combined with a device-bound key kept in browser storage.
- Biometric verification on supported browsers using the WebAuthn PRF extension
  (Touch ID, Windows Hello, or your device lock).
- A device-bound key kept in browser storage, opening without an in-app prompt.

PIN, biometric and device-bound modes depend on keys held in that specific
browser profile. Clearing site storage, resetting the browser profile or
losing the device makes that local journal copy unreadable.

You can also mint an optional 25-character recovery key. A recovery key wraps
the local journal key on that device so you can unlock if a passphrase, PIN or
biometric authenticator is lost. It opens the journal only on the device and
browser profile that still holds it; it cannot move data to a new device or
decrypt an export. The recovery key is shown once and never stored off the
device.

## Android store delivery

Android builds are distributed through channels that maintain their own
telemetry and account policies. Store operators observe install and update
events under their own terms.

The Android app does not request the `INTERNET` permission. Inside the app,
journal content stays on the device. It opens no network sockets and sends no
journal data to any server during normal use.

The permissions it does request cover three purposes:

- `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` and `RECEIVE_BOOT_COMPLETED`,
  so a reminder or the daily check-in can notify you, fire at the time you
  chose instead of a batched system window, and still fire after the device
  restarts.
- `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`, for voice notes.
- `CAMERA`, for video notes. A still photo instead opens the system camera
  app, which needs no permission from this app.

Reminder and check-in notifications show only a generic label by default,
even on a locked screen; a setting under Notifications turns that off and
shows the real title instead.

Copying the recovery key on Android puts it on a clipboard entry marked
sensitive and kept out of the keyboard's own clipboard history; the app
removes it again after one minute.

The local Android journal opens through one of four access modes:

- Device-bound access protected by Android Keystore, gated by the device
  screen lock or platform biometric prompt.
- Unlocked access, encrypted at rest with SQLCipher through Android Keystore
  without an in-app unlock prompt.
- A four-digit PIN, combined with a hardware-backed binding key in Android
  Keystore.
- A typed passphrase, derived with Argon2id.

Device-bound, unlocked and PIN modes rely on keys stored inside Android
Keystore that cannot be copied off the device. Losing the device or wiping
application data makes the local journal copy unreadable. An optional recovery
key can open the journal on that device if credentials fail, but cannot recover
data if the device or its storage is gone.

## Backups, exports and shared files

When you export or share files, you choose where they go.

If you save a file to a cloud drive or document provider, that provider can
observe file metadata such as the filename, timestamp, size and account
access logs.

### Encrypted archives

An encrypted backup (`.ttbackup`), whether exported manually or scheduled
through Android automated backup, is encrypted with AES-GCM using a backup
password you choose. Nobody can read an encrypted archive without that
password.

### Deliberately readable exports

Other exports leave the app unencrypted because they are meant to be read,
shared or printed:

- Plain CSV and JSON data files exported from Settings.
- Keepsake journal books prepared for printing or PDF export.
- Clinician summaries prepared to share regimens, vitals, labs and notes with
  healthcare providers.
- Progress-photo journey collages and timelapse videos exported from the photo
  library.
- Retrospective wrapped cards shared as images.
- Stored PDF documents exported back to device storage.
- Single-event calendar files (`.ics`) for appointments, surgeries or milestone
  dates.

Anyone who receives an unencrypted file or printout can read the information it
contains. The app asks for confirmation or explicit action before producing
plaintext files.

## What this project does not claim

- Not that the hosted web app makes no network requests. The browser must fetch
  application files to run and update.
- Not that distribution channels collect nothing under their own terms.
- Not that a forgotten passphrase, lost PIN, lost device key, missing recovery
  key or forgotten backup password can be recovered by the maintainer. None of
  them can.
- Not that unencrypted exports remain confidential once handed to another app,
  person or cloud service.

## Support and security boundaries

Neither user support nor security vulnerability reports require your private
journal data, backup archives or decryption keys.

- Support policy: `SUPPORT.md`
- Security disclosure process: `SECURITY.md`
