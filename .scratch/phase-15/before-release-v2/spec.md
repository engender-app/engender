# Before release v2

Status: ready-for-agent

## Scope

Close the seven confirmed findings from the expanded backend, tests and
accessibility audit of `f46725399966e3062c4589f58d32a72d63b1861d` on
8 October 2026. Six findings concern application behavior; one concerns the
Android test runner. Each ticket includes its regression proof. Reproduce the
finding on the implementation base before changing code, since other work may
have landed after the audit.

Tickets 08-11 add the four architecture follow-ups requested on 8 October
2026: Android backup scheduling, fresh-install recovery proof, browser
compatibility evidence, and long-journal performance verification. These
are engineering requirements from the architecture discussion, not four
additional reproduced audit defects. The user chose this feature directory
and confirmed the existing test seams. The native iOS port was dropped.

The source report is [the expanded audit](../../../.claude/audit-2026-10-08-expanded/AUDIT.md).
Its evidence links distinguish browser reproductions, module/JVM proofs and
the widget framework trace. Widget reapplication still needs runtime proof;
the audit did not use a personal device. No database corruption or measured
device out-of-memory failure was established.

## Problem Statement

Automatic Android backups currently depend on the running web application
checking whether an Archive is due. A person can close the app and assume a
backup happened when no check ran. Existing recovery tests and release checks
need to establish what survives loss of the original installation, including
attachments and access-mode boundaries. Chromium-based evidence alone does
not establish equivalent browser behavior. Existing performance budgets need
current measurements rather than assumptions about the framework.

## Solution

Keep SvelteKit, Capacitor, encrypted SQLite and the shared journal layer.
Make Android schedule backup work independently of the foreground page,
subject to Android execution limits and the existing access mode. Preserve
the absence of the Android INTERNET permission. When authentication is
needed, defer safely and catch up after unlock rather than weakening keys.
Prove restoration from an Archive into an independent installation, record
browser capabilities against the built app, and measure the existing
long-journal workloads before making performance changes.

## User Stories

1. As a journal owner, I want saving to remain local and offline, so that a network connection never becomes a prerequisite.
2. As an Android user, I want the app to retain its lack of network permission, so that backup work does not introduce socket access.
3. As an Android user, I want enabled backup work scheduled outside the foreground page, so that closing the interface does not discard the schedule.
4. As a journal owner, I want my chosen access mode respected by backup work, so that automation cannot bypass authentication.
5. As a journal owner, I want a backup that needs authentication to remain pending until unlock, so that I can complete it without weakening protection.
6. As a journal owner, I want to distinguish a completed backup from a deferred or failed attempt, so that I know whether a usable Archive exists.
7. As an Android user, I want backup work to recover after ordinary process death and reboot when the OS permits, so that I do not need to recreate the schedule.
8. As an Android user, I want disabling automatic backups to cancel pending work, so that my choice remains effective after reopening.
9. As a journal owner, I want manual and automatic backups to coordinate, so that simultaneous triggers cannot publish conflicting or partial results.
10. As a journal owner, I want an unavailable destination to leave earlier Archives intact, so that a failed attempt does not remove my recovery options.
11. As a journal owner, I want retention to remove only older verified automatic backups after a replacement verifies, so that unrelated files remain safe.
12. As a journal owner who loses a device, I want to restore from an Archive and its password into a fresh installation, so that the original device is unnecessary.
13. As a journal owner, I want restored photos, recordings, videos and documents to open, so that recovery proves more than row counts.
14. As a journal owner, I want portable preferences restored while destination access settings stay local, so that importing does not change how this installation unlocks.
15. As a journal owner, I want wrong-password and damaged-Archive attempts to preserve the current journal, so that failed recovery attempts cause no further loss.
16. As a journal owner, I want interrupted restore and migration paths to recover explicitly, so that a partial operation never appears as an empty successful journal.
17. As a journal owner, I want the distinction between a recovery key and an Archive explained accurately, so that I keep the right material for device loss.
18. As a browser user, I want supported storage, unlock and offline flows verified in my browser, so that support claims reflect observed behavior.
19. As a browser user, I want unsupported capabilities identified before I rely on them, so that an unavailable biometric or storage API does not become a broken control.
20. As a browser user, I want denied persistent storage to leave the app usable with an accurate warning, so that denial does not hang startup.
21. As a browser user, I want browser Back, multiple tabs and updates to preserve my journal, so that ordinary navigation does not invalidate storage ownership.
22. As a journal owner with years of entries, I want search, saving, charts and Archive operations to stay within established budgets, so that history remains usable.
23. As a maintainer, I want benchmark evidence to name the revision, runtime and fixture, so that comparisons distinguish regressions from different environments.
24. As a maintainer, I want existing contracts and runners extended only where coverage is missing, so that the work does not create a parallel verification system.
25. As a maintainer, I want unavailable hardware reported as an unverified capability, so that missing execution cannot count as a pass.

