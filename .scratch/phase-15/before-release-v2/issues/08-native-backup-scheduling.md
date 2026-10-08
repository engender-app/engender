# 08 - Run Android backups independently of the foreground page

Status: ready-for-agent
Type: feature
Owner: Android / Data
Size: L
Size note: 7-12 engineer-days; native scheduling, safe headless execution, key-state handling, restart tests and integration. Re-estimate after the execution proof; this is not a timer replacement.
Model: opus
Model note: Crosses Android lifecycle, encryption boundaries, Archive production and concurrent foreground writes.
UI: yes, existing backup status and failure wording only; preserve screen capabilities and apply the required UI review.
Blocked by: 07

## Context

The architecture review found that automatic export checks run on page start,
foreground return and a fifteen-minute JavaScript timer. Snapshot creation and
Archive packing also depend on the web application. The native plugin owns
password derivation and destination delivery, but that alone does not make a
backup execute after the page or process disappears. The user requested this
follow-up while retaining the Android APK's lack of INTERNET permission.

Existing behavior already serializes foreground attempts, reports failures,
verifies delivery and retains five verified automatic backups. Preserve it.
This request is not evidence that current Archives are corrupt.

Source anchors: [foreground scheduler](../../../../src/lib/data/backgroundSchedulers.ts),
[automatic Archive production](../../../../src/lib/data/archive/android-auto-export.ts),
[native destination and KDF owner](../../../../android/app/src/main/java/dev/engender/app/backup/AutoExportPlugin.java),
and [ADR-0042](../../../../docs/adr/0042-scheduled-archive-kdf-runs-behind-the-android-bridge.md).
The [earlier write-integrity ticket](../../after-release/issues/13-data-write-integrity-and-backups.md)
records completed retention and failure-reporting fixes; do not reopen them
without a new reproduction.

## What to build

Give enabled automatic backups native persistent scheduling, with one owner
coordinating scheduled, foreground catch-up and manual work. Prefer
WorkManager if it passes repository dependency policy. Persist the due state
and cancellation intent without persisting plaintext content or raw secrets.

First trace the complete path from due work to a verified Archive with no
foreground page. A scheduling callback that merely waits for JavaScript does
not satisfy this ticket. Reuse current Archive production and format rules.
Native delivery may finish an already encrypted, durably staged Archive;
report when its journal snapshot was taken separately from when it was delivered.

The job may use only key access already permitted by the selected access mode.
If a fresh snapshot needs authentication, retain pending work and catch up on
the next unlock. Do not introduce another data-key wrap, cache an unlock secret,
or weaken authentication to make a cold job succeed. ADR-0042 still prohibits
returning the saved Archive password to JavaScript. Establish and document
this execution/key-availability matrix before implementing the scheduler.

Android chooses execution time. Ordinary backgrounding, process death, reboot,
Doze and force-stop are different cases; do not promise exact-time execution
or execution while the package is force-stopped. Keep weekly/monthly semantics,
existing quiet hours, disguise and notification consent. Do not add networking.

## Acceptance

- [ ] A disposable Android installation with enabled backup has persistent native work; merely changing the JavaScript timer does not pass.
- [ ] An eligible due backup reaches verified destination storage without the foreground page running. A safe staged-Archive path qualifies only when the recorded snapshot age is accurate.
- [ ] With no eligible key or encrypted snapshot, the job records a deferred state without reading protected content; unlock catches up and produces a current Archive.
- [ ] Ordinary process death and reboot preserve pending work; disabling backups cancels it. Force-stop and OS deferral limitations are documented and tested separately where controllable.
- [ ] Concurrent manual, scheduled and foreground triggers cannot publish duplicate attempts for the same due work, corrupt an Archive, or mark a partial delivery successful.
- [ ] Last successful backup changes only after verification. Snapshot and delivery times cannot make an old snapshot look current; deferred and failed states remain distinguishable.
- [ ] Destination full, temporary unavailability, revoked access and interrupted writes preserve the live journal and earlier Archives; retry does not loop without a bound.
- [ ] Retention keeps the existing five verified automatic backups and removes only recorded app-owned files after a replacement verifies. Manual Archives and unrelated files survive.
- [ ] The built APK still lacks INTERNET permission. No raw data key, saved Archive password or plaintext journal is newly persisted or exposed through bridge APIs or logs.
- [ ] An Archive produced through the new execution path restores through the existing public Archive contract, including attachments. Native KDF parity and released-format fixtures still pass.
- [ ] Existing backup UI reports these outcomes accurately in English and Polish, with privacy-safe notices and no journal data on gates.

## Testing Decisions

Use Android instrumentation through the corrected native runner for process
death, native scheduling and real destination files. Use a fake clock only
for due/retry policy, not as proof that Android executes a job. Reuse Archive
round-trip and encryption contracts for output and key boundaries. Record
the app lifecycle, authentication state, runtime and actual job outcome.
Run only against disposable emulators/test packages; personal data is not a
fixture. Add no parallel scheduler test framework.

## Dependencies and handoff

Ticket 07 makes native execution evidence reliable. Inventory can precede it,
but it must land before this ticket closes. Ticket 09 proves fresh-install
recovery of this producer, and ticket 11 measures its performance. Shared
backup, preference, Archive and Android test code requires refreshed overlap
predictions. Record any implementation decision needed to preserve the key
boundary; escalation is required for a proposed weakening, not for routine
choice of native APIs.

## Out of Scope

Network access, new access modes, exact-time promises, cloud backup services,
iOS support, changing the Archive format or silent authentication bypass.
