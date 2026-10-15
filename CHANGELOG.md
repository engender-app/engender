# Changelog

Every release gets a section here before it is tagged, and the release pipeline
reads it: `node scripts/release-notes.mjs` refuses a version with no section of
its own, and refuses a section that leaves one of the four call-outs
unanswered. Those four are what a person needs to know before installing an
update, and "none" is a perfectly good answer to any of them.

## Unreleased

The calendar button on an entry's or a milestone's photo in the library now
sits on the photo's top-left corner. It used to cover the start of the date
under the photo, and a tap on that part of the date opened the day editor
instead of the photo.

A chosen switcher option scrolls clear of the arrow at the switcher's edge
instead of ending under it. The arrows fade in and out as the switcher
scrolls. Wrapped's periods are one word each now (Week, Month, Year,
Range), so the Polish ones fit whole at 200% zoom.

A double tap writes once when adding a custom effect type, an appointment prep
item or a felt-sense reading, ticking or flagging a prep item, using Add to
appointment prep, saving a dilation schedule, or starting or resuming a
journaling pause. A failed write there now says so and keeps what was typed.
Adding the same item again later still adds it.

The hormone curve says "1 dose" when one logged dose has no curve.
Dose counts use the catalogue's plural forms in English and Polish.

Saving or deleting an entry returns to the list that opened it, including
Voice recordings, margin-note search results, Today tiles and chart markers.
Voice keeps its selected tab and the hormone curve keeps its day range.
Saved questions show their results again on a warm return from an entry.

History Back and Forward restore the question shown in In the room alongside
its answers. A fresh visit starts at the first question; locking clears the
held position and answers.

Taken and changed doses require an amount greater than zero. The editor
explains invalid amounts, and the save boundary rejects them. Existing dose
records and skipped slots keep their values.

Closing a changed margin note asks before discarding it. Keep editing returns
to the same note; an untouched note closes without a question.

Modes and Templates close when navigation changes the screen, including
browser Back. Legacy manager links still open their sheet in Settings.

Back from a day or entry restores the Journal month and expanded recent days
on web and Android. Opening Journal afresh still starts at the current month
and five days.

Regimen episodes, dose pauses, journaling pauses and tryouts refuse an end
date before their start. Equal dates and an empty end date remain valid.
Existing records are left as stored.

Screen readers announce lab values and units, crisis line numbers and web
domains, and voice benchmark pitches. Measurement charts describe their
measurement type, unit and date range instead of announcing an edit action.

Arrow keys in the Language sheet move focus without changing the language or
reloading the app. Enter, Space or a tap applies the choice.

A failed Restore in Trash now says so and leaves the entry in the list to
try again. A second tap while a restore is running does nothing. A restored
row closes its height instead of vanishing, and restoring the last one hands
the screen to the empty state the same way.

Keyboard focus follows Today edits, access-mode and recovery-key steps,
and successful Trash restores, word un-ignores and notice dismissals.
Unlocking focuses the arrived screen's heading, including on Android with
other doors retained in the background.

Disguise now covers the app name in Settings, About, recovery and unlock
messages, boot failures and archive errors in both languages.

Saving a custom scale, reminder or new tryout no longer leaves its completed
form in Back history. Deleting a document or saved question also removes
its detail screen from that history.

Tryout reflections and recovery notes keep spaces while you type. Recovery
notes also keep line breaks and can be cleared before saving. Surrounding
whitespace is removed only when saving the draft.

Letters opened from a link stay folded after closing. Saving a lab result
after following a link keeps the selected analyte on screen.

A new recovery key comes back on screen after unlocking when the app
locked before "I have written it down" was tapped. Leaving the app to copy
the key under the Immediately lock had lost it, and replacing a key had
already stopped the old one from working.

Measurement, lab result, wear duration and wear reminder fields keep a
decimal point or a minus sign while it is being typed. Typed one key at a
time, 72.5 had been saved as 572 and 0.5 as 50.

Turning disguise on or off in Settings is saved before Android swaps the
launcher icon and restarts the app, so the next launch no longer undoes it.

With disguise on, an app opened from a widget, a reminder or the check-in
notification shows Notes and the neutral icon in Recents, and a screen
reader announces Notes. These had opened under the real name and icon. With
disguise off, the same taps show the chosen flag rather than the default one.

Release verification rejects APKs and App Bundles signed by an unexpected
certificate, even when the signature itself is valid.

Archive import identifies non-object JSON headers as corrupt files before
key derivation, including a header containing only `null`.

Android always asks keyboards not to learn words typed in the app. Keyboard
support controls whether the request works; previously learned words remain.

A scheduled Android backup failure posts one notice across later checks and
app restarts. Quiet-hours holds survive restarts; a later failure can notify
again after a successful backup or a destination change.