## Implementation Decisions

- Retain the current framework, database engines, journal facade, file-store
  boundaries and Archive format. Reuse existing implementations before adding
  another execution path. No schema or wire-format change is authorized merely
  to simplify tests.
- Move Android scheduling ownership to native persistent work. WorkManager is
  the proposed scheduler, subject to the existing dependency and licence
  policies. It is not an exact-time guarantee and cannot override force-stop.
- Scheduling alone is insufficient: snapshot creation and Archive production
  currently depend on the web application. Establish a safe execution path
  that works without a foreground page, reusing the current format and rules.
  Do not unlock a protected journal silently, introduce a new unattended wrap,
  or persist plaintext or raw secrets. A durable, already encrypted staged
  Archive may be delivered later; its snapshot time must remain distinct from
  delivery time. If no eligible key or snapshot is available, defer until unlock.
- Preserve native derivation of scheduled Archive keys and the prohibition on
  returning the saved Archive password to JavaScript (ADR-0042). Preserve data
  encryption (ADR-0018 and ADR-0020), versioned Archives (ADR-0007), registered
  Archive sections (ADR-0027), and migration recovery (ADR-0006).
- Keep verification-before-success, five verified automatic backups, bounded
  retries, cancellation on disable, destination-grant handling and privacy-safe
  failure notices. Foreground catch-up and manual actions use the same ownership
  rules as native jobs.
- Use two independent test installations for recovery. Do not copy a browser
  profile, journal data key, Keystore material, or recovery-key wrap to make a
  fresh destination work. Respect existing Merge and Replace semantics.
- Browser scope is Chromium, Firefox and available WebKit automation. Apple
  hardware is unavailable and is not a prerequisite. Actual Safari and iOS
  PWA verification are outside this delivery requirement and remain explicitly
  unverified. WebKit automation must not be labelled a Safari/device test.
- Produce a capability matrix with pass, unsupported, fail and not-run states.
  Record versions and reasons. Do not expand supported-platform claims without
  evidence or silently reduce existing supported behavior.
- Reuse long-journal and first-load budgets. Fix only reproduced regressions;
  passing workloads require no speculative optimization or framework change.

## Testing Decisions

The user confirmed these existing seams on 8 October 2026:

- Journal and Archive contracts test save, export, import and recovered content
  through public operations and real encrypted drivers. Existing cross-platform
  Archive probes, released fixtures and restore-failure tests provide prior art.
- Built-app browser flows test unlock, navigation, storage lifecycle and offline
  startup through observable UI and persisted data. Browser probes may inject a
  failure where necessary, but source-string assertions do not prove behavior.
- Android instrumentation tests native job execution, process death, destination
  handling and deferred authentication in disposable installations. Existing
  native Archive and encryption checks provide prior art. Ticket 07 must make
  execution reporting trustworthy before native results close tickets 08 or 09.
- Existing long-journal benchmarks and first-load checks measure performance.
  Query-plan and driver-contract tests protect targeted fixes. Record real
  execution rather than increasing budgets to hide a regression.

Tests must assert recoverable records and usable attachment content, not method
call counts alone. Skipped, aborted and unavailable runtime cases remain visible.
Use the highest applicable seam; add a lower-level regression only for a policy
or fault boundary that cannot be proved reliably at that seam. Existing signed
candidate and human-device checks retain their separate ownership.

