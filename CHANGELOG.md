# Changelog

Every release gets a section here before it is tagged, and the release pipeline
reads it: `node scripts/release-notes.mjs` refuses a version with no section of
its own, and refuses a section that leaves one of the four call-outs
unanswered. Those four are what a person needs to know before installing an
update, and "none" is a perfectly good answer to any of them.

## 1.0.0

engender is a journal for tracking how your gender feels day by day and
learning about it from your own entries. Mark each day on scales you name,
keep photos and care records beside your entries on your own device, then
open Look back to see those days together. You choose which areas to use and
what to record.

Use engender as an installable web app or an Android app. Both work offline
and encrypt the journal at rest. There are no accounts, analytics or backend
for journal data. The app includes English and Polish interfaces.

You can record medication doses, lab results, appointments, procedures and
milestones, and prepare a summary for a clinician. Encrypted archives let you
back up the journal or move it between web and Android. Text and PDF exports
let you share selected records.

App lock and disguise mode help keep journal content out of view, and the lock
can close the journal as soon as you leave the app. Android reminders use a
generic label by default. The Android build does not request the INTERNET
permission.

This stable release supports updates from 1.0.0-rc.1. Earlier development
builds, including the August web beta, do not establish a supported update
path.

Pre-squash development journals are not supported; export text or PDF from the old build before starting a new journal.
This release does not open one: it says so at start and offers to restore a
saved archive or start over. An archive from a released version restores; one
made by a development build may not, which is why the text or PDF is worth
taking first.

### Removed since rc.1

These areas are gone, and their data goes with them when an rc.1 journal
updates. Export an encrypted archive from rc.1 first if you want to keep a
copy. A 1.0.0 restore skips the sections for these areas, so the archive stays
a record of what you had but does not bring it back.

- Measurements and sizes: the screen, its Today tile and nudge, and every
  measurement and size you recorded. Lab results are not affected.
- The hormone curve and Care's row for it. It held no data.
- Affirmations, including the line in the check-in notification, and See this
  again, with what you saved in them.
- The journaling pause, with its saved pauses. "Pause check-in until..." on the
  check-in row replaces it.
- Saved questions and the random draw, and the counterevidence snapshots in Good
  moments. Safe Space keeps breathing, good moments, the comfort list and
  resources.
- The Words reading and its ignored-words list, and Highest days in Look back.
- The Wrapped share card and the range period. Week, month and year summaries
  stay. The Wrapped and On this day notifications, Entry nudges and the scales
  follow-up sheet are gone too.
- The roadmap's social, presentational and medical tracks. The legal track and
  your own goals stay.
- Tryouts of the presentation step and garment kinds, with their felt-sense
  readings and photos. A milestone linked to one keeps its record.
- Voice's reference pitch bands, the body map's injection-interval and
  days-since-surgery axes, and Care's "Fold by N days" and "Mood between
  injections" charts.
- The Day One, TransTracks, Track & Graph and Pixels importers. Daylio stays.
- The old addresses of moved screens. A saved bookmark to one now opens the
  not-found screen, with a button to Today.
- The automatic archiving of a procedure 90 days after the operation. Archiving
  is your choice.
- Disguise inside the unlocked app. Disguise now covers what someone near your
  phone sees: the launcher icon and name, the lock and gate screens, widgets,
  notifications and the web tab icon and title.

### New since rc.1

- Reminders follow the dose schedule. Turn on "Remind me" in a schedule and the
  reminder is made, changed and ended with it. A dose reminder offers Taken and
  Skip, and tapping it opens the dose log for that drug.
- Each regimen has a drug class, HRT or other. Timelines count from the first
  HRT regimen, and the clinician summary leaves out other drugs unless you
  switch them in. The summary also has a "Changes noticed" section.
- Appointments can wait without a date. They carry the service, the date you
  were referred and dated status updates, and show "waiting since" as a fact.
  Appointments store a time of day, and you can keep a record for each provider.
- A list of name and document changes per institution, each one submitted,
  waiting or done.
- An optional cost on records, with a currency and a refunded flag, and one
  cost view in Look back. It never converts between currencies.
- Today can show the time since your starting milestone. Each milestone has a "don't
  celebrate" switch, and anniversaries respect muted eras.
- Search filters by mode, body region and a scale's range.
- Stock purchases take an expiry date and a pharmacy note. Wear shows weekly
  hours, and the photo library has a Starred chip.