Leaving or locking the entry editor cancels pending voice and video capture.
Repeated taps open one stream, and video recorder failures close the camera
and microphone. Failed captures offer a retry without attaching partial media.

Web rollback with `--previous` returns to the release active before the
last switch, including after an earlier rollback. Listing and deploy output
identify the same target. Missing or stale history requires a named rollback;
the schema safety guard remains in place.

Android's key gate keeps its retry available when a cold start reaches the
prompt after the app has gone into the background. Returning to the app no
longer leaves the unlock button waiting for a prompt that never opened.

Android requires WebView 104 or newer. The declared floor now covers the
computed CSS transforms and door selectors used during navigation. The
source guard checks those features alongside JavaScript API calls.

Medication stock treats trimmed drug-name case variants as one count, including
Unicode names. A refill updates the existing row and its run-out reminder.
Schema 91 keeps the latest updated complete stock row when older journals
contain case duplicates; a later local rowid breaks timestamp ties. The chosen
row's automatic reminder survives, while manual reminders remain untouched.

Legacy Archives with case-duplicate stock restore one complete choice and its
automatic reminder. Archives have no edit timestamps, so the last eligible
row in Archive order wins. Merge keeps this device's stock and reminder owners.

Android opts out of WebView diagnostic uploads while keeping Google Safe
Browsing enabled at its default. Both privacy policies explain that the
keyboard and browser can make network requests independently of the app.

A browser restart after an interrupted Start over discards the erased
journal's mirrors before onboarding. Reset keeps credential wraps until the
other journal files are removed, so a refused data deletion keeps their key.

Archive import refuses headers asking for more than 64 MiB of Argon2id
memory, six iterations or one lane before deriving a key. This allows twice
the released profile's combined cost. Archives written with the released
default keep opening; export still uses 64 MiB and three iterations.

Archive Merge keeps an entry's current revisit when an older Archive carries
a different one. Archives with two revisits for one entry are refused before
they can change the journal.

Android reminders reschedule after clock changes and exact-alarm permission
grants, even while the journal is closed. After permission is revoked, the next
app launch or boot restores inexact alarms, including when launch stops at
the journal gate.
A pending reminder missed while the phone is off is delivered once at boot,
with quiet hours and title hiding preserved. Recurring reminders then resume
at the next future occurrence; one-off reminders stay one-off.
After a time zone change, a daily slot already delivered less than 12 hours
ago does not repeat. Future daily slots remain eligible, including after restart.

An open web page keeps its cached release assets when another page applies an
update. Deferred screens and journal reopening continue offline; retained
pages keep their drafts and pending saves until they choose to reload.

An open web page can open its first PDF after a deployment changes the PDF
worker filename. Deployment and rollback keep exact workers from the selected
and outgoing releases reachable, without changing the original release files.

Archive Merge restores a bundled goal's status when this device has only hidden
it. The local hidden choice stays in place, and a locally recorded status still
wins over the Archive's.

Changing from device-bound access to a secret now reports an incomplete change
when the old key cannot be removed. Retrying a published PIN keeps its binding
key. On the web, a successful secret unlock also removes leftover device-bound
material from an interrupted change and verifies that it is gone.

SQLite transaction failures keep their original message when rollback also
fails. Full-disk errors remain identifiable, with rollback refusal retained
as secondary diagnostic information.

Damaged Daylio backup, Day One and TransTracks ZIP files receive each importer's
existing failure type. Malformed JSON fields are refused before parsing can
fail on a string or collection operation. Duplicate incoming identities that
would fail during commit are refused during preview. Unexpected runtime
failures remain visible to callers.

Source packages exclude root local-evidence paths, and CI rejects them if they
are tracked. Application evidence routes and intentional fixtures remain in
the source package.

Android saves each PIN attempt before checking it. Closing or restarting the app
keeps the count and its growing wait. A correct PIN clears both; missing access
settings or device keys still do not count as guesses.

Android no longer requests unused network-state and foreground-service
permissions. Scheduled encrypted backups retain their wake lock, which both
privacy policies now explain. Release checks inspect the complete APK
permission set and refuse unexpected dependency additions.

Daylio photo previews locate ZIP members once instead of rescanning preceding
attachments for every photo. Stored and deflated backups retain the same
attachment identities, content and size limits.

Archive Replace now commits portable preferences with its journal rows.
An interrupted restore keeps a complete old or incoming pair. Restored
language choices take effect after commit and recover on the next opening;
Merge still keeps this device's preferences.

Care-caption collisions and reported appointment-debrief failures now fail CI
instead of appearing only in guard logs.

Lock and disguise clear journal announcements, pending speech and toast actions.
Fresh gate feedback and later authenticated confirmations remain available.