## Out of Scope

Native iOS support; LAN or cloud sync; accounts; a backend; networking editions
or companion apps; UI framework replacement; new unlock modes; weaker key
protection; a new Archive format; blanket performance refactors; automatic
closure of the existing human release checks. Filing this work does not cancel
or implement the separate LAN-sync tracker.

## Further Notes

Effort ranges on tickets 08-11 are planning estimates for an engineer familiar
with the repository. They include focused regression coverage and integration,
not waiting for hardware or unrelated CI failures. Model recommendations follow
the existing orchestration vocabulary. Re-estimate after the native backup
execution proof if preserving the key boundary requires wider work.

## Tickets

| Ticket | Finding | Severity | Size | Model | Blocked by |
| --- | --- | --- | --- | --- | --- |
| [01: Keep a later lock authoritative over pending unlock](issues/01-pending-unlock-respects-later-lock.md) | SEC-01 | P1 | M | opus | None |
| [02: Restore journal access after browser Back](issues/02-recover-journal-after-browser-back.md) | DATA-01 | P2 | M | opus | None |
| [03: Make schema recovery discover available updates](issues/03-schema-recovery-discovers-updates.md) | REL-01 | P2 | S | sonnet | None |
| [04: Keep update reloads outside journal writes](issues/04-update-reload-waits-for-journal.md) | REL-02 | P2 | M | opus | None |
| [05: Apply quiet hours to Android reminders](issues/05-android-reminders-respect-quiet-hours.md) | AND-01 | P2 | S | sonnet | None |
| [06: Clear existing widget labels under disguise](issues/06-disguise-clears-existing-widget-labels.md) | A11Y-01 | P2 | S | sonnet | None |
| [07: Make native test results reflect actual execution](issues/07-native-runner-reports-actual-results.md) | TEST-01 | P2 | M | sonnet | None |
| [08: Run Android backups independently of the foreground page](issues/08-native-backup-scheduling.md) | Architecture follow-up | N/A | L | opus | 07 |
| [09: Prove Archive recovery after installation loss](issues/09-fresh-install-archive-recovery.md) | Architecture follow-up | N/A | L | opus | 08 |
| [10: Verify browser storage and offline capabilities](issues/10-browser-capability-verification.md) | Architecture follow-up | N/A | L | opus | 01, 02, 03, 04 |
| [11: Verify long-journal and first-load performance](issues/11-performance-evidence-and-regressions.md) | Architecture follow-up | N/A | M | sonnet | 08, 09, 10 |

Finding IDs refer to this audit, not earlier audits that reused short IDs.
Tickets 08-11 have no audit severity because they are requested reliability
and verification work, not established defects. Ticket 09 depends on the
final automatic-backup producer; ticket 10 verifies the corrected lifecycle
from 01-04; ticket 11 measures the resulting integration rather than an older
build. Read-only coverage inventory may happen before those dependencies land.
Every ticket is a complete behavior with its own tests. Shared files are
serialization constraints, not semantic dependencies: tickets 01 and 02 may
both touch session lifecycle; 03 and 04 share update ownership; browser
regression registration can overlap across all four. The orchestrator must
refresh its path predictions against the integration tip before dispatch.

## Orchestration handoff

Feature argument: `phase-15/before-release-v2`.
Integration branch: `orchestrate/phase-15/before-release-v2`.

Use `f5-data-delivery:orchestrate` for implementation. It owns worktrees,
integration, reports and cleanup. Leave main and the primary checkout's
HEAD, index and tracked files untouched. The existing architecture-document
edit is unrelated. Do not apply the ordinary per-ticket merge-to-main
workflow during this orchestration run. The user reviews and merges the
integration branch. The helper records merged tickets as `resolved` in its
integration copy; it does not rewrite the primary tracker files.

Each issue has one Status, Size, Model and Blocked by field and unchecked
acceptance criteria. Models use the helper's required `sonnet`/`opus`
vocabulary. A harness without those models must report the execution
limitation rather than substitute a model or silently edit ticket metadata.

