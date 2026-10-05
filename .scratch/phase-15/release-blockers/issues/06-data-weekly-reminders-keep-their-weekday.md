# 06 - data: Weekly reminders keep their weekday

Status: ready-for-agent
Was: phase-14 pre-release 39 (moved 2026-10-05)
Type: bug
Audit findings: L10-02 (blocker B6 in the audit's clusters), L01-04, L10-05
Severity: P1 (L10-02), the audit calls it release-blocking; P2 (rest)
Blocked by: none
Size: M
Size note: one to two days
Model: opus
Model note: (a migration and Java/TS parity on a medication reminder)
UI: no. No `/impeccable` pass. (If the form's "Weekly" option starts naming its
day, that is copy only.)

Source: full audit of 5 October 2026, run on main 2e362652. origin/main was
22 commits ahead by then (REL-09), so re-check each finding on the current main
before fixing it. Reports, probes and shots are under
`.claude/audit-2026-10-05/` (`report-<reader>.md` per reader).

## Problem

- **L10-02 (P1).** WEEKLY has no anchor weekday. `ReminderPlanner.java:255-259`
  computes `todayAt.isAfter(now) ? todayAt : today+7`; the same rule is in
  `src/lib/data/reminderRule.ts:83-85`, pinned by
  `src/lib/android/fixtures/reminder-rule.json:17-28`, and the WEEKLY rule
  shape forbids an anchor (`reminderRule.ts:43-47`).
  `ReminderScheduler.saveAndSchedule` reschedules from `ZonedDateTime.now()`,
  and `android/platform-sync.ts:298-316` calls it on start, on every focus or
  visibility change and on every `reminder`, `entry` or `journalingPause`
  write. The form offers "Weekly" next to an anchored `EVERY_7_DAYS`
  (`settings/reminders/[id]/+page.svelte:38`). Worked case: a weekly 20:00
  reminder made on Monday; open the app Tuesday at 10:00 and it fires Tuesday
  at 20:00, and again on every later day the app is opened before 20:00. For a
  weekly injection that invites a double dose, or teaches the person to ignore
  it. Report: `report-L10.md`.
- **L01-04 (P2).** Stopping a wear session leaves its "Binder check-in"
  reminder armed: `reconcileReminder` returns early when `hours === undefined`
  (`journal/wearSessions.ts:222`), and Quick add's stop
  (`QuickAdd.svelte:424-430`) and the live tile's stop
  (`liveTiles.svelte.ts:232-238`) omit `reminderHoursAfterStart`. The check-in
  fires hours after the binder came off. Report: `report-L01.md`.
- **L10-05 (P2).** CI never runs the Android JVM unit suite:
  `scripts/run-ci-checks.mjs:20-27` has no `:app:testDebugUnitTest`, yet
  `ReminderPlanner.java:208-211`, `QuietHours.java:16-18` and the launch-route
  registry rely on fixture parity tests, and `docs/agents/verification.md:198-202`
  records a known failing `ReminderPlannerTest.everyNDaysUsesItsAnchorProgression`.
  `fdroid-rebuild-report.mjs:100-131` never exits non-zero, so a broken
  `assembleRelease` never turns CI red. The fix above changes Java and TS
  together, so it needs this gate.

## What to build

- Give WEEKLY an anchor day, or map the Weekly choice to `EVERY_N_DAYS` with
  interval 7 anchored at creation, plus a migration that rewrites existing
  WEEKLY rows with the created day as anchor. Change Java, TS and the fixture
  together; add a fixture case where `now` lands mid-week.
- In `upsertSession`, when `durationMs` is set and the automatic reminder falls
  after start plus duration, delete it, in the same transaction.
- Add `{ id: 'jvm', command: './gradlew', args: [':app:testDebugUnitTest'], cwd:
  'android', requires: ['sync'] }` to the android tier; fix or explain the
  known failing JVM test; make the F-Droid step fail on `attempt-failed` while
  still reporting non-reproducibility.

## Acceptance

- [ ] A weekly reminder made on Monday at 20:00 is next due the following
      Monday after any number of resyncs on Tuesday to Sunday (JVM test and TS
      test from the shared fixture).
- [ ] The migration anchors existing WEEKLY rows (test).
- [ ] Stopping a wear session from Quick add or the live tile removes its
      check-in reminder (test).
- [ ] CI runs the JVM suite green, and a broken release build turns CI red.
