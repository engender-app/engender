# 07 - rel: The release workflow publishes, and there is a version to publish

Status: resolved
Status note: (reopened 2026-10-05: the workflow checks artifacts one step before it builds them, so every tag fails, L10-01)
Was: phase-14 pre-release 07 (moved 2026-10-05)
Type: build
Audit findings: R3, R4, R12
Severity: P1, blocks release
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: no. No `/impeccable` pass.

## Problems

**R3, Play before GitHub.** `.github/workflows/release.yml` runs "Upload App
Bundle to Google Play internal" (`status: completed`) before "Publish"
(`gh release create`). A new Play app needs its first AAB uploaded by hand and
accepts only draft releases, so the first tag will most likely fail at the Play
step and no signed APK reaches GitHub Releases or Obtainium.

**R4, no version.** The only tag is `alpha-2026-08-14`. `CHANGELOG.md`'s
"Unreleased" section still says "Phase 2 is in progress" with two items;
`ENGENDER_VERSION=1.0.0 node scripts/release-notes.mjs` prints "CHANGELOG.md
has no section for 1.0.0". `docs/progressive-release-record.json` says
`"releaseVersion": "2.2.0"`, which matches no tag. (The signing key itself is
Alicja's, pre-release-human 01.)

**R12.** `npm run check:progressive-release` fails 49 checks without
`--target`; `--target stage1` passes. It is not in CI.

## What to build

- Reorder release.yml: build, verify, package, publish the GitHub Release,
  then the Play step. Make the Play step run only when its secret exists, with
  `status: draft` until Alicja switches it (comment in the workflow says how).
  A failure there must not undo or block the GitHub Release.
- A CHANGELOG 1.0.0 section written for people, not for the repo: what the app
  does, the platforms, the four call-outs `release-notes.mjs` expects. Run it
  through the humanizer. Correct the release record's version and any stale
  stage claims (the hosted web build is an August dev build; see pre-release-human 06).
- `check-progressive-release.mjs` defaults to the highest stage the record
  claims, and runs in CI.
- Dry-run the whole path: `node scripts/cut-release-tag.mjs 1.0.0 --dry-run`
  and `release-notes.mjs` both succeed (the signed-tag requirement will fail
  until pre-release-human 01; say so in Comments).

## Acceptance

- [ ] release.yml publishes to GitHub before Play; the Play step is optional
      and draft-only.
- [ ] `release-notes.mjs` produces 1.0.0 notes; the record names 1.0.0.
- [ ] `check:progressive-release` passes by default and runs in CI.
- [ ] Dry runs recorded in Comments.

## Reopened 2026-10-05 (full audit)

The R3 reorder landed, but the release path has never run (`gh run list
--workflow release.yml` is empty) and it cannot succeed as written. The audit
calls it release-blocking (B7). Reports:
`.claude/audit-2026-10-05/report-L10.md`, `report-sec.md`.

- **L10-01 (P1).** `release.yml:117-118` runs `check-release-artifacts.mjs`
  before `package-release.mjs` (`:120-121`), which is what writes
  `engender-web-*.tar.gz`, `engender-src-*.tar.gz` and `SHA256SUMS`. Calling
  `releaseArtifactProblems()` on a directory with only the APK and AAB returns
  three "Missing" problems, so the job exits 1 on every tag. The check also
  needs `apksigner` on PATH (`:299-307`); the ubuntu-24.04 image keeps it under
  `$ANDROID_HOME/build-tools/<ver>/` (PLAUSIBLE).
- **L10-03 (P2).** The AAB check runs `jarsigner -verify` without `-strict`
  (`check-release-artifacts.mjs:313-318`). An unsigned test jar printed "jar is
  unsigned." with exit 0, so an unsigned AAB passes. The comment there claims
  the opposite.
- **L10-13 (P3).** `actions/checkout` keeps `persist-credentials: true` in a
  `contents: write` job (`release.yml:40`), so npm postinstall scripts and build
  plugins can read a write token; `${{ github.ref_name }}` is interpolated into
  a `run` script (`:134-135`); nothing checks that the tagged commit is on main.
- **SEC-09 (P3).** The step that holds `ANDROID_KEYSTORE_PASSWORD` runs `npm run
  build`, `npx cap sync` and Gradle (`release.yml:80-110`), so every build
  dependency can read the upload key's password. First-party actions are pinned
  by tag only.

What to build:

- Move the artifact check after packaging and before Publish; add the newest
  build-tools directory to `$GITHUB_PATH`.
- Fail the AAB check on "jar is unsigned" (or use `-strict` and accept only the
  known self-signed-chain warning); correct the comment.
- `persist-credentials: false`; pass the tag through `env:` and assert it equals
  `v$version`; add `git merge-base --is-ancestor HEAD origin/main`.
- Build the web bundle in a step or job without signing secrets, and sign in one
  that runs no npm. Pin the first-party actions by SHA.
- Dry-run the job (a throwaway tag in a fork, or a test keystore) and record the
  run.

Acceptance (added):

- [ ] A dry run of release.yml reaches Publish with every artifact present and
      verified; the run id is in Comments.
- [ ] An unsigned AAB fails the check (a test).
- [ ] No step that runs npm or Gradle plugins has the keystore password in its
      environment; checkout does not persist credentials.

## Comments

Orchestration report 2026-10-05T21:02:04.909484+00:00

Issue: phase-15/release-blockers/07. Model: sonnet. Result: success.
Started: 2026-10-05T20:41:57.033770+00:00. Finished: 2026-10-05T21:00:23.461534+00:00.
Merge: merged.  Merge commit: 48e6cf535be672f082ed7480f835bc29686e09f0.
Tests: ["Independent Standards and Spec reviews passed at82cf12df7cff20f88af1eb6cf7b1ef110cb66681. Integration refresh merged cleanly; the five ticket files have no semantic delta.", "66 targeted release tests passed after refreshing to585c4f54ae07c0e360fdeddbaa8778bbb05341d9; real JDK tests reject unsigned, appended-unsigned and tampered bundles and accept a self-signed bundle.", "6900 Node tests and typecheck with zero errors and warnings passed at6373d992; copy, licences, screen classes, progressive release and first-load budget passed.", "Local test-key run local-ticket07-20261005T205119Z built unsigned APK/AAB, signed through native tools, built the web archive twice with identical hashes, packaged web/source archives and checksums, and passed artifact verification. Publish arguments and five files were validated; publication was not executed.", "Native artifact verification passed again at82cf12df with unsigned-entry rejection. Earlier source archive and full rehearsal remain6373d992 evidence.", "Release tag dry-run passed against a disposable local origin and created no tag. Extracted workflow shell rejected wrong tag, shell-injection tag and a commit outside origin/main.", "Final combined build, check, Node and copy commands are required by the helper check-file and are recorded in its result."]. Integration checks: [["uv", "run", "--script", "/home/alice/_projekty/f5/f5-data-delivery/skills/engineering/orchestrate/scripts/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary", "--feature", "phase-15/release-blockers", "--loop", "build", "--", "npm", "run", "build"], ["uv", "run", "--script", "/home/alice/_projekty/f5/f5-data-delivery/skills/engineering/orchestrate/scripts/orchestrate.py", "heavy", "run", "--repo", "/home/alice/_projekty/priv/gender-diary", "--feature", "phase-15/release-blockers", "--loop", "check", "--", "npm", "run", "check"], ["npm", "test", "--", "--maxWorkers=2"], ["npm", "run", "check:copy"]].
Branch: orchestrate-agent/402e0d4f2f44/07. Shipped tip: 585c4f54ae07c0e360fdeddbaa8778bbb05341d9. Commits: 2d1cd51498967233f87d058773cadbe4bec912f2, 2c6f500e10fa3ca167331d3fc5327b1429aac765, 69b961dbe92ac23276fd887871e6f0cdbd8a72bd, ad3ee57c26b54d3d0dc29d187dcfdf2c944ed977, 6f42b639dbf3204444ee9348a30085124a441d70, c3817107f44bcd7c5d99963ad23748e8717e45f3, 69c0444fd1712c1929e14fd94edc8819fe0fac2e, a6f6bfedf1ff363220fc0c5a5a110a328fdcc425, ee3b33292b3c263fb76d4ad1a18463ce45617ca7, fec0e3929aa99f51b4c4e03670e83e7bd023814d, b66d264156f45fd625aa0afcdd743d20c503996e, 46490c14317fe661910f2fd9b0d87ea4e3518faa, c2046f19748716e247c1a866b3a7cbfe558d0516, 4e76391d4da3dc7ebf8475de9dc688aeeb093b20, dcd224700a50e72775c89a3250559aa961491185, b470fb7b91df6e1df4695ba235d65cbbd87ddd16, ebe8155054fa2fbbfd1ded6b2cd3d8b06c72d72f, 6373d99217e931a241f3d6609c0bb42515f40fb1, a9f4bc784f4b7e05277b189862821f6519634488, d3ca6a1f39abf17af35245ca31af021d737286c6, db65059c72218f8113a4a7e0ebad209a4cdf5b74, e4facaffea9b2a48f25b494b9c5524eafaf75bb2, 3e14b41d1c507e4ab5a084ea7dc22a552d30ff2b, 82cf12df7cff20f88af1eb6cf7b1ef110cb66681, 585c4f54ae07c0e360fdeddbaa8778bbb05341d9.
Unblocked: none. Proposals: [].
Copied inputs: ["docs/agents/domain.md", "docs/agents/triage-labels.md", "docs/agents/verification.md", "docs/agents/issue-tracker.md", "docs/agents/platform.md", "docs/adr/0026-known-analyte-unit-conversion-is-a-narrow-allowlisted-exception.md", "docs/adr/0001-epoch-day-is-the-local-calendar-day.md", "docs/adr/0003-preferences-split-portable-and-device-local.md", "docs/adr/0004-reference-data-mirrored-entry-data-async.md", "docs/adr/0005-search-folds-text-in-the-app-not-in-the-tokenizer.md", "docs/adr/0006-forward-only-migrations-with-a-pre-migration-copy.md", "docs/adr/0008-photos-are-normalized-on-import.md", "docs/adr/0011-import-writes-files-first-and-never-deletes.md", "docs/adr/0012-native-units-for-numbers-normalized-values-for-colour.md", "docs/adr/0013-argon2id-parameters-are-tuned-per-consumer.md", "docs/adr/0014-forgotten-pin-resets-the-app-wrong-attempts-throttle.md", "docs/adr/0015-photo-metadata-is-stripped-on-normalize.md", "docs/adr/0016-the-node-tier-does-not-import-paraglide.md", "docs/adr/0017-the-journal-is-one-handle-bound-to-a-driver.md", "docs/adr/0019-the-landing-site-and-journal-use-separate-origins.md", "docs/adr/0020-encryption-is-whole-database-not-application-level.md", "docs/adr/0021-the-offline-shell-is-one-document-and-one-cache-per-release.md", "docs/adr/0022-the-public-version-name-comes-from-a-signed-tag.md", "docs/adr/0024-screens-read-vocabulary-reference-stays-internal.md", "docs/adr/0025-mood-gets-its-own-colour-scale.md", "docs/adr/0027-a-data-area-travels-because-it-registers-an-archive-section.md", "docs/adr/0028-the-launch-route-contract-is-pinned-by-one-shared-fixture.md", "docs/adr/0029-the-walkthrough-grips-handles-never-structure-or-wording.md", "docs/adr/0030-presets-rank-suggestion-lists-never-gate-them.md", "docs/adr/0031-a-clinician-summary-section-prints-because-it-registers.md", "docs/adr/0032-streak-reads-the-journaling-pause-the-run-out-rate-never-reads-a-dose-pause.md", "docs/adr/0033-onion-skin-alignment-is-a-post-capture-review-not-a-live-camera-surface.md", "docs/adr/0002-dual-identity-rowid-plus-travelling-uuid.md", "docs/adr/0034-a-video-note-records-through-a-live-camera-surface.md", "docs/adr/0035-the-pride-flag-is-a-home-only-motif-and-never-shows-under-disguise.md", "docs/adr/0036-feature-surfaces-live-in-a-more-hub-settings-holds-only-preferences.md", "docs/adr/0010-the-schema-does-not-store-derived-state.md", "docs/adr/0037-the-doubt-journal-becomes-a-read-only-counterevidence-check.md", "docs/adr/0038-cross-block-spacing-is-stamped-by-attribute-not-enumerated-by-class.md", "docs/adr/0039-home-gains-a-live-tile-area-gated-on-data-not-preference.md", "docs/adr/0040-the-counterevidence-check-becomes-safe-space-a-crisis-mode-dashboard.md", "docs/adr/0042-scheduled-archive-kdf-runs-behind-the-android-bridge.md", "docs/adr/0043-cycle-tracking-surfaces-only-through-a-testosterone-regimen-or-an-explicit-opt-in.md", "docs/adr/0044-entry-editor-contextual-writes-commit-in-one-transaction.md", "docs/adr/0045-an-automatic-trigger-never-mints-a-milestone-without-confirmation.md", "docs/adr/0046-stock-is-a-projection-not-a-stored-count.md", "docs/adr/0041-one-wrap-system-three-secret-sources-plus-no-secret-at-all.md", "docs/adr/0047-the-reminder-payload-is-wrapped-under-its-own-keystore-key.md", "docs/adr/0048-a-presentation-is-a-grouping-key-never-a-set-of-scales.md", "docs/adr/0049-an-era-is-a-named-span-and-owns-nothing-else.md", "docs/adr/0050-the-ambient-motion-budget-is-two-loops-on-home.md", "docs/adr/0051-the-flourish-is-dropped-and-the-ambient-budget-goes-back-to-one-loop.md", "docs/adr/0053-an-update-on-an-unknown-id-throws-a-delete-does-not.md", "docs/adr/0052-an-area-can-be-hidden-and-can-be-finished-and-the-two-are-separate.md", "docs/adr/0054-a-recovery-key-is-an-optional-second-wrap-of-the-data-key.md", "docs/adr/0057-an-entry-template-seeds-a-presentation-and-never-becomes-one.md", "docs/adr/0060-a-reference-band-is-keyed-to-the-passages-language-and-every-other-figure-is-explained-instead.md", "docs/adr/0061-a-benchmark-carries-its-capture-chain-and-device-sensitive-figures-compare-only-within-one.md", "docs/adr/0059-the-pitch-graph-may-carry-cited-reference-bands-nothing-else-may.md", "docs/adr/0058-chart-form-follows-whether-the-data-is-ordered.md", "docs/adr/0062-the-return-surface-is-a-moment-not-a-place-and-it-reports-what-is-waiting.md", "docs/adr/0056-the-stats-tab-is-an-index-and-emptiness-has-one-rule.md", "docs/adr/0063-a-platform-gate-hides-a-facility-never-a-record-the-person-created.md", "docs/adr/0064-a-wear-session-carries-a-kind-and-only-binding-gets-a-duration-cue.md", "docs/adr/0065-a-document-is-paper-the-person-keeps-and-the-app-never-reads-it.md", "docs/adr/0066-there-is-one-appointment-record-and-a-consult-is-a-case-of-it.md", "docs/adr/0067-what-is-coming-up-is-one-read-and-five-kinds-of-fact-earn-a-mark.md", "docs/adr/0068-a-roadmap-goal-is-a-step-not-a-record.md", "docs/adr/0069-a-long-log-grows-by-rendered-batches-and-search-stays-paged-by-its-control.md", "docs/adr/0023-the-android-floor-is-a-webview-version-not-an-api-level.md", "docs/adr/0070-progress-is-one-shared-component-cancel-answers-what-has-changed.md", "docs/adr/0071-the-mood-faces-are-the-second-ambient-loop-and-they-answer-the-finger.md", "docs/adr/0072-a-row-declares-which-screen-draws-it-and-the-hub-stops-being-flat.md", "docs/adr/0073-the-front-page-is-pinned-and-the-app-ranks-nothing-centrally.md", "docs/adr/0074-the-agenda-is-a-projection-of-one-week-and-it-never-counts-what-did-not-happen.md", "docs/adr/0075-colour-lives-in-a-field-and-in-blocks-and-nowhere-else.md", "docs/adr/0076-preferences-are-chrome-one-persistent-control-not-a-hub-row.md", "docs/adr/0077-moods-ramp-runs-between-two-hues-and-its-face-is-drawn-in-fills.md", "docs/adr/0078-a-state-change-moves-unless-its-ticket-says-why-not.md", "docs/adr/0079-setup-does-not-vary-by-disguise-and-offers-it-last.md", "docs/adr/0009-preferences-live-in-sqlite-with-a-small-boot-cache.md", "docs/adr/0081-a-body-region-is-one-value-on-one-scale.md", "docs/adr/0082-the-passage-and-the-vowel-answer-to-different-floors.md", "docs/adr/0083-a-distribution-over-a-continuous-axis-is-a-density-and-it-keeps-the-axis.md", "docs/adr/0085-a-photograph-is-browsed-in-one-library-and-owned-by-its-own-table.md", "docs/adr/0086-an-auto-logged-dose-is-a-standing-instruction-not-an-inference.md", "docs/adr/0084-a-reference-area-is-managed-in-settings-and-takes-no-hub-row.md", "docs/adr/0018-journal-data-is-encrypted-under-a-random-key.md", "docs/adr/0087-one-silhouette-and-neutrality-is-measured.md", "docs/adr/0088-the-launcher-icon-follows-the-chosen-flag.md", "docs/adr/0007-archive-is-a-framed-container-with-chunked-aes-gcm.md", "docs/adr/0089-the-android-driver-pipelines-bridge-calls-and-the-plugin-owns-order.md", "docs/adr/0090-lan-pairing-keeps-journal-keys-local.md", "docs/adr/0091-each-mood-step-picks-its-own-ink.md", "docs/adr/0092-an-explicit-feature-choice-beats-automatic-cycle-visibility.md", "docs/adr/0093-a-secondary-button-is-a-block-of-the-page.md", "CONTEXT.md", "SCREENS.md", "PRODUCT.md", "CLAUDE.md", ".scratch/phase-15/release-blockers/spec.md"].
Heavy commands: [{"command": ["python3", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/07/rehearse.py", "package"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-402e0d4f2f44", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/m-5126e8378a63", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "check"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-402e0d4f2f44", "wait_seconds": 38.1254440599987, "gate_off": null, "exit_code": 0}, {"command": ["python3", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/07/rehearse.py", "unsigned"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-402e0d4f2f44", "wait_seconds": 2.0084784120008408, "gate_off": null, "exit_code": 0}, {"command": ["python3", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/07/rehearse.py", "sign"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-402e0d4f2f44", "wait_seconds": 46.03989935400023, "gate_off": null, "exit_code": 0}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/m-5126e8378a63", "wait_seconds": 0, "gate_off": null, "exit_code": 0}, {"command": ["python3", "/home/alice/_projekty/priv/gender-diary/.claude/phase-15-ui-delivery/nonui/07/rehearse.py", "package"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-402e0d4f2f44", "wait_seconds": 14.014903720999428, "gate_off": null, "exit_code": -15}, {"command": ["npm", "run", "build"], "worktree": "/home/alice/_projekty/priv/gender-diary/.claude/worktrees/o-402e0d4f2f44", "wait_seconds": 0, "gate_off": null, "exit_code": 0}].
