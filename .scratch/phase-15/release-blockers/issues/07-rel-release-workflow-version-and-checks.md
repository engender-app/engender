# 07 - rel: The release workflow publishes, and there is a version to publish

Status: ready-for-agent
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