Browser history navigation waits for an admitted journal transaction before
retiring its worker. Saves can commit before returning through Back or Forward;
stalled workers still reach the existing disposal limit.

Repeated browser Back and Forward navigation can resume the journal even when
an earlier return was cancelled while reopening. Explicit locks still require
fresh authentication.

Web unlock and retained navigation now check journal compatibility before
reopening access. Older pages refuse a journal upgraded by newer code and
offer the same update recovery as cold boot. Supported older journals use
the existing migration path.

A PIN entered during another access change now waits for that operation instead
of counting as a wrong guess. Cold start, session unlock and the current-PIN
check in Settings also keep unreadable or changed access settings outside the
wrong-attempt count and explain how to reopen the app. Leaving or locking still
cancels the pending unlock.

When a browser no longer holds a journal's PIN binding, unlock shows the
existing lost-key guidance. It does not count the attempt as a wrong PIN
or create a replacement key.

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
Back keep their lane and date without adding medication text to browser history.
Existing browser history is not rewritten.

Journal text fields now disable browser autofill and session restoration on
the web. Android keeps its existing keyboard suggestions. Text already kept
in browser profiles is not removed.

Archive restore and verification now refuse rows with missing identity,
wrong scalar types or unsafe integers. Merge and Replace reject these rows
before touching journal files or starting a transaction, so a malformed
Archive cannot leave new rows that prevent later exports.

Archive restore and verification also refuse attachments that share physical
file names across different owners, including thumbnails and document previews.
Merge and Replace reject them before changing files or rows. Missing-file
placeholders and ordinary destination filename collisions still restore.

Merging an older Archive after renaming medication stock now keeps the current
count and restores unrelated missing entries. An existing stock uuid or trimmed,
case-insensitive drug key keeps the destination's choice. Replace still restores the Archive's
counts.

Opening or closing a photo, picking a photo filter, zooming or paging a
document and changing a comparison keep the screen where it was. They used to
jump back to the top.

- Schema changes: schema 90 adds nullable automatic-slot provenance and indexes. Schema 91 unifies medication stock by its trimmed, case-insensitive drug key. Released schema 88 journals upgrade through schema 89, 90 and 91 without rewriting old dose rows.
- Archive format changes: format 2 gains optional automatic-slot fields. Released format-2 archives without them still restore.
- Security migrations: none.
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

## 1.0.0

Web installation now includes English and Polish lab recognition before offline readiness. OCR assets share an immutable generation; a failed update keeps the installed release usable. Recognition still starts only when a scan is requested.

Android lab scanning finds its bundled English and Polish language data on the first offline scan. Release checks reject missing or renamed OCR assets in the APK.

Android automatic backups sync the local file and folder, then check the delivered bytes before reporting success or pruning older backups. Unsupported providers report incomplete delivery and preserve the last good backup.

Android PIN and journal passphrase changes wait until the credential wrap is saved to app-private storage and synced. Released OPFS wraps move there on first use. A failed change asks you to keep both credentials until the active one is checked.

engender is a private journal for tracking a gender transition. Keep daily
entries, photos and care records on your own device, then use Look back to
review them over time. You choose which areas to use and what to record.

Use engender as an installable web app or an Android app. Both work offline
and encrypt the journal at rest. There are no accounts, analytics or backend
for journal data. The app includes English and Polish interfaces.

You can record medication doses, lab results, appointments and measurements,
keep milestones, and prepare a summary for a clinician. Encrypted archives
let you back up the journal or move it between web and Android. Text and PDF
exports let you share selected records.

App lock and disguise mode help keep journal content out of view, and the lock
can close the journal as soon as you leave the app. Android reminders use a
generic label by default. The Android build does not request the INTERNET
permission.

This stable release supports updates from 1.0.0-rc.1. Earlier development
builds, including the August web beta, do not establish a supported update path. Export anything
you want to keep before replacing a development build.

Day One imports use the calendar day in each entry's recorded time zone.
Imports made in rc.1 on a device west of UTC landed one day early. Already
imported rows keep their dates; remove the affected imports and import the
original Day One export again to correct them.

Search queries held for returning from an entry stay in memory and are
cleared on lock. They no longer leave plaintext copies in browser storage.
Reloading an entry clears the held query and filters.

Pre-squash development journals are not supported; export text or PDF from the old build before starting a new journal.

- Schema changes: this release uses schema {{schema}}. Journals from 1.0.0-rc.1 start at schema 88 and migrate forward on first open.
- Archive format changes: format 2 gains optional automatic-slot fields. Released format-2 archives without them still restore. Archives from development builds are not a supported restore path.
- Security migrations: none. F-Droid signs its rebuilds with a different key; moving between F-Droid and GitHub or Play requires reinstalling and restoring an encrypted archive.
- Minimum supported version: 1.0.0-rc.1.
