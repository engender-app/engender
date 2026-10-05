# Privacy policy

Last updated: 2026-10-05

engender is a journal for tracking a gender transition. It is made and
published by Alicja Barankiewicz in Warsaw, Poland. This policy covers the
hosted web app, the Android app and the files you export or share from
either.

## Contact

Questions about this policy or about your data:

- Email: [OPEN: contact address, to be chosen before release]
- Bugs and general questions: https://github.com/engender-app/engender/issues
- Security problems: https://github.com/engender-app/engender/blob/main/SECURITY.md

You never need to send journal content, a backup file or a key to get help.

## The short version

There is no engender account, no server that stores journals, no analytics
and no tracking. Everything you write stays on the device you write it on,
encrypted, unless you export it yourself. The developer never receives it
and cannot read it.

## What the app stores, and where

Everything you enter stays in the app's storage on your device: entries,
notes and moods, scales, doses and regimens, lab results, measurements,
appointments, milestones, letters, photos, voice and video recordings,
documents you import, reminders and your settings. The journal database and
your photos are encrypted at rest. None of it is sent to the developer or to
anyone else.

The web app and the Android app keep separate journals. To move a journal
from one to the other, you export an encrypted backup and import it.

## Hosted web app

The web app is served from `app.engender.barankiewicz.dev`. When your browser
loads the app or checks for an update, the server sees the ordinary details
of each request:

- your IP address,
- the time of the request,
- the files requested and their sizes,
- the User-Agent and Referer headers your browser sends.

[OPEN: how long the server keeps these request logs, and whether they are
kept at all.]

The server receives no accounts, profile identifiers, analytics or journal
content. The app loads its fonts and its text recognition files from the
same server and asks nothing of any other site. The first time you scan a
lab photo, the browser downloads the text recognition engine (about 21 MB)
from that server; scanning itself happens on your device.

On the web, the local journal opens in one of four ways:

- A passphrase you type, turned into a key with Argon2id.
- A four-digit PIN, combined with a key tied to this browser profile.
- Biometric verification on browsers that support the WebAuthn PRF extension
  (Touch ID, Windows Hello or your device lock).
- A key kept in this browser profile, which opens the journal without asking.

PIN, biometric and device-bound access depend on keys held in that browser
profile. Clearing the site's data, resetting the browser profile or losing
the device makes that copy of the journal unreadable.

You can also make an optional 25-character recovery key. It opens the
journal on the same device and browser profile if your passphrase, PIN or
biometric authenticator stops working. It cannot move data to a new device
or open an export. The app shows the key once and keeps only a sealed copy
of the journal key. Keep the recovery key on paper or in a password manager
on another device: anyone with it and the journal data can read the journal.
It cannot bring back deleted data.

When you copy the recovery key in a browser, the app tries to clear it from
the clipboard after one minute, if the clipboard still holds it. Browsers
can refuse that, and clipboard managers or sync may already have kept a
copy.

## Android app

Android builds are distributed through Google Play, F-Droid and as an APK
from GitHub. Each channel has its own terms and sees installs and updates
under them.

The Android app does not request the `INTERNET` permission. It opens no
network connections and sends nothing to any server. It also opts out of
Android's cloud backup and of device-to-device transfer, so the system does
not copy the app's storage to Google or to a new phone.

The app requests these permissions:

- `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` and `RECEIVE_BOOT_COMPLETED`,
  so a reminder or the daily check-in can notify you, at the time you chose
  rather than in a batched system window, and still fire after the phone
  restarts.
- `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`, for voice notes, voice
  practice and the sound of video notes.
- `CAMERA`, for video notes and for taking a photo. A photo is taken with
  your phone's camera app, but Android requires the app that asks for it to
  hold this permission once the app declares it.
- `USE_BIOMETRIC` and `USE_FINGERPRINT`, which the AndroidX biometric
  library adds so the app can show the system's fingerprint, face or screen
  lock prompt before it opens the journal. The app never sees your
  fingerprint or face; Android only tells it whether you were verified.

