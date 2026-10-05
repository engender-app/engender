# 13 - data: Archive format guards that have to be inside 1.0

Status: resolved
Status note: (reopened 2026-10-05 for audit follow-up ARCH-02, L02-05; the original scope shipped)
Was: phase-14 pre-release 08 (moved 2026-10-05)
Type: build
Audit findings: D3, A3, D5
Severity: P2, but must ship in 1.0 (1.0 cannot be changed after it ships)
Blocked by: none
Size: S
Size note: under a day (plus the fixture write at the release cut)
Model: opus
Model note: (backup compatibility is forever once released)
UI: no. No `/impeccable` pass. (If the refusal needs a new string, it is copy
only.)

## Problems

**D3, sections, not versions.** `restore.ts:374-380` (`assertRestorable`)
throws `CorruptArchiveError` for any registered section missing from an
archive. `payload.ts:1056` (`PAYLOAD_MIGRATIONS`) has one step and the format
version stays at 2 when a section is added. `applyArchiveJournal` ignores
sections it does not know. So after release the first update that adds an area
makes every 1.0 backup unrestorable, and a newer backup restored on 1.0 drops
whole areas silently. Noted in project memory
(`adding-an-archive-section-refuses-older-archives`) on 3 September, never
ticketed.

**A3, tests rebuild what release freezes.** The golden archive
(`fixtures/golden-archive.ttbackup`, `archive-golden.test.ts`) is both the
completeness check (rebuilt routinely, 37 commits since 1 September) and the
only proof an older archive still opens. Schema tests start from an empty
database (`{78: BASELINE} + 79..84`). Four comments justify unversioned changes
with "no release has shipped": `payload.ts:49`, `payload.ts:198`,
`schema.ts:5`, `migrations.ts:11`.

**D5, KDF constants can drift.** The archive header records JS
`ARCHIVE_ARGON2_PARAMS` (`params.ts:21`, via `pack.ts:80`); native automatic
backup uses its own constants (`AutoExportPlugin.java:86-89`). Parity holds
today (the "failure" in ticket 03's log was the probe passing `{8192,1,1,32}`,
`tests/android-tier/archive/archive-cross-probe.ts:398-415`), but nothing
tests it, and native verification checks length and hash, not decryptability.

## What to build

- 1.0 refuses an archive that carries a section it does not know, with a
  plain message that a newer version of the app made it. (Warn-and-continue is
  the alternative; pick refuse unless Alicja says otherwise, since silent loss
  is the failure being prevented.)
- An ADR: from 1.0 on, adding a section bumps the format version and adds a
  payload migration that fills the absent section with `[]`.
- `fixtures/released/` and a `released-formats.test.ts` that opens every file
  under it with the current codec and migration runner and checks row counts.
  The test passes vacuously with no fixtures; pre-release-human 06 writes
  `fixtures/released/1.0.0/{archive.ttbackup, journal.sqlite}` from the
  release candidate, and they are never rebuilt. Amend ADR-0006 in one
  paragraph to say so.
- Rewrite the four comments to name 1.0.0 as the cutoff.
- Fix the probe's KDF profile; add a node test that reads the Java constants
  and compares them to `ARCHIVE_ARGON2_PARAMS`.

## Acceptance

- [ ] An archive with an unknown section is refused with a clear message; test.
- [ ] ADR recorded; ADR-0006 amended.
- [ ] `released-formats.test.ts` exists and runs in the node tier; pre-release-human
      06 names the fixture write.
- [ ] JS/Java KDF constant test passes and fails when either side changes.

## Audit 2026-10-05 follow-up (reopened)

The original acceptance stands (the data reader confirmed unknown sections are
refused and the cutoff comments name 1.0.0). Two more format concerns belong
here because they have to be settled before 1.0 freezes the format. Status set
to ready-for-agent for them. Reports: `.claude/audit-2026-10-05/report-arch.md`,
`report-L02.md`.

- **ARCH-02 (P3).** The archive format version is owned through an import
  cycle: `container.ts:26,46` computes `ARCHIVE_FORMAT_VERSION` at load,
  `codec.ts:1-3` imports container at runtime (with `verbatimModuleSyntax` the
  type import stays a side-effect import), and `payload.ts:24,1080` imports the
  version back. Importing `codec.ts` first throws `ReferenceError: Cannot
  access 'ARCHIVE_CODECS' before initialization`
  (`.claude/audit-2026-10-05/arch/codec-first.ts`). Today only the import order
  in `pack.ts:21` saves it; a new caller that imports codec first would crash
  every backup and restore at load.
