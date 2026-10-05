# 01 - data: Foreign keys enforced where the journal actually runs

Status: resolved
Status note: (reopened 2026-10-05: an archive holding a revisit on a trashed entry cannot be restored with foreign keys on, L01-01)
Was: phase-14 pre-release 01 (moved 2026-10-05)
Type: bug
Audit findings: D1
Severity: P1, blocks release
Blocked by: none
Size: M
Size note: one to two days
Model: opus
Model note: (a migration that deletes rows, and the data-loss path on every device)
UI: no. No `/impeccable` pass.

## Problem

Production SQLite never enforces foreign keys. The shipped wasm build
(`@evolu/sqlite-wasm`, SQLite 3.50.4, SQLite3MC 2.2.4) reports
`foreign_keys = 0`, and nothing in `src/lib/data/sqlite/*` or the Android
SQLCipher code turns it on. The Node test tier uses `node:sqlite`
(`src/lib/data/sqlite/test-support/node-sqlite-driver.ts:15`), which defaults
to `1`. So every test passes against behaviour no device has.

`schema.ts` declares 28 `ON DELETE CASCADE` and 2 `SET NULL` rules. Code that
relies on them:

- `hairRemoval.ts:161-163`, `deleteSession`: "Its photos go with it".
- `procedures.ts:238-255`: `procedure_photo` and `appointment`.
- `checklists.ts:192-194`: `checklist_item`.
- `entries.ts:1363-1369`: the purge deletes children by hand but misses
  `margin_note` (schema:167 relies on a cascade).

Effect on a device: a deleted hair-removal session leaves its photo rows, so
the files are never swept, and they leave the device in every backup. A
deleted procedure leaves its consult appointments; a deleted checklist leaves
its items.

Evidence, all in `.claude/audit-2026-10-03/backend/`: `fk-probe.mjs` (prints
`foreign_keys default = 0`, rechecked by hand on 3 October), and
`probe/fk.probe.test.ts`, `probe/fk2.probe.test.ts` (same code, FK on vs off:
on gives `appointmentsLeft:0, orphanItems:0, manifest:[]`; off gives
`appointmentsLeft:1, orphanItems:1` and the deleted session's two photo files
in the backup manifest). Rerun with
`npx vitest run --config <probe>/vitest.config.mjs --root <probe>`.

## What to build

1. `PRAGMA foreign_keys = ON` on every connection, where the connection is
   opened: the web worker (mc worker), `sqlocal-driver`, and Android's
   `SqliteConnection` after the key is applied.
2. Migrations run with it off and turn it back on after, because table-rebuild
   migrations (v81 and the like) must not cascade while they copy. Run
   `PRAGMA foreign_key_check` after migrating and fail loudly in tests if it
   reports anything.
3. A migration (v85) that deletes orphans already on devices: rows whose
   parent id no longer exists, for every child table with a declared foreign
   key. Photo files whose rows it deletes are left for the boot orphan sweep,
   which already handles files with no row.
4. A test that opens the production driver path (not `node:sqlite` defaults)
   and asserts `foreign_keys` is 1, so the two tiers cannot drift again. If
   the Node driver keeps its default of 1, the test must still prove the
   production open sets it.
5. Fix `entries.ts` purge for `margin_note` explicitly as well, so a purge does
   not depend on the pragma.

Archive restore runs inside a transaction that inserts parents and children:
check insert order holds with enforcement on (the Merge and Replace paths, the
golden archive test, `restore.ts`). Read `docs/adr/` on archive sections before
reordering anything.

## Acceptance

- [ ] Every connection on web and Android reports `foreign_keys = 1` after
      open; a test fails if the production open path stops setting it.
- [ ] Deleting a hair-removal session, a procedure and a checklist removes
      their children, and the next backup's manifest no longer lists the
      deleted session's photos (the fk2 probe passes with production settings).
- [ ] Migrations run with enforcement off and leave `foreign_key_check` empty.
- [ ] The v85 orphan cleanup is tested on a journal seeded with orphans of
      every kind and leaves non-orphans untouched.
- [ ] Restore (Merge and Replace) and the golden archive test pass with
      enforcement on.
- [ ] Android: checked on the device or the emulator tier that SQLCipher
      reports 1 after open.

## Reopened 2026-10-05 (full audit)

