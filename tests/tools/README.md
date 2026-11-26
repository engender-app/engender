# Manual test tools

Run these commands from the repository root. Use [the probe index](../PROBES.md) for CI guards and specialist checks.

## Galleries

| Tool | Command | Shows |
| --- | --- | --- |
| `gallery:kit` | `node tests/kit-gallery.mjs` | The surface kit and the chart kit, every palette and both themes |
| `gallery:controls` | `node tests/controls-gallery.mjs` | The control kit, every palette, plus reduced motion |
| `gallery:icons` | `node tests/icon-gallery.mjs` | The navigation set and mood's faces at every size they ship |
| `gallery:mood` | `node tests/mood-gallery.mjs` | Mood ramps and faces per preset. To capture the built app, run `VITE_DEMO=1 npm run build && node tests/mood-gallery.mjs --app`. |
| `gallery:tile-block` | `node tests/tile-block-gallery.mjs` | The tile, one crop per shape per palette |
| `gallery:progress` | `node tests/progress-gallery.mjs` | The progress bar and a strip of its indeterminate sweep |
| `gallery:day` | `node tests/day-gallery.mjs` | A day's records in its three shapes, every palette |
| `gallery:body-map` | `node tests/body-map-gallery.mjs` | The body map's figure in its four data states |
| `gallery:gates` | `VITE_DEMO=1 npm run build && node tests/gates-gallery.mjs` | The five pre-unlock gates, the security module and the first run |
| `gallery:journal-book-summary` | `VITE_DEMO=1 npm run build && node tests/journal-book-summary-gallery.mjs --tag after` | Journal book summary crops |
| `gallery:permissions` | `VITE_DEMO=1 npm run build && node tests/permissions-gallery.mjs` | Every permission row state, including the Android-only ones a browser cannot reach |
| `gallery:dose-sheet` | `VITE_DEMO=1 npm run build && node tests/dose-sheet-gallery.mjs` | The log-a-dose sheet |
| `gallery:labs` | `node tests/lab-entry-check.mjs --gallery` | Lab entry editor and import flows |
| `gallery:hair-removal` | `node tests/hair-removal-entry-check.mjs --gallery` | New and saved hair-removal editors and saved-session continuation in English and Polish across palettes and themes, with 200% zoom and disguise |
| `gallery:dated-content` | `node tests/content-before-dates-check.mjs --gallery` | Dated content screens |
| `gallery:appointments` | `node tests/appointment-entry-check.mjs --gallery` | The appointment editor in English and Polish across all palettes and themes, including 200% zoom and disguise |
| `gallery:document-import` | `node tests/document-import-check.mjs --gallery` | Document import flows |
| `gallery:documents` | `VITE_DEMO=1 npm run build && node tests/documents-gallery.mjs` | The documents area, including a PDF page and one the renderer could not read |
| `gallery:savebar` | `VITE_DEMO=1 npm run build && node tests/savebar-clearance-gallery.mjs --tag after` | What the save bar covers on each screen and viewport |
| `gallery:cohesion` | `VITE_DEMO=1 npm run build && node tests/cohesion-sweep-gallery.mjs --prove && node tests/cohesion-sweep-gallery.mjs --pin-android` | Computed layout, typography, touch targets and motion across routes |
| `gallery:blind-motion` | `VITE_DEMO=1 npm run build && node tests/blind-motion-gallery.mjs` | The field as a blind, in depth - the yank sweep sends you here |
| `gallery:noticed-axis-motion` | `VITE_DEMO=1 npm run build && node tests/noticed-axis-motion.mjs` | The changes axis between frames, the numbers `NoticedAxis.svelte` cites |
| `gallery:return-motion` | `VITE_DEMO=1 npm run build && node tests/return-motion-gallery.mjs` | The return moment's five movements |
| `gallery:restore` | `VITE_DEMO=1 npm run build && node tests/restore-gallery.mjs` | Setup's restore step and the welcome's new foot |
| `gallery:journal-month` | `VITE_DEMO=1 npm run build && node tests/journal-month-gallery.mjs` | The Journal's open month. Add `--motion` to capture month changes, metric switches and the strip-to-grid transition. |
| `gallery:flipbook` | `node tests/panel-motion-flipbook.mjs` | Convert screencast frames to a JSON flipbook |
| `gallery:tryouts` | `node tests/tryout-save-check.mjs --gallery` | Tryout editors, saved details, and discard |
| `gallery:regimen` | `VITE_DEMO=1 npm run build && node tests/regimen-editor-gallery.mjs` | Regimen editors |
| `gallery:letters` | `VITE_DEMO=1 npm run build && node tests/letter-composition-gallery.mjs` | Letter composition and reading |

