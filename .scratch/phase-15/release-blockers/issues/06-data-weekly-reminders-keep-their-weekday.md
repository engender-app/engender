# 06 - data: Weekly reminders keep their weekday

Status: resolved
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

## Comments

Orchestration report 2026-10-05T20:03:31.346704+00:00

Issue: phase-15/release-blockers/06. Model: gpt-6.1-sol. Result: success.
Started: 2026-10-05T17:08:04.148696+00:00. Finished: 2026-10-05T20:01:39.919842+00:00.
Merge: merged.  Merge commit: c84e026015ed7b2c93637a2838450892bbf16c5b.
Tests: ["Standards and Spec reviews PASS at 13a6f754e00745dff63baa260da7cd6e9513e707; reports: /home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/06/review-standards.md and /home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/06/review-spec.md", "UI12 integration 64dcafa5b35971362317e896dbd320782f560eb7 merged without conflicts; ticket 06 implementation unchanged.", "Complete JVM suite on refreshed owned tip cdcb7e8f3f95757d6a0129e51f0b9f4621985a76: 108 tests, zero failures, errors or skips; /home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/06/integration-refresh-jvm.log", "Node suite: 6865 tests across 525 files passed; build, check with zero errors/warnings, copy and Capacitor sync passed before final Java-only delta. Helper merge reruns all web checks.", "Causal native migration race reproduced red, then passed green; latest sync preserves deleted reminder and privacy change. Shared TS/JVM fixture covers weekly Monday reminder resync Tuesday through Sunday. Wear-stop rollback and F-Droid failure exit regression pass."]. Integration checks: [["uv", "run", "--script", "/home/alice/_projekty/f5/f5-data-delivery/skills/engineering/orchestrate/scripts/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary", "--feature", "phase-15/release-blockers", "--loop", "build", "--", "npm", "run", "build"], ["uv", "run", "--script", "/home/alice/_projekty/f5/f5-data-delivery/skills/engineering/orchestrate/scripts/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary", "--feature", "phase-15/release-blockers", "--loop", "check", "--", "npm", "run", "check"], ["npm", "test", "--", "--maxWorkers=2"], ["npm", "run", "check:copy"]].
Branch: orchestrate-agent/6165a6451512/06. Shipped tip: cdcb7e8f3f95757d6a0129e51f0b9f4621985a76. Commits: b8897fca0154c9f4005896226fbc514acbdf335b, 6fc61fb96d9a8d05c74934ec6fa6d7f1eb085373, e0826bef41454cda72b7feb67d2cdef266ebfa50, ce9d3eb568335a30da4ffcaa8a915fd4ea33e758, 1d0ab1d53b7bd5581c95c6a1f1c2b36bd88532f9, 3119ebd5df1ebb0a7920221d43024b0c0213dd9f, c5cd4d4752ed589cf5180e96e4de71651721d916, ffe2e29f5ad8eef85942d0924e1545fb285fbc1b, 6f061768f6e18bc654f7b0d2a46a98d86c3f9c02, 3f67aa6f7fec01e7552eba7ffda859b678184a5f, ee53e36b8ed4c0e81c213d66bcd337fc08dbb996, bb651d12ede852d5f3ec04633f0b3159517989fa, 66799c85e084e3af35b50cc03a7b50efecf9ca7f, 8459cfa5d2769d5d6974755be9d2aa23d9681604, f9ea452ff00b6e41eb0d8475f64ed4184ee74503, 80b4aea45bd0fdb69fa1ed504287778953972590, d4c308b12c80c5302744b886a42af4ba7faa7d68, eef4c1cab04913368466bb6ea174094185dd79e1, d7211d81a653295d788da549cd53a85c7e32a98a, af7af88457b4b7763ce7e2fb18833b385ad8f019, f46a4d39bbfae7af8aa4329a58473f81d1087d85, f1c6c05b8cfc0e3c3d13a027ab1d4e1bbafe605f, 90c994afee9afa480bba8a065a2577d5697ad070, 5363557a8fea4e9c186798b70e3e95932570196b, bd0fce13d4af3dbe3f77993737ba546e8e56743c, 13a6f754e00745dff63baa260da7cd6e9513e707, 888685c0dc3e4d430da193e9026a52603c5abfa7, badf1708385874f0c46f0afba9988fa56b83845b, 348d8f23e6c08fa07324dadf6f5aae0567f35d88, 64dcafa5b35971362317e896dbd320782f560eb7, 2b1d0af6edcabd1bdc0d599e0e1b77015ed4ff31, cdcb7e8f3f95757d6a0129e51f0b9f4621985a76.
Unblocked: none. Proposals: [].
Copied inputs: ["docs/agents/domain.md", "docs/agents/triage-labels.md", "docs/agents/verification.md", "docs/agents/issue-tracker.md", "docs/agents/platform.md", "docs/adr/0026-known-analyte-unit-conversion-is-a-narrow-allowlisted-exception.md", "docs/adr/0001-epoch-day-is-the-local-calendar-day.md", "docs/adr/0003-preferences-split-portable-and-device-local.md", "docs/adr/0004-reference-data-mirrored-entry-data-async.md", "docs/adr/0005-search-folds-text-in-the-app-not-in-the-tokenizer.md", "docs/adr/0006-forward-only-migrations-with-a-pre-migration-copy.md", "docs/adr/0008-photos-are-normalized-on-import.md", "docs/adr/0011-import-writes-files-first-and-never-deletes.md", "docs/adr/0012-native-units-for-numbers-normalized-values-for-colour.md", "docs/adr/0013-argon2id-parameters-are-tuned-per-consumer.md", "docs/adr/0014-forgotten-pin-resets-the-app-wrong-attempts-throttle.md", "docs/adr/0015-photo-metadata-is-stripped-on-normalize.md", "docs/adr/0016-the-node-tier-does-not-import-paraglide.md", "docs/adr/0017-the-journal-is-one-handle-bound-to-a-driver.md", "docs/adr/0019-the-landing-site-and-journal-use-separate-origins.md", "docs/adr/0020-encryption-is-whole-database-not-application-level.md", "docs/adr/0021-the-offline-shell-is-one-document-and-one-cache-per-release.md", "docs/adr/0022-the-public-version-name-comes-from-a-signed-tag.md", "docs/adr/0024-screens-read-vocabulary-reference-stays-internal.md", "docs/adr/0025-mood-gets-its-own-colour-scale.md", "docs/adr/0027-a-data-area-travels-because-it-registers-an-archive-section.md", "docs/adr/0028-the-launch-route-contract-is-pinned-by-one-shared-fixture.md", "docs/adr/0029-the-walkthrough-grips-handles-never-structure-or-wording.md", "docs/adr/0030-presets-rank-suggestion-lists-never-gate-them.md", "docs/adr/0031-a-clinician-summary-section-prints-because-it-registers.md", "docs/adr/0032-streak-reads-the-journaling-pause-the-run-out-rate-never-reads-a-dose-pause.md", "docs/adr/0033-onion-skin-alignment-is-a-post-capture-review-not-a-live-camera-surface.md", "docs/adr/0002-dual-identity-rowid-plus-travelling-uuid.md", "docs/adr/0034-a-video-note-records-through-a-live-camera-surface.md", "docs/adr/0035-the-pride-flag-is-a-home-only-motif-and-never-shows-under-disguise.md", "docs/adr/0036-feature-surfaces-live-in-a-more-hub-settings-holds-only-preferences.md", "docs/adr/0010-the-schema-does-not-store-derived-state.md", "docs/adr/0037-the-doubt-journal-becomes-a-read-only-counterevidence-check.md", "docs/adr/0038-cross-block-spacing-is-stamped-by-attribute-not-enumerated-by-class.md", "docs/adr/0039-home-gains-a-live-tile-area-gated-on-data-not-preference.md", "docs/adr/0040-the-counterevidence-check-becomes-safe-space-a-crisis-mode-dashboard.md", "docs/adr/0042-scheduled-archive-kdf-runs-behind-the-android-bridge.md", "docs/adr/0043-cycle-tracking-surfaces-only-through-a-testosterone-regimen-or-an-explicit-opt-in.md", "docs/adr/0044-entry-editor-contextual-writes-commit-in-one-transaction.md", "docs/adr/0045-an-automatic-trigger-never-mints-a-milestone-without-confirmation.md", "docs/adr/0046-stock-is-a-projection-not-a-stored-count.md", "docs/adr/0041-one-wrap-system-three-secret-sources-plus-no-secret-at-all.md", "docs/adr/0047-the-reminder-payload-is-wrapped-under-its-own-keystore-key.md", "docs/adr/0048-a-presentation-is-a-grouping-key-never-a-set-of-scales.md", "docs/adr/0049-an-era-is-a-named-span-and-owns-nothing-else.md", "docs/adr/0050-the-ambient-motion-budget-is-two-loops-on-home.md", "docs/adr/0051-the-flourish-is-dropped-and-the-ambient-budget-goes-back-to-one-loop.md", "docs/adr/0053-an-update-on-an-unknown-id-throws-a-delete-does-not.md", "docs/adr/0052-an-area-can-be-hidden-and-can-be-finished-and-the-two-are-separate.md", "docs/adr/0054-a-recovery-key-is-an-optional-second-wrap-of-the-data-key.md", "docs/adr/0057-an-entry-template-seeds-a-presentation-and-never-becomes-one.md", "docs/adr/0060-a-reference-band-is-keyed-to-the-passages-language-and-every-other-figure-is-explained-instead.md", "docs/adr/0061-a-benchmark-carries-its-capture-chain-and-device-sensitive-figures-compare-only-within-one.md", "docs/adr/0059-the-pitch-graph-may-carry-cited-reference-bands-nothing-else-may.md", "docs/adr/0058-chart-form-follows-whether-the-data-is-ordered.md", "docs/adr/0062-the-return-surface-is-a-moment-not-a-place-and-it-reports-what-is-waiting.md", "docs/adr/0056-the-stats-tab-is-an-index-and-emptiness-has-one-rule.md", "docs/adr/0063-a-platform-gate-hides-a-facility-never-a-record-the-person-created.md", "docs/adr/0064-a-wear-session-carries-a-kind-and-only-binding-gets-a-duration-cue.md", "docs/adr/0065-a-document-is-paper-the-person-keeps-and-the-app-never-reads-it.md", "docs/adr/0066-there-is-one-appointment-record-and-a-consult-is-a-case-of-it.md", "docs/adr/0067-what-is-coming-up-is-one-read-and-five-kinds-of-fact-earn-a-mark.md", "docs/adr/0068-a-roadmap-goal-is-a-step-not-a-record.md", "docs/adr/0069-a-long-log-grows-by-rendered-batches-and-search-stays-paged-by-its-control.md", "docs/adr/0023-the-android-floor-is-a-webview-version-not-an-api-level.md", "docs/adr/0070-progress-is-one-shared-component-cancel-answers-what-has-changed.md", "docs/adr/0071-the-mood-faces-are-the-second-ambient-loop-and-they-answer-the-finger.md", "docs/adr/0072-a-row-declares-which-screen-draws-it-and-the-hub-stops-being-flat.md", "docs/adr/0073-the-front-page-is-pinned-and-the-app-ranks-nothing-centrally.md", "docs/adr/0074-the-agenda-is-a-projection-of-one-week-and-it-never-counts-what-did-not-happen.md", "docs/adr/0075-colour-lives-in-a-field-and-in-blocks-and-nowhere-else.md", "docs/adr/0076-preferences-are-chrome-one-persistent-control-not-a-hub-row.md", "docs/adr/0077-moods-ramp-runs-between-two-hues-and-its-face-is-drawn-in-fills.md", "docs/adr/0078-a-state-change-moves-unless-its-ticket-says-why-not.md", "docs/adr/0079-setup-does-not-vary-by-disguise-and-offers-it-last.md", "docs/adr/0009-preferences-live-in-sqlite-with-a-small-boot-cache.md", "docs/adr/0081-a-body-region-is-one-value-on-one-scale.md", "docs/adr/0082-the-passage-and-the-vowel-answer-to-different-floors.md", "docs/adr/0083-a-distribution-over-a-continuous-axis-is-a-density-and-it-keeps-the-axis.md", "docs/adr/0085-a-photograph-is-browsed-in-one-library-and-owned-by-its-own-table.md", "docs/adr/0086-an-auto-logged-dose-is-a-standing-instruction-not-an-inference.md", "docs/adr/0084-a-reference-area-is-managed-in-settings-and-takes-no-hub-row.md", "docs/adr/0018-journal-data-is-encrypted-under-a-random-key.md", "docs/adr/0087-one-silhouette-and-neutrality-is-measured.md", "docs/adr/0088-the-launcher-icon-follows-the-chosen-flag.md", "docs/adr/0007-archive-is-a-framed-container-with-chunked-aes-gcm.md", "docs/adr/0089-the-android-driver-pipelines-bridge-calls-and-the-plugin-owns-order.md", "docs/adr/0090-lan-pairing-keeps-journal-keys-local.md", "docs/adr/0091-each-mood-step-picks-its-own-ink.md", "docs/adr/0092-an-explicit-feature-choice-beats-automatic-cycle-visibility.md", "docs/adr/0093-a-secondary-button-is-a-block-of-the-page.md", "CONTEXT.md", "SCREENS.md", "PRODUCT.md", "CLAUDE.md", ".scratch/phase-15/release-blockers/spec.md"].
Heavy commands: [{"command": ["npx", "cap", "sync", "android"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-6165a6451512", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-6165a6451512", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/m-b5a2cea4605d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-6165a6451512", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-6165a6451512", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/m-b5a2cea4605d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-6165a6451512", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-6165a6451512", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-6165a6451512", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npx", "cap", "sync", "android"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-6165a6451512", "wait_seconds": 2.0073344899992662, "gate_off": null, "exit_code": 0}].