- **L02-05 (P3).** Wear-kind labels index `KIND_LABELS[kind]()` directly
  (`vocabulary/wearLabels.ts:150-163`), while the schema deliberately accepts
  unknown kinds so newer archives read back (`schema.ts:449-452`). A backup
  from a later build with a new wear kind, restored on 1.0, crashes the wear
  screen and the More hub (`hubLabels.ts:153`) with "undefined is not a
  function".

What to build:

- Codec owns `ARCHIVE_FORMAT_VERSION`; `applyMigrations` takes its target from
  the caller; codec imports ByteReader with `import type`; container imports the
  version from codec.
- `KIND_LABELS[kind]?.() ?? kind`, and the same for the other wear records (or
  normalise unknown kinds at the read).

Acceptance (added):

- [ ] A node test imports `codec.ts` alone in a fresh module graph and encodes;
      the import graph has no cycle through container.
- [ ] A wear session with an unknown kind renders on the wear screen and the
      More hub without throwing (a test).

## Comments

Orchestration report 2026-10-05T21:38:04.738312+00:00

Issue: phase-15/release-blockers/13. Model: opus. Result: success.
Started: 2026-10-05T21:02:34.856419+00:00. Finished: 2026-10-05T21:36:26.560364+00:00.
Merge: merged.  Merge commit: bf30876d83f47ae82ff7b5253b953c31b8a17a43.
Tests: ["Full browser: 354 PASS, 0 FAIL, including all eight permanent Wear/More checks", "Final corrected tip: targeted Wear/More eight groups unchanged, zero page errors; WebView floor two tests pass", "Production build at committed 042f2ac9 passed; check 0 errors/0 warnings; full Node 531 files and 6942 tests passed; copy guard passed", "Independent Standards and Spec reviews PASS at exact shipped tip", "Archive original acceptance: 7 targeted tests; codec/payload/container: 42 targeted tests", "ADR-0006 and ADR-0094 delivered locally and durably under nonui/13/docs/adr; hashes verified; ignored docs not force-added"]. Integration checks: [["uv", "run", "--script", "/home/alice/_projekty/f5/f5-data-delivery/skills/engineering/orchestrate/scripts/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary", "--feature", "phase-15/release-blockers", "--loop", "build", "--", "npm", "run", "build"], ["uv", "run", "--script", "/home/alice/_projekty/f5/f5-data-delivery/skills/engineering/orchestrate/scripts/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary", "--feature", "phase-15/release-blockers", "--loop", "check", "--", "npm", "run", "check"], ["npm", "test", "--", "--maxWorkers=2"], ["npm", "run", "check:copy"]].
Branch: orchestrate-agent/815b2f16e16d/13. Shipped tip: 042f2ac947bb7c23c7abc57b04c859f97cc0e305. Commits: 8128ac4e7b06df5a9685a5277e956462f7fbf318, 4a656152629c19a5af97f5ad5ca944a874e05f09, b62d3227678f444b59e7a437f035c061045c419d, 2aa897f9e4ec7c1f72e18f6a4bdbbafc2254c610, cb062ac47abad95d3af6cae171c22277471692fd, 9aea0ad4be9d09be013f00d930693434167323e1, 3ad3b10155a1d3ff03dbb061517fb3bcf6fa8bb9, 6e2223f504baaca2c44d168509052e8007e2cdae, 10e8406bec4f5da794bf71bedb73eb5f1e349443, 62dae7719de58a30a24ab2cad63882f969e03291, 9eb8f7ce628c8ce8b8d68ab48265a278edc5737d, 90dad8e93a8a51bdaaf5780b3c74910ee5e2fdd4, dc8b0b89b91947d702736942b9b38a3c4ab92d97, b75d1d0cba8afccb12d5bc71cf92e1f653806a96, 2f193b602162278a885da0af9058d2a24353ab9c, 37004e58f48be9b3d923e0966559e27db9b24766, 5984bca70f176472c55427140ccdb3ae0a258425, 4fc446e53a9daf34ba18bebc1ff8b54af8cef49d, 1897fb938c17f4012cf301d20e1a507ba765266c, 9abd1737c562b53f657d516b0c0f231d3f6dfbd2, d4b7d4c5389e8ae88a3c46617c04be3732085f55, fc011dff29e396df5f8a31bfa22e0b953859c825, d05fa2204109130f8af6ff296f4a631259dbd7a1, ad046a9d0501ba2dedaf52d705c8c5ae374e4c6b, 8feac37e7a1e97b254672acca5c9ecc25072b8a5, ef9019b4d184ab5b02ae0a99797a41ccb5b8cc8a, 7df9d4a17a25afbc822090ca3db12a57360ca3fa, 0912fe7a26e9e37c36f06c478f72afd6b411d1f1, b3481e02b4291c971fe1420aedd043a229d527c0, 042f2ac947bb7c23c7abc57b04c859f97cc0e305.
Unblocked: none. Proposals: [].
Copied inputs: ["docs/agents/domain.md", "docs/agents/triage-labels.md", "docs/agents/verification.md", "docs/agents/issue-tracker.md", "docs/agents/platform.md", "docs/adr/0026-known-analyte-unit-conversion-is-a-narrow-allowlisted-exception.md", "docs/adr/0001-epoch-day-is-the-local-calendar-day.md", "docs/adr/0003-preferences-split-portable-and-device-local.md", "docs/adr/0004-reference-data-mirrored-entry-data-async.md", "docs/adr/0005-search-folds-text-in-the-app-not-in-the-tokenizer.md", "docs/adr/0006-forward-only-migrations-with-a-pre-migration-copy.md", "docs/adr/0008-photos-are-normalized-on-import.md", "docs/adr/0011-import-writes-files-first-and-never-deletes.md", "docs/adr/0012-native-units-for-numbers-normalized-values-for-colour.md", "docs/adr/0013-argon2id-parameters-are-tuned-per-consumer.md", "docs/adr/0014-forgotten-pin-resets-the-app-wrong-attempts-throttle.md", "docs/adr/0015-photo-metadata-is-stripped-on-normalize.md", "docs/adr/0016-the-node-tier-does-not-import-paraglide.md", "docs/adr/0017-the-journal-is-one-handle-bound-to-a-driver.md", "docs/adr/0019-the-landing-site-and-journal-use-separate-origins.md", "docs/adr/0020-encryption-is-whole-database-not-application-level.md", "docs/adr/0021-the-offline-shell-is-one-document-and-one-cache-per-release.md", "docs/adr/0022-the-public-version-name-comes-from-a-signed-tag.md", "docs/adr/0024-screens-read-vocabulary-reference-stays-internal.md", "docs/adr/0025-mood-gets-its-own-colour-scale.md", "docs/adr/0027-a-data-area-travels-because-it-registers-an-archive-section.md", "docs/adr/0028-the-launch-route-contract-is-pinned-by-one-shared-fixture.md", "docs/adr/0029-the-walkthrough-grips-handles-never-structure-or-wording.md", "docs/adr/0030-presets-rank-suggestion-lists-never-gate-them.md", "docs/adr/0031-a-clinician-summary-section-prints-because-it-registers.md", "docs/adr/0032-streak-reads-the-journaling-pause-the-run-out-rate-never-reads-a-dose-pause.md", "docs/adr/0033-onion-skin-alignment-is-a-post-capture-review-not-a-live-camera-surface.md", "docs/adr/0002-dual-identity-rowid-plus-travelling-uuid.md", "docs/adr/0034-a-video-note-records-through-a-live-camera-surface.md", "docs/adr/0035-the-pride-flag-is-a-home-only-motif-and-never-shows-under-disguise.md", "docs/adr/0036-feature-surfaces-live-in-a-more-hub-settings-holds-only-preferences.md", "docs/adr/0010-the-schema-does-not-store-derived-state.md", "docs/adr/0037-the-doubt-journal-becomes-a-read-only-counterevidence-check.md", "docs/adr/0038-cross-block-spacing-is-stamped-by-attribute-not-enumerated-by-class.md", "docs/adr/0039-home-gains-a-live-tile-area-gated-on-data-not-preference.md", "docs/adr/0040-the-counterevidence-check-becomes-safe-space-a-crisis-mode-dashboard.md", "docs/adr/0042-scheduled-archive-kdf-runs-behind-the-android-bridge.md", "docs/adr/0043-cycle-tracking-surfaces-only-through-a-testosterone-regimen-or-an-explicit-opt-in.md", "docs/adr/0044-entry-editor-contextual-writes-commit-in-one-transaction.md", "docs/adr/0045-an-automatic-trigger-never-mints-a-milestone-without-confirmation.md", "docs/adr/0046-stock-is-a-projection-not-a-stored-count.md", "docs/adr/0041-one-wrap-system-three-secret-sources-plus-no-secret-at-all.md", "docs/adr/0047-the-reminder-payload-is-wrapped-under-its-own-keystore-key.md", "docs/adr/0048-a-presentation-is-a-grouping-key-never-a-set-of-scales.md", "docs/adr/0049-an-era-is-a-named-span-and-owns-nothing-else.md", "docs/adr/0050-the-ambient-motion-budget-is-two-loops-on-home.md", "docs/adr/0051-the-flourish-is-dropped-and-the-ambient-budget-goes-back-to-one-loop.md", "docs/adr/0053-an-update-on-an-unknown-id-throws-a-delete-does-not.md", "docs/adr/0052-an-area-can-be-hidden-and-can-be-finished-and-the-two-are-separate.md", "docs/adr/0054-a-recovery-key-is-an-optional-second-wrap-of-the-data-key.md", "docs/adr/0057-an-entry-template-seeds-a-presentation-and-never-becomes-one.md", "docs/adr/0060-a-reference-band-is-keyed-to-the-passages-language-and-every-other-figure-is-explained-instead.md", "docs/adr/0061-a-benchmark-carries-its-capture-chain-and-device-sensitive-figures-compare-only-within-one.md", "docs/adr/0059-the-pitch-graph-may-carry-cited-reference-bands-nothing-else-may.md", "docs/adr/0058-chart-form-follows-whether-the-data-is-ordered.md", "docs/adr/0062-the-return-surface-is-a-moment-not-a-place-and-it-reports-what-is-waiting.md", "docs/adr/0056-the-stats-tab-is-an-index-and-emptiness-has-one-rule.md", "docs/adr/0063-a-platform-gate-hides-a-facility-never-a-record-the-person-created.md", "docs/adr/0064-a-wear-session-carries-a-kind-and-only-binding-gets-a-duration-cue.md", "docs/adr/0065-a-document-is-paper-the-person-keeps-and-the-app-never-reads-it.md", "docs/adr/0066-there-is-one-appointment-record-and-a-consult-is-a-case-of-it.md", "docs/adr/0067-what-is-coming-up-is-one-read-and-five-kinds-of-fact-earn-a-mark.md", "docs/adr/0068-a-roadmap-goal-is-a-step-not-a-record.md", "docs/adr/0069-a-long-log-grows-by-rendered-batches-and-search-stays-paged-by-its-control.md", "docs/adr/0023-the-android-floor-is-a-webview-version-not-an-api-level.md", "docs/adr/0070-progress-is-one-shared-component-cancel-answers-what-has-changed.md", "docs/adr/0071-the-mood-faces-are-the-second-ambient-loop-and-they-answer-the-finger.md", "docs/adr/0072-a-row-declares-which-screen-draws-it-and-the-hub-stops-being-flat.md", "docs/adr/0073-the-front-page-is-pinned-and-the-app-ranks-nothing-centrally.md", "docs/adr/0074-the-agenda-is-a-projection-of-one-week-and-it-never-counts-what-did-not-happen.md", "docs/adr/0075-colour-lives-in-a-field-and-in-blocks-and-nowhere-else.md", "docs/adr/0076-preferences-are-chrome-one-persistent-control-not-a-hub-row.md", "docs/adr/0077-moods-ramp-runs-between-two-hues-and-its-face-is-drawn-in-fills.md", "docs/adr/0078-a-state-change-moves-unless-its-ticket-says-why-not.md", "docs/adr/0079-setup-does-not-vary-by-disguise-and-offers-it-last.md", "docs/adr/0009-preferences-live-in-sqlite-with-a-small-boot-cache.md", "docs/adr/0081-a-body-region-is-one-value-on-one-scale.md", "docs/adr/0082-the-passage-and-the-vowel-answer-to-different-floors.md", "docs/adr/0083-a-distribution-over-a-continuous-axis-is-a-density-and-it-keeps-the-axis.md", "docs/adr/0085-a-photograph-is-browsed-in-one-library-and-owned-by-its-own-table.md", "docs/adr/0086-an-auto-logged-dose-is-a-standing-instruction-not-an-inference.md", "docs/adr/0084-a-reference-area-is-managed-in-settings-and-takes-no-hub-row.md", "docs/adr/0018-journal-data-is-encrypted-under-a-random-key.md", "docs/adr/0087-one-silhouette-and-neutrality-is-measured.md", "docs/adr/0088-the-launcher-icon-follows-the-chosen-flag.md", "docs/adr/0007-archive-is-a-framed-container-with-chunked-aes-gcm.md", "docs/adr/0089-the-android-driver-pipelines-bridge-calls-and-the-plugin-owns-order.md", "docs/adr/0090-lan-pairing-keeps-journal-keys-local.md", "docs/adr/0091-each-mood-step-picks-its-own-ink.md", "docs/adr/0092-an-explicit-feature-choice-beats-automatic-cycle-visibility.md", "docs/adr/0093-a-secondary-button-is-a-block-of-the-page.md", "CONTEXT.md", "SCREENS.md", "PRODUCT.md", "CLAUDE.md", ".scratch/phase-15/release-blockers/spec.md"].
Heavy commands: [{"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/m-c37937de9a97", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check:copy"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["node", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/13/probe-check.mjs"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check:copy"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "test:browser"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/m-c37937de9a97", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["node", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/13/probe-check.mjs"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check:copy"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["node", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/13/probe-check.mjs"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 1}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npx", "svelte-kit", "sync"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-815b2f16e16d", "wait_seconds": 0, "gate_off": null, "exit_code": 0}].
