# 11 - rel: Store listing assets in the repo

Status: ready-for-agent
Was: phase-14 pre-release 20 (moved 2026-10-05)
Type: build
Audit findings: R10
Severity: P2 (needed for Play and F-Droid; not for GitHub Release or Obtainium)
Blocked by: done/phase-14 pre-release 05 (done)
Blocked by note: done/phase-14 pre-release 05 (links). Ideally also old pre-release 14 to 19 so the screenshots show the fixed screens; those are now after-release 17, 16, 05, 27 and 28 (15 is done), so this is a preference, not a blocker.
Size: M
Size note: one to two days
Model: sonnet
UI: no. The app does not change; the screenshots are signed off by Alicja
like any render. No `/impeccable` pass.

## Problem

The repo has no `fastlane/metadata/android/*`. Play copy exists only in the
landing repo (`gender-diary-landing/content/play/{en,pl}.md`), and its
`assets.md` holds briefs, not screenshots or a feature graphic. F-Droid reads
fastlane metadata from the source repo; Play needs the same assets uploaded.

## What to build

- `fastlane/metadata/android/{en-US,pl-PL}/`: title, short and full
  description (from the landing repo's copy, humanized), changelogs for 1.0.0
  (from release-blockers 07's CHANGELOG section), icon, feature graphic, phone
  screenshots.
- Screenshots from the demo journal with every feature filled (the demo
  persona, never real data), default palette, light theme, at phone size: Home,
  a new entry, Journal, Care, Look back, Settings privacy section. A script
  under `scripts/` regenerates them; `scripts/feature-screen-shots.mjs` is the
  starting point.
- Show them to Alicja before committing.

## Acceptance

- [ ] fastlane metadata in English and Polish passes F-Droid's metadata lint
      (or `fastlane supply` validation if available offline).
- [ ] Screenshots regenerate from one script, from the demo persona only.
- [ ] Alicja signed off the screenshots and the feature graphic.

## Audit 2026-10-05

Reports: `.claude/audit-2026-10-05/report-rel.md`, `report-L10.md`.

- **REL-05 (P1 for Play and F-Droid).** Confirmed: no `fastlane/` directory, no
  1024x500 feature graphic, no phone screenshots;
  `brand/mark/png/*-tile-512.png` covers the 512 icon.
- **REL-14 (P3).** PWA icons are SVG only (`static/manifest.webmanifest`,
  `sizes: "any"`): no PNG 192/512, no maskable PNG, and no `apple-touch-icon`
  in `src/app.html`.
- **L10-09 (P3).** CAMERA and RECORD_AUDIO (`AndroidManifest.xml:672,681`) have
  no `<uses-feature android:required="false">`, so Play treats camera,
  autofocus and microphone as required and hides the app on devices without
  them; the comment at `:679-680` says the opposite.

New acceptance:

- [ ] PNG 192, 512 and maskable 512 in the web manifest (from
      `brand/mark/png/trans-*`), plus an apple-touch-icon.
- [ ] `uses-feature` for camera, camera.autofocus and microphone with
      `required="false"`; the comment corrected.
