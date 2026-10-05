# 12 - sec: The lock screen shows nothing personal, and the app's own pickers do not lock it

Status: ready-for-agent
Was: phase-14 pre-release 50 (moved 2026-10-05)
Type: bug
Audit findings: SEC-01, SEC-10, L10-06
Severity: P2 (SEC-01, L10-06), P3 (SEC-10)
Blocked by: none
Blocked by note: after-release 10 also reworks the web unlock gate; whichever lands second rebases.
Size: M
Size note: one to two days
Model: opus
Model note: (the lock boundary, and Android activity lifecycle)
UI: yes. Mandatory `/impeccable` pass (audit, then polish) on the changed
surfaces, after the build and before `/code-review`, then sign-off and the
no-yank clause from the spec.

Source: full audit of 5 October 2026, run on main 2e362652. origin/main was
22 commits ahead by then (REL-09), so re-check each finding on the current main
before fixing it. Reports, probes and shots are under
`.claude/audit-2026-10-05/` (`report-<reader>.md` per reader).

## Problem

- **SEC-01 (P2).** The mid-session lock screen greets the person by name, even
  under disguise: `SessionUnlock.svelte:192-194` picks `pin_greeting_named`
  ("Hi, {name}") over `appWordmark(prefs.disguise, ...)`. Runtime check in the
  demo build (`sec/lock-name-disguised.mjs`): tab title "Notes", gate "Hi, Alice
  | Enter your journal passphrase to carry on." (`sec/lock-greeting-disguised-390.png`).
  Anyone holding the phone reads the chosen name in display type on the screen
  that exists to protect it, which can out the person. Report: `report-sec.md`.
- **SEC-10 (P3).** The recovery key is typed into `type="text"`
  (`RecoveryKeyEntry.svelte:73-84`): the one secret that bypasses every access
  mode is shown at a gate someone may be watching, and some Android keyboards
  learn from non-password fields (PLAUSIBLE).
- **L10-06 (P2, PLAUSIBLE).** With "Lock immediately", every picker, camera or
  permission round trip locks the app: `MainActivity.java:64-86` calls
  `lockOnLeave()` from `onPause` and `onTopResumedActivityChanged(false)`, and
  `leave-lock.ts:56-59` locks at once. SAF folder and save pickers, photo and
  document pickers, the camera and permission dialogs are separate activities.
  Attaching a photo or granting the microphone bounces the person to the lock
  screen mid-task. The lock-timing tickets never mention pickers. Report:
  `report-L10.md`.

## What to build

- Never show the name on a gate drawn before authentication: the wordmark (which
  follows disguise) or a neutral "Welcome back". Greeting by name after unlock,
  on Home, is fine.
- The recovery key field hidden by default with a show/hide toggle; keep
  autocomplete and autocorrect off.
- The plugins mark an "own system UI in flight" window (set before
  `startActivityForResult` or the permission request, cleared on result), and
  `lockOnLeave` skips locking inside it. Keep FLAG_SECURE on API below 33.
  Verify on the phone with the `.test` build, never the real app id.

## Acceptance

- [ ] No pre-unlock gate shows the person's name, disguised or not (browser
      check on each gate).
- [ ] The recovery key is hidden while typed unless the person shows it.
- [ ] With "Lock immediately", attaching a photo, picking a backup folder and
      granting the microphone return to the same screen unlocked, while leaving
      the app still locks (device check on the `.test` build, noted in
      Comments).
- [ ] Mandatory `/impeccable` pass (audit, then polish) on the changed surfaces, after the build and before `/code-review`.
- [ ] Every appearance, disappearance and state change on the changed surfaces animates; no yanks (nothing teleports or vanishes in one frame), verified by per-frame sampling of the animated properties, numbers recorded in Comments.
- [ ] Sign-off page shows before/after crops of only what changed, default palette (trans), light and dark; the branch stays unmerged until Alicja says merge.