Status set back to ready-for-agent. The acceptance line "Restore (Merge and
Replace) and the golden archive test pass with enforcement on" does not hold
for one shape of data, and the audit calls it release-blocking (B1). Report:
`.claude/audit-2026-10-05/report-L01.md`, `report-L02.md`.

- **L01-01 (P1, blocks release).** A "see this again" revisit on an entry that
  was later trashed travels in the archive without its entry.
  `revisit.entry_id ... REFERENCES entry(uuid)` has no ON DELETE
  (`schema.ts:1352`); `readEntries` drops trashed entries
  (`archiveRead.ts:265`) while `revisits` is a flat section that exports every
  row (`archiveSections.ts:527-546`); `applyFlatTable` inserts them with no
  owner check (`archiveApply.ts:114-137`). With foreign keys on, every Replace
  and every Merge of that archive fails with `FOREIGN KEY constraint failed`,
  on a new phone and on the same device, and `verifyArchive`
  (`restore.ts:354-368`) still calls the file healthy because it never applies
  rows. `readMarginNotes` (`archiveRead.ts:452-459`) exports margin notes of
  trashed entries the same way. Probe:
  `.claude/audit-2026-10-05/L01/revisit.probe.ts` printed `REPLACE FAILED`,
  `MERGE FAILED` and `SAME-DEVICE REPLACE FAILED`.
- **L02-10 (P3).** `migration-runner.ts:153-166` runs `PRAGMA
  foreign_key_check` on every clean boot and throws on any row, so one future
  orphan makes the journal unopenable with a technical error, and "restore
  previous" brings the same rows back. This ticket asked for the check after
  migrating only.
- **L01-10 (P3).** `hairRemoval.ts:161-163` deletes the session row; its photo
  rows now cascade, but the files stay on disk until the next cold-boot sweep.
  `deleteTryout` and `deleteProcedure` remove their files.

What to build:

- Make revisits a hand-written section: the read joins `entry` with
  `trashed_at IS NULL`; the apply skips a row whose `entry_id` resolves to no
  entry, the way `applyMarginNotes` does, so archives already made with this
  shape still restore.
- Filter `readMarginNotes` on trash too.
- Add a trashed entry with a revisit and a margin note to `everySection()` and
  the golden fixture (it never had one, which is why the archive tests missed
  this). Consider having the backup check apply rows into an in-memory
  database.
- Run `foreign_key_check` only after migrations; on a clean boot, log a
  violation and carry on.
- `deleteSession` reads the file paths and removes the files, as `deleteTryout`
  does.

Acceptance (added):

- [ ] An archive holding a revisit and a margin note of a trashed entry
      restores by Replace and by Merge, on the same device and on a fresh one,
      with foreign keys on; the revisit probe passes.
- [ ] The backup check fails a file that cannot be applied, or the apply path
      can no longer fail on this shape (a test proves which).
- [ ] A clean boot over a journal with one orphan row opens and logs it.
- [ ] Deleting a hair-removal session removes its photo files at once.

## Comments

Orchestration report 2026-10-05T20:30:23.154443+00:00

