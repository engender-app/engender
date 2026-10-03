# 07 - rel: The release workflow publishes, and there is a version to publish

Status: ready-for-agent
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
Alicja's, human step 17.)

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
  stage claims (the hosted web build is an August dev build; see human step 03).
- `check-progressive-release.mjs` defaults to the highest stage the record
  claims, and runs in CI.
- Dry-run the whole path: `node scripts/cut-release-tag.mjs 1.0.0 --dry-run`
  and `release-notes.mjs` both succeed (the signed-tag requirement will fail
  until step 17; say so in Comments).

## Acceptance

- [ ] release.yml publishes to GitHub before Play; the Play step is optional
      and draft-only.
- [ ] `release-notes.mjs` produces 1.0.0 notes; the record names 1.0.0.
- [ ] `check:progressive-release` passes by default and runs in CI.
- [ ] Dry runs recorded in Comments.
