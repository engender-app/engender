# 09 - sec: What leaks outside the app on Android

Status: done
Type: bug
Audit findings: S-02, S-01, S-03, S-04, V06
Severity: P2
Blocked by: none
Size: M
Size note: one to two days
Model: opus
Model note: (native privacy boundaries; each part needs care not to break lock or capture)
UI: no (copy only: the disguise gap note and the backup file wording). No
`/impeccable` pass.

All five are places where the journal shows itself outside the app, to the
people this app is meant to protect its users from. Source review only so far;
S-01 to S-03 want one check on the phone (the shared Pixel; use the `.test`
applicationId, never her real app, and touch only your own adb forward).

## Problems

**S-02, Recents shows the journal after lock (regressed).** Screen capture is
allowed by default since `c8efa941` (29 September):
`ScreenCapturePlugin.java:40-41` reads `getBoolean(KEY_ALLOWED, true)`,
`catalogue.ts:485`. `MainActivity.lockOnLeave` adds `FLAG_SECURE` only when lock
timing is "immediately"; the default is "restart" (`catalogue.ts:483`). So
Recents keeps a thumbnail of the unlocked journal, which breaks phase-2 ticket
15's acceptance ("does not leak Journal content into the recents preview when
locked").

**S-01, disguise does not cover notifications.** `AndroidManifest.xml:56`
labels the application `@string/app_name` ("engender"); Android draws the
notification header from the application label, not the enabled launcher
alias. The small icon is the brand mark (`ReminderAlarmReceiver.java:73,107`,
`RetrospectiveNotificationsPlugin.java:111`). The in-app note
`disguise_android_gap_note` (`messages/en.json:786`) lists Settings, app info
and the widget picker, not notifications.

**S-03, camera capture.** `PhotosPlugin.java:63-69` sends
`ACTION_IMAGE_CAPTURE` without `EXTRA_OUTPUT`; `:146-158` reads
`extras.get("data")`, the low-resolution thumbnail. Some camera apps also save
their own copy to the gallery (plausible, untested). `picker.ts:167-170` says
nothing is written to MediaStore. The same path feeds lab OCR
(`ocr-adapters.ts:24`), which a thumbnail makes close to useless.

**S-04, any app can log a tally.** Launcher aliases are exported;
`MainActivity.captureReminderRoute` stores any `gd_route` that passes
`sanitizeLaunchRoute` (`ReminderScheduler.java:164-218`), whose allowlist
includes `/?tally=misgendered`; `src/routes/+page.svelte:611-616` logs it.

**V06, backup file names.** `src/lib/data/archive/deliver.ts:33-40` names
exports `${nameSlug}-journal-${date}.ttbackup` regardless of disguise (live:
`alice-journal-2026-10-03.ttbackup`), and the UI says "Choose a .ttbackup
file...".

## What to build

- S-02: when the journal has a lock, API 33+ calls
  `setRecentsScreenshotEnabled(false)`; below 33, `FLAG_SECURE` on leave for
  every timing that will lock, cleared on return when capture is allowed.
  Screenshots stay allowed as Alicja decided.
- S-01: add notifications (and permission prompts) to the gap note in both
  languages. If cheap, a neutral small icon while disguised.
- S-03: `EXTRA_OUTPUT` to a file in the app cache through a FileProvider
  limited to that one path; read, then delete. Full-resolution photo and OCR
  input. Correct the `picker.ts` comment to what is guaranteed.
- S-04: a per-install nonce in SharedPreferences, put in the app's own
  PendingIntents (`AppLaunch.openAppIntent`, widgets); `gd_route` accepted only
  with it.
- V06: a neutral file name when disguised (date and a generic word), and
  "backup file" in the copy.

## Acceptance

- [ ] With a lock set and default timing, Recents shows no journal content
      after leaving (checked on the phone).
- [ ] The gap note names notifications, English and Polish.
- [ ] A captured photo is full resolution; no gallery entry appears on the
      phone tested; the cache file is gone afterwards.
- [ ] An intent from outside the app with `gd_route=/?tally=...` logs nothing.
- [ ] A disguised export's file name carries no name or "journal".