- Hair removal adds cheeks, jawline, sideburns and a surgical-site area, session
  length in minutes, and an optional pain rating. Dilation stages can be set as
  times a day.
- Trash can delete an entry forever. Other deletions show a timed Undo.
- Archive Merge applies edits and deletions, and Android can merge a newer
  archive from your backup folder after unlock. The web build has no folder sync.
- Resources lists Polish 24-hour lines.
- "Back up now" no longer changes the saved backup password without asking.

### Changed since rc.1

- Today shows fewer tiles: the voice benchmark nudge, the hair removal recovery
  notice, the active tryout tile and the appointment-today tile are gone, and
  the patch schedule now sits in the dose panel. Quick add offers "Log dose" only while a regimen is
  running. Onboarding no longer asks which areas you want.
- The onset bands in Changes sit behind "What the literature says", sourced from
  SOC8 or the studies it cites. Duplicate and stereotype-coded effects are hidden
  from the catalogue, and rows that use them keep them.
- Lab slip scans keep the slip's own value and unit instead of converting it.
- Surgery has one Notes field and one Checklist for every phase.
- Built-in scales that duplicate each other are hidden in new journals only.
  Custom scales can be renamed and hidden.
- The clinician summary is one layer with one set of labels.
- Tile snoozes, opened-letter marks and the has-entries flag move from browser
  storage into the encrypted preferences, and letter marks now travel with
  backups.
- While disguise is on, Android blocks screenshots and the Recents preview. The
  launcher icon names changed, so after updating check that the icon you expect
  is on your home screen.

### Fixes and smaller changes

If the journal remains on a device but its access information is missing or
unreadable, the app now offers recovery instead of first-run setup. A retained
recovery key opens the same journal and asks for a new access mode. Without a
usable key, Archive recovery and reset still require confirmation. Setup also
refuses to create a new key over retained data.

The "A new version is ready" notice now sits under the coloured header of the
screen you are on, as wide as the screen's content. On a wide screen it used
to take a column of its own beside the menu and, at 1024px, leave the screen
about a quarter of the window. Closing the notice now keeps it closed when you
move between screens or the app locks and you unlock it; the next time you
open the app it offers the update again. Unlocking quickly also restores the
screen you were using instead of leaving its content blank.

Replacing the recovery key no longer stops the old key working before you have
the new one. The old key keeps opening the journal until you confirm the new
key is written down. If the app closes or is killed first, the next unlock
says the replacement did not finish, and you can type the new key to finish,
make another, or keep the old one.

Today's sun and mood faces pause after 30 seconds without input. Touch,
keyboard or assistive input resumes them from where they stopped. Hidden Today
screens pause too. Reduced-motion settings still remove these loops.

Back during first-run setup now returns to the previous step and keeps your
answers. Finishing setup removes it from the way back from Today.

Android now recovers when its WebView renderer stops instead of closing the
app. The journal opens as it does after restarting the app, with an unsaved
entry draft kept.

Android Back now backgrounds the app from a lock or key screen. Unlocking
returns to the screen that was locked, including after Back and reopening.

An address the app does not know now opens a screen of its own. A stale
bookmark used to land on a bare "404 Not Found" in English with nothing to
press. It now has a header, one sentence in your language and a button to
Today, and it never shows the address that failed.

Safari tabs now offer installation advice: Add to Home Screen on iOS, Add to
Dock on macOS. The notice keeps the encrypted-backup reminder and appears even
when Safari grants persistent storage.

Android can open after an update even when storage is completely full. The
backup scheduler used to crash before the journal could show its storage
notice. A scheduler that cannot start reports a failed automatic backup; free
space and reopen the app to restart scheduling.

Running out of storage space now says so. Saving an entry or a photo, opening
a journal whose update needs room, and exporting each tell you to free up some
space and try again, where they used to show a general error. An export says
whether this device or the place you picked to save it is full, and it stops
before writing when that place reports too little room. A photo that could not
be written no longer leaves an empty file behind.

Reminders and Notifications check again when you come back from Android's
settings. Allowing notifications or exact alarms there and returning used to
leave the "not allowed" notice up until you left the screen. Reminders now has
one notice for each permission. When exact alarms are off, it says reminders
may arrive late until they are allowed again, and that turning them off
cancels reminders already set until the app next opens or the phone restarts.
If Android does not answer when the app checks, both screens say so and offer
to try again.

