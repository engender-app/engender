# 26 - sec: Locking on the web drops the key, not just the screen

Status: ready-for-agent
Type: build
Audit findings: S-10
Severity: P3, after release (known design; not in the release gate)
Blocked by: 04
Blocked by note: (`leave-lock-check` must run in CI first)
Size: M
Size note: one to two days
Model: opus
Model note: (key handling and the lock boundary)
UI: yes (unlocking after a mid-session lock may gain a key-derivation wait).
Mandatory `/impeccable` pass on the unlock gate, then sign-off and the no-yank
clause from the spec.

## Problem

On the web, a mid-session lock is only a screen gate: the data key and the open
database stay in memory (stated in the header of `stores/lock.svelte.ts`).
`KeystorePlugin.confirm` is a prompt with no cryptographic check. Someone at a
locked tab on a shared desktop who opens devtools can still query the journal.
The security reader rated it P3 and known by design; the in-app copy does not
claim otherwise. Report: `.claude/audit-2026-10-03/report-security.md`, S-10.

## What to build

First, a short decision note in Comments for Alicja: the options and their
costs, before building.

- **Drop the key on lock.** Close the database and clear the data key when the
  web journal locks; unlocking re-derives (passphrase: Argon2id at the journal
  profile, 48 MiB x 2) or unwraps (device-bound) and reopens. Drafts in
  progress must survive: the encrypted draft mirror already exists, and a
  pending save must finish or be kept recoverable first (see ticket 21 and
  `c088c966`).
- **Or document it.** If dropping the key costs too much (an unlock wait on low
  devices, live queries that cannot reopen cleanly), say plainly in SECURITY.md
  and the lock settings help what a mid-session lock does and does not protect
  against on the web.

Android is out of scope: its lock path is separate.

## Acceptance

- [ ] Alicja chose an option from the note.
- [ ] If dropping: after a web lock, no data key or open database remains in
      the page (a test checks the driver is closed and the key reference
      cleared); unlock restores the journal and any draft; the unlock wait is
      measured on a throttled profile.
- [ ] If documenting: SECURITY.md and the in-app help say it in both
      languages.
- [ ] `/impeccable` pass done on the gate; any waiting state sampled per frame:
      no yank.