Issue: phase-15/release-blockers/01. Model: opus. Result: success.
Started: 2026-10-05T20:04:16.248035+00:00. Finished: 2026-10-05T20:28:43.201472+00:00.
Merge: merged.  Merge commit: 3f0303f7b89ff918be7eda884340c0006cc2a62f.
Tests: ["Standards PASS at bae099d38f3394bb2bc90d38f2886867663f98d7; no findings (review-standards.md).", "Spec PASS at bae099d38f3394bb2bc90d38f2886867663f98d7; no findings (review-spec.md).", "Final production build PASS; typecheck 0 errors and 0 warnings; copy check 5 PASS.", "Full Node suite PASS: 526 files, 6876 tests.", "Archive, clean boot, hair-removal deletion and v85 targeted checks PASS: 138 tests plus 23 archive coverage checks. Causal red logs preserved.", "Native SQLCipher FK instrumentation PASS on windowed tracker35: foreignKeysAreEnabledOnProductionConnectionOpen, 1 test, 0 failures/errors/skips. Plain/encrypted/reopened connections report FK=1 and cascade.", "Browser tier: 327 PASS, 2 FAIL. Ticket01 sqlite3mc/SQLocal FK checks pass. The two MoodChips failures are attributed to the UI08 focus-only arrow behavior versus existing probe expectations; UI owner assessment is tracked separately.", "Original v85 cleanup, explicit margin-note purge and native production-open enforcement were reused. Migration86 anchor behavior and released immutable fixtures remain intact.", "Golden archive rebuilt from a real journal containing a trashed entry, revisit and margin note. All section counts and legacy reminder coverage preserved.", "Conflict-free refresh of integration641442b8 at shipped tip6f655f82891da084cbb715160de9ee51f315a30a. Ticket01 data changes and native connection/test sources unchanged from reviewed tip; helper performs final combined checks."]. Integration checks: [["uv", "run", "--script", "/home/alice/_projekty/f5/f5-data-delivery/skills/engineering/orchestrate/scripts/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary", "--feature", "phase-15/release-blockers", "--loop", "build", "--", "npm", "run", "build"], ["uv", "run", "--script", "/home/alice/_projekty/f5/f5-data-delivery/skills/engineering/orchestrate/scripts/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary", "--feature", "phase-15/release-blockers", "--loop", "check", "--", "npm", "run", "check"], ["npm", "test", "--", "--maxWorkers=2"], ["npm", "run", "check:copy"]].
Branch: orchestrate-agent/a25994ed756f/01. Shipped tip: 6f655f82891da084cbb715160de9ee51f315a30a. Commits: 878a9a3e4b61249383ea6efbf5fcb4d34c19dc27, 794363bc98736dbc5b4f447b0824e2ee146136d5, 4157594b455d977057b41c1ce7a5332543950717, f02a11c451dff6b203d2433bb683102aaea9ed07, de1c90d3aa3951c37a7d12547be7e2d1ebc40928, 026df50f6737278bebdf18947f70d638fa02bf2e, 482a60214cf45aea0467769db25190f73144d662, 16b07a7b559ab340f71f483e634c57d106149307, 3a2898e289d024cbae7ee43d8d2398529df4099f, db19a44c154b0b49d8b1028667fa29b1b1c6f88f, 487e143c971bef904bc42861db54cffcc6e40d33, 2eafe037a499b144768719b6c44defd6955bad7a, dae3c325bdf2fd9a4cb3562f3ca4bc8591e36380, 17af1a9e634bcf9c71902ec399085b4c1d5d58a9, 65f6dcdf39481b42981c439ad81646c4f6fed4b9, 9c4d4be09571b47196dd9157b10e3372a289ed00, bae099d38f3394bb2bc90d38f2886867663f98d7, 894b7cfeb94723111ec774e2028957b8e7783d16, beb2bafe85c68363997e2986cd63b719ccc004bd, 9d6d665e8a68f529243cbdcc7a205cb7344881bd, 772a88057f92167d5bd64656b6ee53ad7d6a347b, 641442b86894bef814b08270b3958d1b8b2f74db, 6f655f82891da084cbb715160de9ee51f315a30a.
Unblocked: none. Proposals: [].
Copied inputs: ["docs/agents/domain.md", "docs/agents/triage-labels.md", "docs/agents/verification.md", "docs/agents/issue-tracker.md", "docs/agents/platform.md", "docs/adr/0026-known-analyte-unit-conversion-is-a-narrow-allowlisted-exception.md", "docs/adr/0001-epoch-day-is-the-local-calendar-day.md", "docs/adr/0003-preferences-split-portable-and-device-local.md", "docs/adr/0004-reference-data-mirrored-entry-data-async.md", "docs/adr/0005-search-folds-text-in-the-app-not-in-the-tokenizer.md", "docs/adr/0006-forward-only-migrations-with-a-pre-migration-copy.md", "docs/adr/0008-photos-are-normalized-on-import.md", "docs/adr/0011-import-writes-files-first-and-never-deletes.md", "docs/adr/0012-native-units-for-numbers-normalized-values-for-colour.md", "docs/adr/0013-argon2id-parameters-are-tuned-per-consumer.md", "docs/adr/0014-forgotten-pin-resets-the-app-wrong-attempts-throttle.md", "docs/adr/0015-photo-metadata-is-stripped-on-normalize.md", "docs/adr/0016-the-node-tier-does-not-import-paraglide.md", "docs/adr/0017-the-journal-is-one-handle-bound-to-a-driver.md", "docs/adr/0019-the-landing-site-and-journal-use-separate-origins.md", "docs/adr/0020-encryption-is-whole-database-not-application-level.md", "docs/adr/0021-the-offline-shell-is-one-document-and-one-cache-per-release.md", "docs/adr/0022-the-public-version-name-comes-from-a-signed-tag.md", "docs/adr/0024-screens-read-vocabulary-reference-stays-internal.md", "docs/adr/0025-mood-gets-its-own-colour-scale.md", "docs/adr/0027-a-data-area-travels-because-it-registers-an-archive-section.md", "docs/adr/0028-the-launch-route-contract-is-pinned-by-one-shared-fixture.md", "docs/adr/0029-the-walkthrough-grips-handles-never-structure-or-wording.md", "docs/adr/0030-presets-rank-suggestion-lists-never-gate-them.md", "docs/adr/0031-a-clinician-summary-section-prints-because-it-registers.md", "docs/adr/0032-streak-reads-the-journaling-pause-the-run-out-rate-never-reads-a-dose-pause.md", "docs/adr/0033-onion-skin-alignment-is-a-post-capture-review-not-a-live-camera-surface.md", "docs/adr/0002-dual-identity-rowid-plus-travelling-uuid.md", "docs/adr/0034-a-video-note-records-through-a-live-camera-surface.md", "docs/adr/0035-the-pride-flag-is-a-home-only-motif-and-never-shows-under-disguise.md", "docs/adr/0036-feature-surfaces-live-in-a-more-hub-settings-holds-only-preferences.md", "docs/adr/0010-the-schema-does-not-store-derived-state.md", "docs/adr/0037-the-doubt-journal-becomes-a-read-only-counterevidence-check.md", "docs/adr/0038-cross-block-spacing-is-stamped-by-attribute-not-enumerated-by-class.md", "docs/adr/0039-home-gains-a-live-tile-area-gated-on-data-not-preference.md", "docs/adr/0040-the-counterevidence-check-becomes-safe-space-a-crisis-mode-dashboard.md", "docs/adr/0042-scheduled-archive-kdf-runs-behind-the-android-bridge.md", "docs/adr/0043-cycle-tracking-surfaces-only-through-a-testosterone-regimen-or-an-explicit-opt-in.md", "docs/adr/0044-entry-editor-contextual-writes-commit-in-one-transaction.md", "docs/adr/0045-an-automatic-trigger-never-mints-a-milestone-without-confirmation.md", "docs/adr/0046-stock-is-a-projection-not-a-stored-count.md", "docs/adr/0041-one-wrap-system-three-secret-sources-plus-no-secret-at-all.md", "docs/adr/0047-the-reminder-payload-is-wrapped-under-its-own-keystore-key.md", "docs/adr/0048-a-presentation-is-a-grouping-key-never-a-set-of-scales.md", "docs/adr/0049-an-era-is-a-named-span-and-owns-nothing-else.md", "docs/adr/0050-the-ambient-motion-budget-is-two-loops-on-home.md", "docs/adr/0051-the-flourish-is-dropped-and-the-ambient-budget-goes-back-to-one-loop.md", "docs/adr/0053-an-update-on-an-unknown-id-throws-a-delete-does-not.md", "docs/adr/0052-an-area-can-be-hidden-and-can-be-finished-and-the-two-are-separate.md", "docs/adr/0054-a-recovery-key-is-an-optional-second-wrap-of-the-data-key.md", "docs/adr/0057-an-entry-template-seeds-a-presentation-and-never-becomes-one.md", "docs/adr/0060-a-reference-band-is-keyed-to-the-passages-language-and-every-other-figure-is-explained-instead.md", "docs/adr/0061-a-benchmark-carries-its-capture-chain-and-device-sensitive-figures-compare-only-within-one.md", "docs/adr/0059-the-pitch-graph-may-carry-cited-reference-bands-nothing-else-may.md", "docs/adr/0058-chart-form-follows-whether-the-data-is-ordered.md", "docs/adr/0062-the-return-surface-is-a-moment-not-a-place-and-it-reports-what-is-waiting.md", "docs/adr/0056-the-stats-tab-is-an-index-and-emptiness-has-one-rule.md", "docs/adr/0063-a-platform-gate-hides-a-facility-never-a-record-the-person-created.md", "docs/adr/0064-a-wear-session-carries-a-kind-and-only-binding-gets-a-duration-cue.md", "docs/adr/0065-a-document-is-paper-the-person-keeps-and-the-app-never-reads-it.md", "docs/adr/0066-there-is-one-appointment-record-and-a-consult-is-a-case-of-it.md", "docs/adr/0067-what-is-coming-up-is-one-read-and-five-kinds-of-fact-earn-a-mark.md", "docs/adr/0068-a-roadmap-goal-is-a-step-not-a-record.md", "docs/adr/0069-a-long-log-grows-by-rendered-batches-and-search-stays-paged-by-its-control.md", "docs/adr/0023-the-android-floor-is-a-webview-version-not-an-api-level.md", "docs/adr/0070-progress-is-one-shared-component-cancel-answers-what-has-changed.md", "docs/adr/0071-the-mood-faces-are-the-second-ambient-loop-and-they-answer-the-finger.md", "docs/adr/0072-a-row-declares-which-screen-draws-it-and-the-hub-stops-being-flat.md", "docs/adr/0073-the-front-page-is-pinned-and-the-app-ranks-nothing-centrally.md", "docs/adr/0074-the-agenda-is-a-projection-of-one-week-and-it-never-counts-what-did-not-happen.md", "docs/adr/0075-colour-lives-in-a-field-and-in-blocks-and-nowhere-else.md", "docs/adr/0076-preferences-are-chrome-one-persistent-control-not-a-hub-row.md", "docs/adr/0077-moods-ramp-runs-between-two-hues-and-its-face-is-drawn-in-fills.md", "docs/adr/0078-a-state-change-moves-unless-its-ticket-says-why-not.md", "docs/adr/0079-setup-does-not-vary-by-disguise-and-offers-it-last.md", "docs/adr/0009-preferences-live-in-sqlite-with-a-small-boot-cache.md", "docs/adr/0081-a-body-region-is-one-value-on-one-scale.md", "docs/adr/0082-the-passage-and-the-vowel-answer-to-different-floors.md", "docs/adr/0083-a-distribution-over-a-continuous-axis-is-a-density-and-it-keeps-the-axis.md", "docs/adr/0085-a-photograph-is-browsed-in-one-library-and-owned-by-its-own-table.md", "docs/adr/0086-an-auto-logged-dose-is-a-standing-instruction-not-an-inference.md", "docs/adr/0084-a-reference-area-is-managed-in-settings-and-takes-no-hub-row.md", "docs/adr/0018-journal-data-is-encrypted-under-a-random-key.md", "docs/adr/0087-one-silhouette-and-neutrality-is-measured.md", "docs/adr/0088-the-launcher-icon-follows-the-chosen-flag.md", "docs/adr/0007-archive-is-a-framed-container-with-chunked-aes-gcm.md", "docs/adr/0089-the-android-driver-pipelines-bridge-calls-and-the-plugin-owns-order.md", "docs/adr/0090-lan-pairing-keeps-journal-keys-local.md", "docs/adr/0091-each-mood-step-picks-its-own-ink.md", "docs/adr/0092-an-explicit-feature-choice-beats-automatic-cycle-visibility.md", "docs/adr/0093-a-secondary-button-is-a-block-of-the-page.md", "CONTEXT.md", "SCREENS.md", "PRODUCT.md", "CLAUDE.md", ".scratch/phase-15/release-blockers/spec.md"].
Heavy commands: [{"command": ["python3", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/01/native-fk.py"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-a25994ed756f", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "test:browser"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-a25994ed756f", "wait_seconds": 0, "gate_off": null, "exit_code": 1}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-a25994ed756f", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-a25994ed756f", "wait_seconds": 12.012426486999175, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check:copy"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-a25994ed756f", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npx", "cap", "sync", "android"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-a25994ed756f", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/m-a4856e649ff6", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-a25994ed756f", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["python3", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/01/native-fk.py"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-a25994ed756f", "wait_seconds": 0, "gate_off": null, "exit_code": 1}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/m-a4856e649ff6", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-a25994ed756f", "wait_seconds": 0, "gate_off": null, "exit_code": 1}, {"command": ["python3", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/01/native-fk.py"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-a25994ed756f", "wait_seconds": 22.020164939000097, "gate_off": null, "exit_code": 1}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-a25994ed756f", "wait_seconds": 0, "gate_off": null, "exit_code": 0}].