Hide sensitive titles now says what happens to shown titles in Android's
notification history. With the setting off and Android's notification history
on, reminder names and details stay there for about a day. Reminders still
hide their titles by default.

The calendar button on an entry's or a milestone's photo in the library now
sits on the photo's top-left corner. It used to cover the start of the date
under the photo, and a tap on that part of the date opened the day editor
instead of the photo.

An era's name on the Milestones timeline no longer runs into the today dot.
The last letter of an era ending today used to touch the dot's ring, and at
200% text the name was cut off. A band that is too short for its name now
grows a little at its roomier end.

The dates on Two scales at once no longer sit under dots or trail lines, and
every one is readable. A date used to be written up and to the right of its
dot whatever was drawn there, and older dates faded with their dots until some
were barely visible. A date now goes on whichever side of its dot is clear, is
left out if no side is, and is drawn at full strength. While the path plays or
you scrub it, the dates fade out, and they fade back in once it stops.

A chosen switcher option scrolls clear of the arrow at the switcher's edge
instead of ending under it. The arrows fade in and out as the switcher
scrolls. Wrapped's periods are one word each now (Week, Month, Year), so the
Polish ones fit whole at 200% zoom.

At 200% zoom on a phone, or with text at 200%, Journal's month name is whole
again. It used to lose its last letters ("Octobe") and run into the search
button, which now sits on the line under the month. On Lab results, the
buttons beside Back move to their own line under it, so Back no longer sits
partly under the first of them. A long word in an In the room question breaks
onto the next line instead of running off the screen. And the bottom few
pixels of every Back button, which used to land on the screen's title, now
count as Back.

The next appointment card on Appointments uses the app's own font. Its visit
type, day and place had been showing in the system font.

Export & import no longer shows a tick beside "No export recorded on this
device". The tick now means a backup was made in the last 30 days, and an
older one keeps its warning mark. When an export changes the mark, the old one
fades out and the new one fades in.

A double tap writes once when adding a custom effect type, an appointment prep
item or a felt-sense reading, ticking or flagging a prep item, using Add to
appointment prep or saving a dilation schedule. A failed write there now says
so and keeps what was typed. Adding the same item again later still adds it.

Saving or deleting an entry returns to the list that opened it, including
Voice recordings, margin-note search results, Today tiles and chart markers.
Voice keeps its selected tab.

History Back and Forward restore the question shown in In the room alongside
its answers. A fresh visit starts at the first question; locking clears the
held position and answers.

Taken and changed doses require an amount greater than zero. The editor
explains invalid amounts, and the save boundary rejects them. Existing dose
records and skipped slots keep their values.

Closing a changed margin note asks before discarding it. Keep editing returns
to the same note; an untouched note closes without a question.

Good moments and Tryouts draw once, when everything they show has loaded. A
running tryout with readings no longer says "No felt sense recorded yet"
first.

Modes and Templates close when navigation changes the screen, including
browser Back. Legacy manager links still open their sheet in Settings.

Back from a day or entry restores the Journal month and expanded recent days
on web and Android. Opening Journal afresh still starts at the current month
and five days.

Regimen episodes, dose pauses and tryouts refuse an end date before their
start. Equal dates and an empty end date remain valid. Existing records are
left as stored.

Screen readers announce lab values and units, crisis line numbers and web
domains, and voice benchmark pitches.

Arrow keys in the Language sheet move focus without changing the language or
reloading the app. Enter, Space or a tap applies the choice.

A failed Restore in Trash now says so and leaves the entry in the list to try
again. A second tap while a restore is running does nothing. A restored row
closes its height instead of vanishing, and restoring the last one hands the
screen to the empty state the same way.

Deleting a second entry while the first one's "Moved to trash" message is
still up no longer covers the first Restore. The newer message now appears
above the older one, so both Restore buttons can be tapped, and the older
message stays where it was. When one goes, the other slides into its place.

Month names in Year wrapped no longer run together. A phone shows the months
six to a row and 200% zoom four to a row, so names such as Sept and Oct stay
apart. A wide window keeps all twelve in one row.

A month counted from the 29th, 30th or 31st ends on the last day of a shorter
month. "Last logged" lines, milestone gaps, sealed letters and photo
comparisons say "1 month" from 31 January to 28 February, where they said "28
days", and "2 months" from 31 December to 28 February, where they said "1
month".

Keyboard focus follows Today edits, access-mode and recovery-key steps, and
successful Trash restores and notice dismissals. Unlocking focuses the arrived
screen's heading, including on Android with other doors retained in the
background.

