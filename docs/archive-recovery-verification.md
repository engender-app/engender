# Archive recovery verification

An Archive and its password can restore its saved journal into another
installation. The source journal key, its access credentials and its recovery
wrap are not inputs to restoration. A recovery key can reopen the journal it
belongs to; it cannot restore lost files or open an Archive.

## Execution status

The recovery harness is implemented. The focused encrypted browser probe has
passed with 54 sections and 18 attachments. Compiled-app first-run restoration,
Android recovery and the new interrupted-migration assertion still require a
completed runtime run before this ticket can be marked verified. Failed runs are
retained in the ticket handoff; implementation alone is not acceptance evidence.

## Maintained checks

`npm run test:browser` runs the Archive recovery block through two independent
Chromium contexts. The source exports through `packArchive`, closes its encrypted
journal and loses its entire context before the destination starts. The
replacement context creates its own passphrase keystore and encrypted OPFS
journal. It receives only the encrypted Archive and expected invented fixture
metadata. No browser storage state or profile is copied.

`npm run test:android` also runs installation recovery on supported WebViews.
For a focused run, set `ANDROID_TIER_RECOVERY_ONLY=1` and
`ANDROID_TIER_AVDS=tracker35`. The runner still builds the app, synchronises
Capacitor assets, assembles the APKs and starts its own disposable AVD. It refuses
a focused run on an AVD whose WebView cannot start the app. Other native suites
retain their existing runner paths.

The native phases export through the same Archive codec and journal facade as
the app. Between source and destination phases, the host calls `pm clear` only
on the app in its owned disposable emulator and checks that the source process
has gone. This clears app-private data and keys, including the WebView profile.
The host retains only the Archive and expected invented metadata. The destination
creates its own passphrase keystore, SQLCipher key and encrypted attachment store.
It never receives a copied database, attachment directory, journal key or
Keystore state.

| Source | Destination | Producer |
| --- | --- | --- |
| Browser | Independent browser context | Manual Archive |
| Browser | Fresh Android app sandbox | Manual Archive |
| Android | Independent browser context | Manual Archive |
| Android | Independent browser context | Automatic Archive |
| Android | Fresh Android app sandbox | Automatic Archive |

The automatic source snapshots the complete real SQLCipher journal and calls
`runAndroidAutoExport` with `scheduled: true`. Native WorkManager delivers the
verified encrypted stage after the foreground page closes. The test reads the
actual delivered document, then destroys the source sandbox before restoration.
A staged file by itself does not count as a completed backup.

## What the fixture proves

The shared seed uses public journal operations and carries content in all 54
registered Archive sections. The only direct SQL seed preserves retired built-in
presets that older journals can still hold. Golden Node tests use the same seed
with their original synthetic bytes; their committed fixtures are unchanged.

The recovery fixture supplies valid JPEG images, Opus recordings and VP8 video.
Its document is an image scan, a supported document kind. Destination public
snapshots compare every section, child identity and portable relationship against
the source fixture. Entry tag membership and section row order are compared
without relying on SQLite rowids. All 18 attachment files compare by plaintext
length and SHA256, including thumbnails and audio owned by voice benchmarks.

Restoration runs through `runRestore`, the shared welcome/settings operation.
Replace applies portable preferences; Merge keeps an existing destination entry.
Destination lock timing, disguise and automatic-backup settings stay local. The
passphrase keystore remains byte-for-byte unchanged, and the destination's own
credential still unwraps its original key. Android also checks that its backup
destination, enabled flag and schedule stay local.

The app's `PhotoViewer`, `VoicePlayer`, `VideoNotePlayer` and document detail route
open the restored files through the destination file store. Image dimensions,
media metadata and playback advancement establish usable output. Byte counts
alone cannot satisfy this check.

Wrong passwords, truncation, authentication failure and a newer container format
must fail without changing destination records or local settings. A file stream
interrupted after its first attachment must preserve the destination on reopening.
Reopening runs the app's orphan sweep, which reclaims unpublished files from a
failed import. Existing Node corruption and collision tests cover the remaining
container and transaction boundaries.

The maintained migration probe uses encrypted OPFS and a real pre-migration copy.
It checks failed migration rollback, schema-too-new refusal and an unversioned
live journal beside a readable recovery copy. That interrupted state must refuse
first-run migration, retain the copy on restart and recover the previous journal
when the copy is explicitly restored.

## Legacy compatibility and evidence limits

`tests/legacy-archive-public-import.test.ts` imports an invented fixture produced
by the unchanged published `alpha-2026-08-14` code. The fixture lives under
`fixtures/legacy/alpha-2026-08-14/`, with its generator and provenance hashes.
It is a newly generated legacy-format fixture, not an original release artifact.
The Archive restores through the public journal boundary. Its raw SQLite journal
at schema 3 must still fail with `JournalBelowBaselineError` against baseline 88.
ADR-0006 names Archive export/import as the route out of those development builds.

`fixtures/released/` has no original 1.0 candidate fixtures before the candidate is
cut. The released-format harness therefore executes zero original release cases;
that is unavailable evidence, not a compatibility pass. Never rebuild either
legacy or release fixtures to make a consumer test pass.

The browser runner prints a structured `RECOVERY` record. Native runs write
`*-installation-recovery.json` beside their instrumentation logs, with revision,
runtime, fixture, source/destination platforms, installation identities and
outcomes. Missing phases, failed instrumentation and incomplete result fields
fail the maintained runner. Keep failed, interrupted and unavailable runs beside
successful evidence when reporting a revision.

Automation does not close the signed-candidate
[fresh-phone check](../.scratch/phase-15/pre-release-human/04-restore-an-archive-on-a-real-phone.md)
or the human cross-platform release checks. Their owner and status remain
unchanged. These tests use disposable Android emulators. They make no claim about
a personal phone, Apple hardware, Safari or an iOS PWA.
