# Disguise hides the app from the outside, and stops at unlock

Status: Accepted
Decided: 2026-11-02
Last reviewed: 2026-11-12
Supersedes: ADR-0079 (merged in)
Amends: ADR-0065 and ADR-0088 (their disguise clauses); the flag-motif clause of ADR-0035 (now in the design notes)

Disguise is for somebody near the phone who has not unlocked the journal: a
glance at the home screen, the app drawer, a notification, the Recents list,
a file in Downloads or a printout on a desk. On those surfaces the app is a
neutral "Notes". Once the journal is unlocked there is no disguise, and the
app looks the same with it on or off.

## What disguise covers

Each surface reads the disguise, with the code that does it:

- **Launcher icon and drawer name.** One `activity-alias` is enabled at a
  time, and the disguised one outranks every flag (`DisguiseAlias.java`,
  `DISGUISED`). Switching disguise restarts the app so the running task
  and Recents take the new name at once (`DisguisePlugin.setLauncherIdentity`).
- **The lock screen and every gate before unlock.** They draw the neutral
  name on a neutral field (`GateScreen.svelte`, `JournalGate.svelte`,
  `SessionUnlock.svelte`, `AndroidKeyGate.svelte`, `DeviceBoundRecovery.svelte`,
  `BootFailureNotice.svelte`). On Android the first frame asks the shell for the
  live alias (`DisguiseState.java`, read in `src/app.html` and
  `src/lib/data/prefs/boot-cache.ts`), because the restart can land before the
  WebView writes its boot mirror.
- **Home-screen widgets.** The quick-log, tally and Safe Space widgets show a
  neutral header and labels, redrawn when disguise changes
  (`DisguisableWidgetProvider.java`).
- **Notifications.** The small icon is the disguised launcher foreground, and a
  dose reminder's first action says "Done" rather than "Taken"
  (`ReminderAlarmReceiver.java`).
- **Recents and screenshots.** Disguise hides only the Recents card
  (`setRecentsScreenshotEnabled(false)`, Android 13 and later); screenshots and
  recording follow the person's Block screenshots switch as they do for everyone
  (`ScreenCapturePlugin.recentsPreviewShown` and `windowSecure`). Before
  Android 13 the secure flag is the only way to blank the card, so there
  disguise still blocks screenshots. The first build forced the whole window
  secure while disguised, so a tester with capture switched on could not
  take screenshots and nothing said why. The split was chosen on 2026-11-12.
- **Files the app writes.** Export and backup files are named
  `backup-<date>` (`src/lib/data/archive/deliver.ts`), and the printed
  letterhead of the clinician summary and the journal book uses the neutral
  name (`PrintLetterhead.svelte`, `src/lib/data/prefs/documentChrome.ts`).
- **The browser.** The tab title, the favicon and the installed web app's
  name are neutral (`src/app.html` before first paint, `tabIdentity` in
  `src/lib/disguise/identity.ts`, `static/manifest-notes.webmanifest`).
- **The boot mirror.** The plaintext preferences the first frame reads must
  not name the person's flag while disguised. `bootSubset`
  (`src/lib/data/prefs/preferences.ts`) writes the default palette to the
  mirror whenever `disguise` is true, so the first paint and the lock screen
  read a neutral palette. The real palette stays in the preferences table and
  returns to the mirror when disguise goes off. The other
  plaintext hints (tile snoozes, letter read state, `engender-has-entries`)
  moved into the encrypted acknowledgements preference.

## What it does not cover

- **Anything after unlock.** The flag field, the sun, the wordmark, the hub
  tab label, the agenda, chart annotations, Settings, letters, document
  thumbnails and Wrapped render the same either way. The in-app reads were all removed.
- **What Android itself prints.** App info, permission prompts, notification
  headers and the widget picker show the application label, which an alias
  cannot change. TalkBack reads the same label for the Recents task. The setting says so in plain words
  (`disguise_android_gap_note` in `messages/en.json`).
- **Leaving the app.** Quick exit was removed on 2 October 2026. `lockAfter`
  decides when the journal locks behind the person. Disguise hides the app; it
  does not close it.

## Defaults

- **Disguise is off** (`disguise: false` in `src/lib/data/prefs/catalogue.ts`).
- **Block screenshots is off** (`allowScreenCapture: true`). Disguise hides
  the Recents preview on top of that.
- **Notification titles are hidden** (`hideNotificationTitles: true`). A
  reminder shows the channel name and the time, never what it is about, with or
  without disguise (`ReminderAlarmReceiver.resolveNotificationTitle` and
  `resolveNotificationText`). It is a separate switch because content on a
  locked phone can leak with or without a hidden name.

## Setup asks about disguise last

Setup renders the same steps for everybody, and disguise is its last question,
after permissions and before the finish (`src/lib/onboarding/steps.ts`).
Turning disguise on flips the launcher alias, which on Android closes the app,
so setup holds every answer in memory and `complete()` writes `prefs.onboarded`
before the flip. Asking last also means the person has seen what is being
hidden. The step's preview
(`DisguisePreview.svelte`) shows the icon, name and lock screen only.
Assumed, so it can be argued with: whoever runs setup has arranged not to be
watched. If that is wrong, the fix is a way into setup from a disguised
install, not a second flow in it.

## Why the line is at unlock

Somebody who has unlocked the journal is reading it, and a neutral wordmark
over the entries hides nothing. The in-app gates were a second rendering
spread across the UI that every change had to keep in step, and they took the
person's own flag away inside their own journal. Every surface above is seen
by someone who has not unlocked anything.

## How it stays this way

- `src/lib/disguise/boundary.test.ts` fails when a module outside its
  `outsideOwners` allowlist reads the disguise preference, and pins the
  `outsideDisguise(prefs)` call sites. A new outside surface goes on the list on
  purpose, with the reason in the commit.
- `src/lib/disguise/identity.test.ts` is the positive half: each outside
  surface still asks the identity helpers.
- `DisguiseAliasTest.java` walks every alias and holds the one-enabled
  invariant; `CaptureDecisionTest.java` holds the window and Recents decision per capture choice and disguise state, and `DisguiseCaptureTest.java` checks the live window.

History: decided 2026-11-02. Absorbed ADR-0079 (setup offers disguise last) 2026-11-02; it replaced ADR-0035's hidden Home flag band, ADR-0065's disguise argument for no page images in the document list, and ADR-0088's launcher rule. Amended 2026-11-12: see Recents and screenshots.

Amended 2026-11-26: the tally widget is gone.
