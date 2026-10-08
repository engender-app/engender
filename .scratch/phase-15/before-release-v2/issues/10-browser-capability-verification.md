# 10 - Verify browser storage and offline capabilities

Status: ready-for-agent
Type: task
Owner: Web / Verification
Size: L
Size note: 5-8 engineer-days with required runtimes available; built-app matrix, focused harness changes and bounded compatibility fixes. Apple hardware waiting time is excluded.
Model: opus
Model note: Browser storage ownership, authentication capability and service-worker lifecycle need cross-engine diagnosis.
UI: no planned redesign; capability and failure wording may need bounded changes and normal UI review.
Blocked by: 01, 02, 03, 04

## Context

Current browser tiers primarily execute Chromium. Their encryption, storage
and offline evidence cannot automatically be applied to Firefox or Safari.
The app uses OPFS-backed encrypted SQLite in a worker, browser persistence
requests, WebAuthn PRF where supported, and a versioned offline shell. These
are runtime capabilities, not guarantees supplied by Svelte or Capacitor.

The user dropped the native iOS port. Testing mobile Safari as a browser/PWA
remains within the architecture follow-up; no iOS native shell is requested.
Tickets 01-04 already own concrete unlock, BFCache and update defects. This
ticket verifies their delivered behavior across relevant browser engines.

Source anchors: [built-app verification](../../../../tests/browser-tier/verify-build.mjs),
[browser runner](../../../../tests/browser-tier/run.mjs),
[encrypted web driver](../../../../src/lib/data/sqlite/mc-driver.ts), and
[verification rules](../../../../docs/agents/verification.md).

## What to build

Extend existing built-app browser flows with a capability matrix for current
Chromium, Firefox and available automated WebKit. Apple hardware is unavailable
and is not a prerequisite. Actual desktop Safari and mobile Safari PWA checks
are outside this delivery requirement. Record exact versions and pass,
unsupported, fail or not-run outcomes per capability. Label automated WebKit
as engine evidence; it does not verify Safari or an installed iOS PWA.

Cover storage creation/reopen, persistence denial, cold offline startup,
updates, browser Back, multi-tab ownership, locking and unlock, manual Archive
recovery, and representative media capture/playback. Test advertised biometric
availability rather than requiring every browser to implement PRF. Fix small
reproduced failures in existing supported behavior; evidence requiring a
larger product or platform decision must be reported rather than hidden by
dropping a test or claiming support.

## Acceptance

- [ ] The matrix records revision, build mode, browser/OS versions, capabilities tested and evidence. Not-run, unsupported and failed cases cannot become passes.
- [ ] Real encrypted storage survives save, close and reopen in each verified runtime; missing required storage APIs produce a handled outcome before journal creation is presented as successful.
- [ ] Persistence denial does not block startup indefinitely; quota/storage failures preserve existing data and are reported accurately.
- [ ] Installed/offline behavior is verified against the built release and production hosting headers, with optional assets treated according to the existing cache policy.
- [ ] Lock/unlock, BFCache return and update-during-write cases exercise the fixes from 01-04 without exposing journal content or abandoning durable writes.
- [ ] Multiple tabs have a defined safe outcome, such as serialized ownership or a handled busy state; concurrent use cannot silently corrupt the journal. Seamless multi-tab editing is not required.
- [ ] Biometric controls reflect actual PRF support and failed capability negotiation; unsupported devices retain the existing available access modes.
- [ ] Manual Archive export/restore and representative photo, audio, video and document flows are checked for usable output where those capabilities are claimed.
- [ ] Firefox evidence uses Firefox. Safari/device claims require actual Safari/device execution; automated WebKit results are labelled separately.
- [ ] Actual Safari and iOS PWA remain explicitly unverified. Missing Apple hardware does not block this ticket or branch readiness; automated WebKit results do not expand Safari support claims.
- [ ] Maintained runners execute new automated cases with meaningful failure reporting; support notes state tested capabilities and limitations without expanding claims beyond evidence.

## Testing Decisions

Use existing built-app flows as the primary seam and reuse browser-tier
contracts for storage and encryption. Parameterize only the runtime-specific
parts required by actual engines; do not fork entire test suites. UI-visible
outcomes and persisted content are the assertions. Do not infer browser
support from source inspection or a mocked navigator API.

## Dependencies and handoff

Tickets 01-04 own lifecycle behavior that this matrix must verify. Inventory,
runtime setup and read-only capability checks can precede those fixes. Apple
hardware is not an execution prerequisite. Preserve existing human release
checks without adding an Apple-device requirement to this delivery.
Record compatibility defects separately from environment failures, and
check actual main CI before attributing a failure to pre-existing code.

## Out of Scope

Native iOS app, new browser engine implementation, relaxed encryption,
automatic access-mode changes, broad UI redesign, or declaring unsupported
browser features mandatory without a product decision.
