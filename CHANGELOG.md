# Changelog

Every release gets a section here before it is tagged, and the release pipeline
reads it: `node scripts/release-notes.mjs` refuses a version with no section of
its own, and refuses a section that leaves one of the four call-outs
unanswered. Those four are what a person needs to know before installing an
update, and "none" is a perfectly good answer to any of them.

## Unreleased

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
count and restores unrelated missing entries. An existing stock uuid or exact
drug name keeps the destination's choice. Replace still restores the Archive's
counts.

- Schema changes: schema 90 adds nullable automatic-slot provenance and indexes. Released schema 88 journals upgrade through schema 89 and 90 without rewriting old dose rows.
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

This is the first versioned release. Earlier development builds, including
the August web beta, do not establish a supported update path. Export anything
you want to keep before replacing a development build.

Day One imports use the calendar day in each entry's recorded time zone.
Imports made in rc.1 on a device west of UTC landed one day early. Already
imported rows keep their dates; remove the affected imports and import the
original Day One export again to correct them.

Search queries held for returning from an entry stay in memory and are
cleared on lock. They no longer leave plaintext copies in browser storage.
Reloading an entry clears the held query and filters.

- Schema changes: the first release establishes schema 86; pre-squash development journals are not supported. Export text or PDF from the old build before starting a new journal.
- Archive format changes: the first release establishes archive format 2. Archives from development builds are not a supported restore path.
- Security migrations: none for this first release. F-Droid signs its rebuilds with a different key; moving between F-Droid and GitHub or Play requires reinstalling and restoring an encrypted archive.
- Minimum supported version: 1.0.0 is the first supported release; there is no earlier supported version to update from.