## Measurements

| Tool | Command | Shows |
| --- | --- | --- |
| `measure:journal-book` | `VITE_DEMO=1 npm run build && node tests/journal-book-height.mjs` | Journal book height |
| `measure:journal-book-print` | `VITE_DEMO=1 npm run build && node tests/journal-book-print-diff.mjs --tag after` | Printed journal output across builds |
| `measure:setup-contrast` | `VITE_DEMO=1 npm run build && node tests/setup-contrast.mjs` | Every piece of type in setup against what is actually behind it (`--palettes`, `--themes`) |

## Frame sweeps

| Tool | Command | Shows |
| --- | --- | --- |
| `sweep:yanks` | `VITE_DEMO=1 npm run build && node tests/yank-sweep.mjs --prove` | Every navigation and state change, per frame, for teleports and vanishes (`--prove` injects three) |
| `sweep:yanks-device` | `node tests/yank-sweep-device.mjs <serial> --package dev.engender.app.test.<name> [apk]` | The yank sweep on a phone over USB. Accepts `--port` and `--reduced-motion`. |
| `sweep:hydration` | `VITE_DEMO=1 npm run build && node tests/hydration-sweep.mjs --prove` | Every screen cold-mounted in both database profiles, for the pops the gesture sweep misses |

Build an isolated APK for device sweeps. See the header in [yank-sweep-device.mjs](../yank-sweep-device.mjs) for setup.

## Field text

| Tool | Command | Shows |
| --- | --- | --- |
| `probe:field-text` | `VITE_DEMO=1 npm run build && node tests/field-text-probe.mjs` | Field edges and visible text frame by frame |

Use `--only interrupted` for interrupted desktop scenes. Add `--frames` and use [field-text-edge-series.mjs](../field-text-edge-series.mjs) to read saved edge frames. For Android, pass `--device <serial>` and an isolated test package with `--package`.

## Navigation timing

| Tool | Command | Shows |
| --- | --- | --- |
| `cost:nav-motion` | `VITE_DEMO=1 npm run build && node tests/nav-motion-cost.mjs` | The tab highlight's frame cadence at 4x CPU throttling, the number `app.css` and `motion-system.test.ts` cite |

## Android probes

Use a disposable emulator and prepare the APK and journal fixture described in each probe.

| Probe | Command |
| --- | --- |
| [Disguise during setup](../android-tier/disguise-setup-probe.mjs) | `npm run test:android:disguise-setup -- <emulator-serial> [apk]` |
| [Backup power cut](../android-tier/backup-power-cut.mjs) | `npm run test:android:backup-power-cut` |
| [Back at the lock gate](../android-tier/lock-gate-back.mjs) | `npm run test:android:lock-gate-back -- <serial> <isolated-package> pin\|key <output.json>` |
| [Renderer recovery](../android-tier/renderer-recovery.mjs) | `npm run test:android:renderer-recovery` |

For backup power-cut tests, set `BACKUP_POWER_CUT_AVD` and
`BACKUP_POWER_CUT_PACKAGE`, then run `ulimit -c 0` in the same shell.
For renderer recovery, set `RENDERER_RECOVERY_SERIAL`,
`RENDERER_RECOVERY_PACKAGE` and `RENDERER_RECOVERY_OUTPUT`.
