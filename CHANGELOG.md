# Changelog

Every release gets a section here before it is tagged, and the release pipeline
reads it: `node scripts/release-notes.mjs` refuses a version with no section of
its own, and refuses a section that leaves one of the four call-outs
unanswered. Those four are what a person needs to know before installing an
update, and "none" is a perfectly good answer to any of them.

## 1.0.0

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

- Schema changes: the first release establishes schema 86; pre-squash development journals are not supported. Export text or PDF from the old build before starting a new journal.
- Archive format changes: the first release establishes archive format 2. Archives from development builds are not a supported restore path.
- Security migrations: none for this first release. F-Droid signs its rebuilds with a different key; moving between F-Droid and GitHub or Play requires reinstalling and restoring an encrypted archive.
- Minimum supported version: 1.0.0 is the first supported release; there is no earlier supported version to update from.