Saving a custom scale, reminder or new tryout no longer leaves its completed
form in Back history. Deleting a document also removes its detail screen from
that history.

Tryout reflections and recovery notes keep spaces while you type. Recovery
notes also keep line breaks and can be cleared before saving. Surrounding
whitespace is removed only when saving the draft.

Letters opened from a link stay folded after closing. Saving a lab result
after following a link keeps the selected analyte on screen.

An opened letter's row takes a tap across its whole height, at least 48px,
where an unread one had answered only on its 23px line of text. The year tabs
on the photo library's rail reach a full 48px; they were 47px.

A new recovery key comes back on screen after unlocking when the app locked
before "I have written it down" was tapped. Leaving the app to copy the key
under the Immediately lock had lost it, and replacing a key had already
stopped the old one from working.

Copy on the recovery key works on Android. It used to fail every time with
"Could not complete this action". The key now goes on the clipboard, and the
app clears it a minute later, as the note under the button says.

Lab result, wear duration and wear reminder fields keep a decimal point or a
minus sign while it is being typed. Typed one key at a time, 72.5 had been
saved as 572 and 0.5 as 50.

Turning disguise on or off in Settings is saved before Android swaps the
launcher icon and restarts the app, so the next launch no longer undoes it.

With disguise on, an app opened from a widget, a reminder or the check-in
notification shows Notes and the neutral icon in Recents, and a screen reader
announces Notes. These had opened under the real name and icon. With disguise
off, the same taps show the chosen flag rather than the default one.

Hidden tabs give visible journal refreshes a short head start after a save,
then refresh their cached readings in the background.

Photo normalization runs in a worker to avoid Android’s idle-encoder delay.
Dose comparisons reuse schedules already read for the same operation.

Android channel guidance retains Play's existing signing key and records the
planned F-Droid route using the GitHub APK's developer signature.
GitHub/F-Droid switching remains unverified pending reproducibility and
installed-update proof.

The Node test suite runs 480 seeded importer and sniffer fuzz cases. A
24,000-case run is available with `FUZZ_LONG=1 FUZZ_SEED=7`. Failures retain
their exact inputs and seed/index receipts for replay.

The entry editor keeps Save, star and mood controls above the Android keyboard
in landscape. Wide layouts use one footer row without shrinking touch targets.
When the keyboard leaves too little height for both text and navigation, the
editor hides the bottom navigation until the frame grows again.

Recovery-key creation, replacement and access-mode changes now require fresh
current-protection approval. Web device-bound mode explains its
unlocked-session exception; Android unlocked mode requires biometrics or an
existing recovery key. Recovery unlock approves one immediate protection
setup. Cancelled or stale prompts cannot publish a replacement wrap.

Release verification rejects APKs and App Bundles signed by an unexpected
certificate, even when the signature itself is valid.

Android manual exports survive activity recreation while the save picker is
open. Interrupted writes leave a cleanup record for the chosen destination;
the app retries removal at its next start and reports when access is refused.

Archive import identifies non-object JSON headers as corrupt files before key
derivation, including a header containing only `null`.

Android always asks keyboards not to learn words typed in the app. Keyboard
support controls whether the request works; previously learned words remain.

A scheduled Android backup failure posts one notice across later checks and
app restarts. Quiet-hours holds survive restarts; a later failure can notify
again after a successful backup or a destination change.

Leaving or locking the entry editor cancels pending voice and video capture.
Repeated taps open one stream, and video recorder failures close the camera
and microphone. Failed captures offer a retry without attaching partial media.

Web rollback with `--previous` returns to the release active before the last
switch, including after an earlier rollback. Listing and deploy output
identify the same target. Missing or stale history requires a named rollback;
the schema safety guard remains in place.

Android's key gate keeps its retry available when a cold start reaches the
prompt after the app has gone into the background. Returning to the app no
longer leaves the unlock button waiting for a prompt that never opened.

Android requires WebView 104 or newer. The declared floor now covers the
computed CSS transforms and door selectors used during navigation. The source
guard checks those features alongside JavaScript API calls.

Medication stock treats trimmed drug-name case variants as one count,
including Unicode names. A refill updates the existing row and its run-out
reminder. The upgrade from rc.1 keeps the latest updated complete stock row
when older journals contain case duplicates; a later local rowid breaks
timestamp ties. The chosen row's automatic reminder survives, while manual
reminders remain untouched.

