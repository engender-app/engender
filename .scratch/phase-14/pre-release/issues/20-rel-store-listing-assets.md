# 20 - rel: Store listing assets in the repo

Status: ready-for-agent
Type: build
Audit findings: R10
Severity: P2 (needed for Play and F-Droid; not for GitHub Release or Obtainium)
Blocked by: 05
Blocked by note: 05 (links), and ideally 14 to 19 so the screenshots show the fixed screens
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
  (from ticket 07's CHANGELOG section), icon, feature graphic, phone
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