The current platform configuration allows two implementation agents, reserves
4 GiB per admitted local stack and waits at most 30 minutes for memory.
Read platform and verification instructions again when the run starts.

The setup recipe is the repository's own: install dependencies in each
isolated worktree, build before the warning-free type check and Node suite,
and sync Capacitor after the web build before native builds. Copy the local
tracker/spec and ignored project instructions needed by each issue, including
the applicable ADRs and verification documentation. Never assume ignored
inputs or generated assets exist in a fresh worktree. Evidence links below
are retained in the primary audit area; use read-only access or copy needed
evidence into the agent's scratchpad before implementation.

Run focused red/green proofs during implementation and required final checks
under the repository's verification recipe. Register new behavioral
regressions in the appropriate existing runner; a scratch script alone is
not a finished regression. Route heavy commands through the orchestration
gate. Android runtime checks need a disposable emulator/test package and
serialization of shared native tooling. A personal phone is not an implicit
test fixture.

Review every ticket against its exact implementation base for both Standards
and Spec. If that review needs subagents, hand it back to the orchestrator;
implementation agents remain leaves. Save commands, outcomes, changed files,
commits and any verification limitations in the hand-back. Update existing
documentation when the delivered behavior makes it inaccurate.

Preflight predictions and the helper's validation output are stored outside
the issues in [the ignored handoff area](../../../.claude/before-release-v2-preflight/).
These are starting predictions, not permission to skip the orchestrator's
fresh exploration. No orchestration run, branch or worktree was started by
ticket filing.

## Evidence map

| Ticket | Audit evidence |
| --- | --- |
| 01 | [Browser race probe](../../security-lock-audit.mjs), plus the report's source trace and recorded browser observations |
| 02 | [Actual BFCache reproduction and results](../../../.claude/backend-audit-current-data/) |
| 03 | [Cold-recovery test](../../../.claude/audit-2026-10-08-expanded/pwa-recovery.test.ts) and [results](../../../.claude/audit-2026-10-08-expanded/pwa-proofs.log) |
| 04 | [Write/takeover ordering test](../../../.claude/audit-2026-10-08-expanded/update-race.test.ts) and the same results log |
| 05 | [JVM boundary proof and output](../../../.claude/audit-2026-10-08-expanded/native/) |
| 06 | [Android framework reapplication trace](../../../.claude/audit-2026-10-08-expanded/native/framework-source.txt) |
| 07 | [Runner proof](../../../.claude/audit-2026-10-08-expanded/native/runner-proof.mjs) and [output](../../../.claude/audit-2026-10-08-expanded/native/runner-output.txt) |

## Release boundary

Completing these tickets does not certify publication readiness by itself.
The existing [human accessibility and TalkBack audit](../pre-release-human/08-accessibility-and-talkback-audit.md)
and the other signed-candidate release checks retain their own status and
ownership. Do not duplicate, close or weaken them in this feature.

Excluded: speculative performance changes, broad refactors, arbitrary test
count reductions and tooling advisories without an established reachable
product failure. Tickets 01-07 request no new product feature. Tickets 08-11
add the reliability and verification scope specified above.

## Comments

2026-10-08: Added architecture follow-ups 08-11 at the user's request, with
existing test seams explicitly confirmed. The iOS port is excluded. Previous
seven-ticket preflight evidence below covers only 01-07; rerun preflight and
overlap predictions for all eleven before implementation. No implementation,
branch, commit or orchestration run was started by this addition.

2026-10-08: Filed the seven audit findings at the user's request as a separate
before-release-v2 feature. Ticket filing does not implement the fixes or
change earlier ticket status.

2026-10-08: The actual orchestration helper accepted all seven issues with
zero skips. With the saved overlap predictions, the initial two-agent pair
is 01 (opus) and 07 (sonnet); 02, 04 and 03 serialize behind shared lifecycle
or browser-test work. Tickets 05 and 06 remain independent. The local memory
gate is enabled for the configured loops. No agents are owned or active in
this feature. Link and acceptance-check validation passed. This validation
does not make the declared models available in a harness that lacks them.
