# 02 - data: A dose logged from the entry editor leaves the stock count alone

Status: resolved
Was: phase-14 pre-release 36 (moved 2026-10-05)
Type: bug
Audit findings: L01-02 (blocker B2 in the audit's clusters)
Severity: P1, the audit calls it release-blocking
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: no. No `/impeccable` pass.

Source: full audit of 5 October 2026, run on main 2e362652. origin/main was
22 commits ahead by then (REL-09), so re-check each finding on the current main
before fixing it. Reports, probes and shots are under
`.claude/audit-2026-10-05/` (`report-<reader>.md` per reader).

## Problem

Quick-logging a scheduled dose from the entry editor writes a decrement into
the stored stock quantity, which the stock projection was designed never to
store (ADR-0046; `.scratch/done/phase-5/cohesion/issues/06-stock-shows-up-where-doses-are-logged.md`
rules out "any stored stock counter, decrement write, refund path or zero
floor").

- `src/lib/data/journal/entries.ts:796-801`:
  `UPDATE medication_stock SET quantity = MAX(0, quantity - ?), updated_at = ? WHERE drug = ?`
  with `dose.dose`, the mg amount.
- The projection (`stockProjection.ts` header, `stock.ts:150-164`) already
  subtracts every non-skipped dose since `recordedEpochDay`, so the dose is
  taken off twice, and the person's typed count is overwritten.
- Reachable by default: `entryDoseQuickLogEnabled: true`
  (`prefs/catalogue.ts:493`), and `EntryEditor.svelte:1311-1335` calls
  `setDoseLog`.
- Probe `.claude/audit-2026-10-05/L01/stock.probe.ts`: before, stored 30 and
  remaining 30; after one quick-logged 2 mg tablet, stored 28 and remaining 27.
  It should read 30 and 29.

One tap on the dose chip rewrites the count the person typed and brings the
run-out date and the refill reminder forward, more with every quick-logged
dose. Report: `report-L01.md`.

## What to build

- Delete the UPDATE.
- Route the contextual dose through `doses.upsertDose` (one insert path, with
  `routeColumns`) instead of the raw INSERT at `entries.ts:778-795`.
- A regression test over the quick-log path.
- Counts already decremented on devices cannot be repaired automatically, since
  the original typed value is gone. Say so in Comments; no release has shipped,
  so only development journals are affected.

## Acceptance

- [ ] The stock probe reads stored 30, remaining 29 after one quick-logged dose.
- [ ] A test fails if any journal write path updates `medication_stock.quantity`
      other than the stock editor itself.
- [ ] The contextual dose goes through `doses.upsertDose`.

## Comments

Orchestration report 2026-10-05T20:41:16.163564+00:00

Issue: phase-15/release-blockers/02. Model: sonnet. Result: success.
Started: 2026-10-05T20:27:33.375803+00:00. Finished: 2026-10-05T20:39:13.157252+00:00.
Merge: merged.  Merge commit: 7c4edde9a9417c5010168ecfda368cec81712b1e.
Tests: ["Independent Standards PASS at aa2c8dab8c7e0c2aee0644060cbf603cb76bc7ac, no findings; review-standards.md.", "Independent Spec PASS at aa2c8dab8c7e0c2aee0644060cbf603cb76bc7ac, no findings; review-spec.md.", "Production build PASS at aa2c8dab8c7e0c2aee0644060cbf603cb76bc7ac through shared heavy gate; build.log.", "Typecheck PASS with --fail-on-warnings: 0 errors and 0 warnings; check.log.", "Full Node suite PASS once after integration refresh: 528 files, 6896 tests; node.log.", "Targeted entries, doses, stock, archive snapshot and quantity-writer guard PASS: 160 tests.", "Copy guard PASS: all 5 checks; copy.log.", "Observed causal reds: original contextual dose returned stored 28 instead of 30; oral archive retained injection/application metadata. Original source also fails skipped-stock and quantity-writer guards; red-guard-skipped.log.", "A recorded count of 30 tablets stays 30 and projects 29 after one contextual 2 mg dose. A skipped dose stays recorded 30 and projected 30.", "All six routes retain only their own metadata; uncollected sites stay null and contextual doses remain person-authored. Existing later debrief failure rolls back the entry, contextual dose and attachments.", "Previously overwritten counts cannot be repaired automatically because the original typed quantity is gone. No public release has shipped; affected journals are development journals. Recount and use the stock editor to correct an affected journal."]. Integration checks: [["uv", "run", "--script", "/home/alice/_projekty/f5/f5-data-delivery/skills/engineering/orchestrate/scripts/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary", "--feature", "phase-15/release-blockers", "--loop", "build", "--", "npm", "run", "build"], ["uv", "run", "--script", "/home/alice/_projekty/f5/f5-data-delivery/skills/engineering/orchestrate/scripts/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary", "--feature", "phase-15/release-blockers", "--loop", "check", "--", "npm", "run", "check"], ["npm", "test", "--", "--maxWorkers=2"], ["npm", "run", "check:copy"]].
Branch: orchestrate-agent/af6e180b4fca/02. Shipped tip: aa2c8dab8c7e0c2aee0644060cbf603cb76bc7ac. Commits: 17af1a9e634bcf9c71902ec399085b4c1d5d58a9, 9c4d4be09571b47196dd9157b10e3372a289ed00, bae099d38f3394bb2bc90d38f2886867663f98d7, 6f655f82891da084cbb715160de9ee51f315a30a, 3f0303f7b89ff918be7eda884340c0006cc2a62f, 4245dfe0d574208df6b8e411ba9757b46910516a, 9b64b91ae1fdea485ddcefac9aeac7b138c1a551, aa2c8dab8c7e0c2aee0644060cbf603cb76bc7ac.
Unblocked: none. Proposals: [].
Copied inputs: ["docs/agents/domain.md", "docs/agents/triage-labels.md", "docs/agents/verification.md", "docs/agents/issue-tracker.md", "docs/agents/platform.md", "docs/adr/0026-known-analyte-unit-conversion-is-a-narrow-allowlisted-exception.md", "docs/adr/0001-epoch-day-is-the-local-calendar-day.md", "docs/adr/0003-preferences-split-portable-and-device-local.md", "docs/adr/0004-reference-data-mirrored-entry-data-async.md", "docs/adr/0005-search-folds-text-in-the-app-not-in-the-tokenizer.md", "docs/adr/0006-forward-only-migrations-with-a-pre-migration-copy.md", "docs/adr/0008-photos-are-normalized-on-import.md", "docs/adr/0011-import-writes-files-first-and-never-deletes.md", "docs/adr/0012-native-units-for-numbers-normalized-values-for-colour.md", "docs/adr/0013-argon2id-parameters-are-tuned-per-consumer.md", "docs/adr/0014-forgotten-pin-resets-the-app-wrong-attempts-throttle.md", "docs/adr/0015-photo-metadata-is-stripped-on-normalize.md", "docs/adr/0016-the-node-tier-does-not-import-paraglide.md", "docs/adr/0017-the-journal-is-one-handle-bound-to-a-driver.md", "docs/adr/0019-the-landing-site-and-journal-use-separate-origins.md", "docs/adr/0020-encryption-is-whole-database-not-application-level.md", "docs/adr/0021-the-offline-shell-is-one-document-and-one-cache-per-release.md", "docs/adr/0022-the-public-version-name-comes-from-a-signed-tag.md", "docs/adr/0024-screens-read-vocabulary-reference-stays-internal.md", "docs/adr/0025-mood-gets-its-own-colour-scale.md", "docs/adr/0027-a-data-area-travels-because-it-registers-an-archive-section.md", "docs/adr/0028-the-launch-route-contract-is-pinned-by-one-shared-fixture.md", "docs/adr/0029-the-walkthrough-grips-handles-never-structure-or-wording.md", "docs/adr/0030-presets-rank-suggestion-lists-never-gate-them.md", "docs/adr/0031-a-clinician-summary-section-prints-because-it-registers.md", "docs/adr/0032-streak-reads-the-journaling-pause-the-run-out-rate-never-reads-a-dose-pause.md", "docs/adr/0033-onion-skin-alignment-is-a-post-capture-review-not-a-live-camera-surface.md", "docs/adr/0002-dual-identity-rowid-plus-travelling-uuid.md", "docs/adr/0034-a-video-note-records-through-a-live-camera-surface.md", "docs/adr/0035-the-pride-flag-is-a-home-only-motif-and-never-shows-under-disguise.md", "docs/adr/0036-feature-surfaces-live-in-a-more-hub-settings-holds-only-preferences.md", "docs/adr/0010-the-schema-does-not-store-derived-state.md", "docs/adr/0037-the-doubt-journal-becomes-a-read-only-counterevidence-check.md", "docs/adr/0038-cross-block-spacing-is-stamped-by-attribute-not-enumerated-by-class.md", "docs/adr/0039-home-gains-a-live-tile-area-gated-on-data-not-preference.md", "docs/adr/0040-the-counterevidence-check-becomes-safe-space-a-crisis-mode-dashboard.md", "docs/adr/0042-scheduled-archive-kdf-runs-behind-the-android-bridge.md", "docs/adr/0043-cycle-tracking-surfaces-only-through-a-testosterone-regimen-or-an-explicit-opt-in.md", "docs/adr/0044-entry-editor-contextual-writes-commit-in-one-transaction.md", "docs/adr/0045-an-automatic-trigger-never-mints-a-milestone-without-confirmation.md", "docs/adr/0046-stock-is-a-projection-not-a-stored-count.md", "docs/adr/0041-one-wrap-system-three-secret-sources-plus-no-secret-at-all.md", "docs/adr/0047-the-reminder-payload-is-wrapped-under-its-own-keystore-key.md", "docs/adr/0048-a-presentation-is-a-grouping-key-never-a-set-of-scales.md", "docs/adr/0049-an-era-is-a-named-span-and-owns-nothing-else.md", "docs/adr/0050-the-ambient-motion-budget-is-two-loops-on-home.md", "docs/adr/0051-the-flourish-is-dropped-and-the-ambient-budget-goes-back-to-one-loop.md", "docs/adr/0053-an-update-on-an-unknown-id-throws-a-delete-does-not.md", "docs/adr/0052-an-area-can-be-hidden-and-can-be-finished-and-the-two-are-separate.md", "docs/adr/0054-a-recovery-key-is-an-optional-second-wrap-of-the-data-key.md", "docs/adr/0057-an-entry-template-seeds-a-presentation-and-never-becomes-one.md", "docs/adr/0060-a-reference-band-is-keyed-to-the-passages-language-and-every-other-figure-is-explained-instead.md", "docs/adr/0061-a-benchmark-carries-its-capture-chain-and-device-sensitive-figures-compare-only-within-one.md", "docs/adr/0059-the-pitch-graph-may-carry-cited-reference-bands-nothing-else-may.md", "docs/adr/0058-chart-form-follows-whether-the-data-is-ordered.md", "docs/adr/0062-the-return-surface-is-a-moment-not-a-place-and-it-reports-what-is-waiting.md", "docs/adr/0056-the-stats-tab-is-an-index-and-emptiness-has-one-rule.md", "docs/adr/0063-a-platform-gate-hides-a-facility-never-a-record-the-person-created.md", "docs/adr/0064-a-wear-session-carries-a-kind-and-only-binding-gets-a-duration-cue.md", "docs/adr/0065-a-document-is-paper-the-person-keeps-and-the-app-never-reads-it.md", "docs/adr/0066-there-is-one-appointment-record-and-a-consult-is-a-case-of-it.md", "docs/adr/0067-what-is-coming-up-is-one-read-and-five-kinds-of-fact-earn-a-mark.md", "docs/adr/0068-a-roadmap-goal-is-a-step-not-a-record.md", "docs/adr/0069-a-long-log-grows-by-rendered-batches-and-search-stays-paged-by-its-control.md", "docs/adr/0023-the-android-floor-is-a-webview-version-not-an-api-level.md", "docs/adr/0070-progress-is-one-shared-component-cancel-answers-what-has-changed.md", "docs/adr/0071-the-mood-faces-are-the-second-ambient-loop-and-they-answer-the-finger.md", "docs/adr/0072-a-row-declares-which-screen-draws-it-and-the-hub-stops-being-flat.md", "docs/adr/0073-the-front-page-is-pinned-and-the-app-ranks-nothing-centrally.md", "docs/adr/0074-the-agenda-is-a-projection-of-one-week-and-it-never-counts-what-did-not-happen.md", "docs/adr/0075-colour-lives-in-a-field-and-in-blocks-and-nowhere-else.md", "docs/adr/0076-preferences-are-chrome-one-persistent-control-not-a-hub-row.md", "docs/adr/0077-moods-ramp-runs-between-two-hues-and-its-face-is-drawn-in-fills.md", "docs/adr/0078-a-state-change-moves-unless-its-ticket-says-why-not.md", "docs/adr/0079-setup-does-not-vary-by-disguise-and-offers-it-last.md", "docs/adr/0009-preferences-live-in-sqlite-with-a-small-boot-cache.md", "docs/adr/0081-a-body-region-is-one-value-on-one-scale.md", "docs/adr/0082-the-passage-and-the-vowel-answer-to-different-floors.md", "docs/adr/0083-a-distribution-over-a-continuous-axis-is-a-density-and-it-keeps-the-axis.md", "docs/adr/0085-a-photograph-is-browsed-in-one-library-and-owned-by-its-own-table.md", "docs/adr/0086-an-auto-logged-dose-is-a-standing-instruction-not-an-inference.md", "docs/adr/0084-a-reference-area-is-managed-in-settings-and-takes-no-hub-row.md", "docs/adr/0018-journal-data-is-encrypted-under-a-random-key.md", "docs/adr/0087-one-silhouette-and-neutrality-is-measured.md", "docs/adr/0088-the-launcher-icon-follows-the-chosen-flag.md", "docs/adr/0007-archive-is-a-framed-container-with-chunked-aes-gcm.md", "docs/adr/0089-the-android-driver-pipelines-bridge-calls-and-the-plugin-owns-order.md", "docs/adr/0090-lan-pairing-keeps-journal-keys-local.md", "docs/adr/0091-each-mood-step-picks-its-own-ink.md", "docs/adr/0092-an-explicit-feature-choice-beats-automatic-cycle-visibility.md", "docs/adr/0093-a-secondary-button-is-a-block-of-the-page.md", "CONTEXT.md", "SCREENS.md", "PRODUCT.md", "CLAUDE.md", ".scratch/phase-15/release-blockers/spec.md"].
Heavy commands: [{"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-af6e180b4fca", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-af6e180b4fca", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/m-9b305aa8e8e3", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-af6e180b4fca", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check:copy"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-af6e180b4fca", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/m-9b305aa8e8e3", "wait_seconds": 0, "gate_off": null, "exit_code": 0}].
