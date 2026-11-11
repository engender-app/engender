# Privacy policy

Last updated: 2026-11-11

engender is a journal for tracking a gender transition, made and published
by Alicja Barankiewicz in Warsaw, Poland. This policy covers the Android
app, the web app, the website and guide, and support messages.

## Contact

- Email: engender-app@pm.me
- Bugs and general questions: https://github.com/engender-app/engender/issues
- Security problems: https://github.com/engender-app/engender/blob/main/SECURITY.md

You never need to send journal content, a backup file or a key to get help.

## Your journal

There is no engender account and no server holding your journal. Your
journal stays on your device, and none of it is sent to the developer or to
anyone else. Its database and media are encrypted at rest.

Two things sit outside that encryption. What the app needs before you
unlock it is stored unencrypted: theme, palette, language, disguise, lock
timing and the details of how the journal unlocks. On Android, a photo you take passes through an
unencrypted temporary file in the app's cache before engender imports and
encrypts it.

The developer cannot recover a forgotten passphrase, PIN or backup password,
or a lost device key or recovery key.

## Android app

The Android app does not request the `INTERNET` permission. It opens no
network connections and sends nothing to any server. It also opts out of
Android's cloud backup and device-to-device transfer. Wherever you download
the app from (GitHub, Google Play or F-Droid) handles that download under
its own terms.

Android itself does a few things the app can only partly control. The app
opts out of WebView diagnostic uploads to Google, but Google Safe Browsing
stays at WebView's enabled default, and its checks can use Google Play
services' network access. The app asks your keyboard not to learn what you
type, and the keyboard can ignore that. Your
keyboard and browser can make their own network requests
independently of engender.

The app has these permissions:

- `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` and `RECEIVE_BOOT_COMPLETED`
  for reminders at the time you set, including after a restart.
- `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` for recording your voice and
  the sound of video notes.
- `CAMERA` for photos and video notes.
- `USE_BIOMETRIC` and `USE_FINGERPRINT` for the system's unlock prompt. The
  app never sees your fingerprint or face.
- `WAKE_LOCK` to finish a scheduled backup while the screen is off.
- `dev.engender.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, which an
  Android library adds so that only the app can send its own internal
  messages.

## Web app

The web app is served from `app.engender.barankiewicz.dev`, on an OVH
server. Your journal stays in your browser and is never uploaded. Loading
the app or an update is an ordinary web request, so the server sees your IP
address, the time, the address requested and the User-Agent and Referer
headers your browser sends. Access logs are turned off. Error logs can hold
an IP address and the address requested, and are kept for at most seven
days.

Fonts and the files for text recognition come from the same server. Scanning
a lab result happens on your device.

## Website and guide

The website, the guide and this policy at `engender.barankiewicz.dev` are
hosted by lh.pl, which keeps access and error logs. Those can include IP
addresses, requested addresses and browser headers. The site remembers your
language and theme in your browser's local storage.

## Page-opening counts

The website and the web app send one empty request each time they are opened
online. The Android app sends none. The request carries no journal data,
page name, referrer or cookie. The server that receives it sees your IP
address and browser headers, as with any request, and drops them before
adding one to a total for either "app" or "website" in a self-hosted
GoatCounter.

Only those hourly totals are kept. They are kept indefinitely and only the
developer can see them. There are no visitor identifiers, sessions, or
breakdowns by location or device. A reload counts again, so the totals
measure openings, not people.

## Files you export

A backup or an export goes where you send it, and whatever app or service
receives it handles it under its own terms. An encrypted backup (`.ttbackup`)
can only be opened with the backup password you chose. Other exports are
meant to be read, shared or printed, so they are not encrypted: CSV and JSON
data, journal books, clinician summaries, photo collages and timelapses,
PDFs and calendar files. Anyone who gets one of those can read it.

## Deleting your data

- In the app: Settings -> Privacy & data -> Delete everything.
- On Android: uninstall the app, or clear its storage in the system
  settings.
- On the web: clear the site data for `app.engender.barankiewicz.dev` in
  your browser.

None of these removes files you have already exported or backed up. Delete
those where you saved them.

## Support messages

If you write to engender-app@pm.me, the developer receives your email
address, your message and any attachments, and uses them to answer you.
Please don't send a real journal, backup, password or recovery key. If you
send one by mistake, it is deleted when noticed. Support email is deleted
within 30 days of the request being resolved, and you can ask for it to be
deleted sooner.

GitHub issues are public, and GitHub's own policies apply to them.

## Age

engender is for any trans person. There is no minimum or maximum age and no
age verification.

## Changes to this policy

When this policy changes, the date at the top changes with it. Earlier
versions are in the history of
https://github.com/engender-app/engender/blob/main/PRIVACY.md.

This policy is also available in
[Polish](https://github.com/engender-app/engender/blob/main/PRIVACY.pl.md).