Android also lists `dev.engender.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
It is not something the app asks of you: AndroidX declares it so that only
the app itself can send its own internal messages.

Reminder and check-in notifications show only a generic label by default,
even on a locked screen. A setting under Notifications turns that off and
shows the real title instead.

When you copy the recovery key on Android 13 or later, the app marks the
clipboard entry as sensitive, which asks the keyboard to leave it out of its
clipboard history. The app clears the key after one minute, or when you come
back if you left before then. It never clears something you copied after it.

The Android journal opens in one of four ways:

- A key protected by Android Keystore and released after the screen lock or
  biometric prompt.
- A key protected by Android Keystore and released without a prompt. The
  journal is still encrypted at rest with SQLCipher.
- A four-digit PIN, combined with a key held in Android Keystore.
- A passphrase you type, turned into a key with Argon2id.

Keys held in Android Keystore cannot be copied off the phone. Losing the
phone or clearing the app's data makes that copy of the journal unreadable.
An optional recovery key opens the journal on the same phone if unlocking
fails, but cannot bring anything back once the phone or its storage is gone.

## Backups, exports and shared files

When you export or share a file, you choose where it goes. Other apps handle
shared files and links and may use the network. If you save a file to a
cloud drive or another document provider, that provider can see the file's
name, time, size and the access logs of your account there.

### Encrypted backups

An encrypted backup (`.ttbackup`), whether you export it yourself or Android
writes it on a schedule to a folder you picked, is encrypted with AES-GCM
under a backup password you choose. Nobody can read it without that
password.

### Exports meant to be read

Some exports are deliberately unencrypted because they are meant to be read,
shared or printed:

- CSV and JSON data files exported from Settings.
- Keepsake journal books prepared for printing or PDF.
- Clinician summaries of regimens, vitals, labs and notes, to share with a
  healthcare provider.
- Progress photo collages and timelapse videos.
- Wrapped cards shared as images.
- PDF documents exported back to your device storage.
- Single-event calendar files (`.ics`) for appointments, surgeries or
  milestones.

Anyone who gets one of these files or a printout can read what it contains.
The app asks you to confirm, or to take a deliberate step, before it writes
an unencrypted file.

## Links that leave the app

The Website, Guide, Privacy policy and Source code links in About open in
your browser. They lead to `engender.barankiewicz.dev` and `github.com`,
which see that request like any other website would. GitHub's own privacy
statement applies to pages on GitHub.

## Deleting your data

The developer holds none of your journal data, so there is nothing to ask
anyone else to delete. You can delete everything on your device yourself:

- **In the app.** Settings, then Privacy & data, then Delete everything. This
  removes the journal, photos and recordings, your settings, scheduled
  reminders and the keys that open the journal, and cannot be undone. If you
  used biometric unlock on the web, the passkey it created stays in your
  browser's or device's passkey list until you remove it there. It opens
  nothing once the journal is gone. [OPEN: on Android, a photo whose capture
  never finished can stay unencrypted in the app's cache after this, until
  after-release ticket 11 (audit SEC-03) lands. Land that fix before
  release, or keep this sentence qualified.]
- **On Android.** Uninstalling the app, or clearing its storage in the
  system settings, removes everything the app stored on the phone.
- **On the web.** Clearing the site data for `app.engender.barankiewicz.dev`
  in your browser removes the journal and the keys kept for it.

None of these reach files you exported or shared, including backups written
on a schedule to a folder you picked. Delete those where you saved them.

## Lost keys and passwords

The developer cannot recover a forgotten passphrase, PIN or backup password,
or a lost device key or recovery key.

## Children

[OPEN: the age the app is meant for. The Play listing is planned for adults
only; say so here once that is decided.]

## Changes to this policy

When this policy changes, the date at the top changes with it. Every
earlier version is kept in the history of
https://github.com/engender-app/engender/blob/main/docs/privacy-policy.en.md.

This policy is also available in
[Polish](https://github.com/engender-app/engender/blob/main/docs/privacy-policy.pl.md).
