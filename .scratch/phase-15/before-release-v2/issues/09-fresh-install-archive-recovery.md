# 09 - Prove Archive recovery after installation loss

Status: ready-for-agent
Type: task
Owner: Data / Verification
Size: L
Size note: 4-7 engineer-days; coverage inventory, independent web/Android destinations, attachment comparison and interruption proofs. Existing covered cases should be reused.
Model: opus
Model note: Requires cross-platform recovery reasoning, key isolation, version compatibility and fault attribution.
UI: no planned redesign; any proven recovery or copy defect follows existing UI and catalogue rules.
Blocked by: 08

## Context

The repository already has Archive contracts, golden and released fixtures,
restore-failure tests, cross-platform native probes, and a human fresh-phone
release check. The architecture discussion requested evidence that losing
the original installation still leaves a complete recovery route. It did
not establish that existing restoration is broken or authorize replacing
the human release check.

Ticket 08 changes automatic Archive production. This ticket must exercise
that final producer as well as manual export, not a synthetic file that
bypasses the path being claimed. Existing Merge adds missing records and
leaves existing records alone; Replace installs Archive data while preserving
destination device-local settings. Preserve those semantics.

Source anchors: [Archive browser probe](../../../../tests/browser-tier/archive-probe.ts),
[cross-platform probe](../../../../tests/android-tier/archive/archive-cross-probe.ts),
[released fixtures](../../../../fixtures/released/), and the existing
[fresh-phone check](../../pre-release-human/04-restore-an-archive-on-a-real-phone.md).
Follow [verification rules](../../../../docs/agents/verification.md) for
native prerequisites and failure attribution.

## What to build

Inventory existing proof first. Extend the highest existing Archive/journal
contract and built-app restore flows to use independent source and destination
installations. Export an invented complete journal, make the source unavailable,
and restore using only the Archive and its password. Cover web-to-Android,
Android-to-web and Android automatic-Archive recovery.

Compare all registered Archive sections, relationships, portable preferences
and attachment content. Open representative restored media through the actual
app; file counts alone do not prove readable content. Verify that destination
access mode, backup destination and other device-local preferences stay local.

Use existing fault boundaries to exercise rejected and interrupted imports
and migration recovery. Keep released fixtures immutable. Missing coverage is
a reason to extend a maintained runner, not to create a second Archive codec.

## Acceptance

- [ ] A coverage inventory distinguishes already-proved cases, newly added cases and remaining human/runtime checks.
- [ ] Fresh destinations have independent browser profiles or app-private storage and keys. No source data key, Keystore state, profile or recovery-key wrap is copied.
- [ ] Manual web and Android Archives and an automatic Archive produced by ticket 08 restore after the source becomes unavailable, using only the Archive password.
- [ ] Public reads reconcile every portable Archive section and its relationships against expected fixture data. Metadata and readable bytes of photos, voice/video recordings and documents are verified.
- [ ] Representative restored media opens in the app; portable preferences restore correctly and destination device-local settings remain local.
- [ ] Wrong passwords, truncated/authentication-failing containers and supported corruption cases do not silently replace an existing destination journal or leave a falsely successful restore.
- [ ] An interrupted restore or migration follows the existing recoverable-state contract on restart; a valid recovery copy is not discarded or mistaken for a new empty journal.
- [ ] Too-new schemas are refused safely, and supported released Archives still open without rewriting their fixtures to make tests pass.
- [ ] Recovery-key wording and behavior do not imply that the key alone restores a lost installation or opens an Archive.
- [ ] New checks run through maintained browser/native runners and fail on missing execution. Final evidence records revision, source/destination platform, runtime, fixture and outcome.
- [ ] The signed-candidate fresh-phone and cross-platform release checks keep their existing ownership and status; automated evidence is linked without claiming the human checks ran.

## Testing Decisions

Use existing journal/Archive contracts for semantic reconciliation, browser
flows for real encrypted OPFS restoration, and Android instrumentation for
native SQLCipher and files. Apply targeted failure injection at existing
restore/migration boundaries. A same-installation export/import loop alone
does not prove device-loss recovery. Tests compare durable output and
observable results, not private helper calls.

## Dependencies and handoff

Blocked by 08 because its final automatic producer is part of acceptance;
07 is a transitive dependency for truthful native results. Coverage inventory
and manual-export fixtures can be prepared independently. Coordinate any
fix with lifecycle tickets rather than duplicating their ownership. Preserve
the existing real-phone release check under pre-release-human.

## Out of Scope

Replacing user data, using a personal phone without authorization, changing
Merge conflict policy, new sync behavior, new Archive format, resetting real
credentials, or certifying release readiness from automated checks alone.