Legacy Archives with case-duplicate stock restore one complete choice and its
automatic reminder. Archives have no edit timestamps, so the last eligible row
in Archive order wins. Merge keeps this device's stock and reminder owners.

Android opts out of WebView diagnostic uploads while keeping Google Safe
Browsing enabled at its default. Both privacy policies explain that the
keyboard and browser can make network requests independently of the app.

A browser restart after an interrupted Start over discards the erased
journal's mirrors before onboarding. Reset keeps credential wraps until the
other journal files are removed, so a refused data deletion keeps their key.

Archive import refuses headers asking for more than 64 MiB of Argon2id memory,
six iterations or one lane before deriving a key. This allows twice the
released profile's combined cost. Archives written with the released default
keep opening; export still uses 64 MiB and three iterations.

Android reminders reschedule after clock changes and exact-alarm permission
grants, even while the journal is closed. After permission is revoked, the
next app launch or boot restores inexact alarms, including when launch stops
at the journal gate. A pending reminder missed while the phone is off is
delivered once at boot, with quiet hours and title hiding preserved. Recurring
reminders then resume at the next future occurrence; one-off reminders stay
one-off. After a time zone change, a daily slot already delivered less than 12
hours ago does not repeat. Future daily slots remain eligible, including after
restart.

An open web page keeps its cached release assets when another page applies an
update. Deferred screens and journal reopening continue offline; retained
pages keep their drafts and pending saves until they choose to reload.

An open web page can open its first PDF after a deployment changes the PDF
worker filename. Deployment and rollback keep exact workers from the selected
and outgoing releases reachable, without changing the original release files.

Archive Merge restores a bundled goal's status when this device has only
hidden it. The local hidden choice stays in place, and a locally recorded
status still wins over the Archive's.

Changing from device-bound access to a secret now reports an incomplete change
when the old key cannot be removed. Retrying a published PIN keeps its binding
key. On the web, a successful secret unlock also removes leftover device-bound
material from an interrupted change and verifies that it is gone.

SQLite transaction failures keep their original message when rollback also
fails. Full-disk errors remain identifiable, with rollback refusal retained as
secondary diagnostic information.

A damaged Daylio backup receives the importer's existing failure type.
Malformed JSON fields are refused before parsing can fail on a string or
collection operation. Duplicate incoming identities that would fail during
commit are refused during preview. Unexpected runtime failures remain visible
to callers.

Source packages exclude root local-evidence paths, and CI rejects them if they
are tracked. Application evidence routes and intentional fixtures remain in
the source package.

Android saves each PIN attempt before checking it. Closing or restarting the
app keeps the count and its growing wait. A correct PIN clears both; missing
access settings or device keys still do not count as guesses.

Android no longer requests unused network-state and foreground-service
permissions. Scheduled encrypted backups retain their wake lock, which both
privacy policies now explain. Release checks inspect the complete APK
permission set and refuse unexpected dependency additions.

Daylio photo previews locate ZIP members once instead of rescanning preceding
attachments for every photo. Stored and deflated backups retain the same
attachment identities, content and size limits.

Archive Replace now commits portable preferences with its journal rows. An
interrupted restore keeps a complete old or incoming pair. Restored language
choices take effect after commit and recover on the next opening; Merge still
keeps this device's preferences.

Care-caption collisions and reported appointment-debrief failures now fail CI
instead of appearing only in guard logs.

Lock and disguise clear journal announcements, pending speech and toast
actions. Fresh gate feedback and later authenticated confirmations remain
available.

Browser history navigation waits for an admitted journal transaction before
retiring its worker. Saves can commit before returning through Back or
Forward; stalled workers still reach the existing disposal limit.

Repeated browser Back and Forward navigation can resume the journal even when
an earlier return was cancelled while reopening. Explicit locks still require
fresh authentication.

Web unlock and retained navigation now check journal compatibility before
reopening access. Older pages refuse a journal upgraded by newer code and
offer the same update recovery as cold boot. Supported older journals use the
existing migration path.

A PIN entered during another access change now waits for that operation
instead of counting as a wrong guess. Cold start, session unlock and the
current-PIN check in Settings also keep unreadable or changed access settings
outside the wrong-attempt count and explain how to reopen the app. Leaving or
locking still cancels the pending unlock.

When a browser no longer holds a journal's PIN binding, unlock shows the
existing lost-key guidance. It does not count the attempt as a wrong PIN or
create a replacement key.

