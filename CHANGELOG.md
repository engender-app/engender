# Changelog

Every release gets a section here before it is tagged, and the release pipeline
reads it: `node scripts/release-notes.mjs` refuses a version with no section of
its own, and refuses a section that leaves one of the four call-outs
unanswered. Those four are what a person needs to know before installing an
update, and "none" is a perfectly good answer to any of them.

## Unreleased

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