Boot housekeeping waits for pending journal writes before purging expired
Trash and sweeping orphaned media. Android stock-reminder reconciliation no
longer makes those passes give up before they start.

Dose schedules now pair logged doses consistently across Today, Care and
Transition. An early or late dose within the schedule's tolerance covers its
slot, so a covered weekly slot no longer prompts another dose today.

New automatic dose rows retain their scheduled episode, day and position after
a time zone change. Logged timestamps stay unchanged. Existing duplicate rows
are left for the person to review; this update does not merge or delete them.

Care links now carry episode IDs instead of typed drug names. Marks, Log and
Back keep their lane and date without adding medication text to browser
history. Existing browser history is not rewritten.

Journal text fields now disable browser autofill and session restoration on
the web. Android keeps its existing keyboard suggestions. Text already kept in
browser profiles is not removed.

Archive restore and verification now reject known malformed rows as corrupt
before Merge or Replace touches destination files or starts a transaction.
Checks include missing identities and references, wrong scalar types, unsafe
integers, invalid stored categories or directions, repeated identities and
unknown template tags. SQLite still enforces remaining constraints inside the
transaction; storage failures keep their own errors.

Archive restore and verification also refuse attachments that share physical
file names across different owners, including thumbnails and document
previews. Merge and Replace reject them before changing files or rows.
Missing-file placeholders and ordinary destination filename collisions still
restore.

Merging an older Archive after renaming medication stock now keeps the current
count and restores unrelated missing entries. An existing stock uuid or
trimmed, case-insensitive drug key keeps the destination's choice. Replace
still restores the Archive's counts.

Opening or closing a photo, picking a photo filter, zooming or paging a
document and changing a comparison keep the screen where it was. They used to
jump back to the top.

Regimen rows show the interval in the app's language. In Polish they used to
say "daily" and "weekly" in English, and an episode still running read "lut
2026 do trwa". It now reads "od lut 2026", and an ended one "od sty 2025 do
lut 2026". The clinician summary's interval column follows the same words. An
interval you typed yourself is shown as you wrote it.

Web installation now includes English and Polish lab recognition before
offline readiness. OCR assets share an immutable generation; a failed update
keeps the installed release usable. Recognition still starts only when a scan
is requested.

Android lab scanning finds its bundled English and Polish language data on the
first offline scan. Release checks reject missing or renamed OCR assets in the
APK.

Android automatic backups sync the local file and folder, then check the
delivered bytes before reporting success or pruning older backups. Unsupported
providers report incomplete delivery and preserve the last good backup.

Android PIN and journal passphrase changes wait until the credential wrap is
saved to app-private storage and synced. Released OPFS wraps move there on
first use. A failed change asks you to keep both credentials until the active
one is checked.

Search queries held for returning from an entry stay in memory and are cleared
on lock. They no longer leave plaintext copies in browser storage. Reloading
an entry clears the held query and filters.

- Schema changes: this release uses schema {{schema}}. Journals from 1.0.0-rc.1 start at schema 88 and migrate forward on first open.
- Archive format changes: format 2 stays format 2. Archives made by rc.1 still restore, and the sections of the removed areas are skipped on restore. A 1.0.0 archive holds sections rc.1 does not know, so rc.1 may refuse it as made by a newer version. Archives from development builds are not a supported restore path.
- Security migrations: none. Play retains its separate signing key and update path. The planned F-Droid route preserves the GitHub APK developer signature, but switching between GitHub and F-Droid remains unverified pending reproducibility and installed-update checks. Before uninstalling to leave an incompatible channel, export an Archive and verify restoration on a separate disposable installation.
- Minimum supported version: 1.0.0-rc.1.

## 1.0.0-rc.1

This first release candidate includes the current app and the updated English
and Polish wording, Android widget labels, store descriptions and privacy
policies. It is intended for testing before the stable 1.0.0 release.

The journal stays on your device. Export an encrypted archive before replacing
an existing installation. Earlier development builds do not establish a
supported update path.

- Schema changes: this candidate establishes schema 88. Pre-squash development journals are not supported; export text or PDF from the old build before starting a new journal.
- Archive format changes: this candidate establishes archive format 2. Archives from development builds are not a supported restore path.
- Security migrations: none for this first candidate.
- Minimum supported version: 1.0.0-rc.1 is the first release candidate; there is no earlier supported version to update from.
