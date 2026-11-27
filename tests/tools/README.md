# Manual test tools

Run these commands from the repository root. Use [the probe index](../PROBES.md) for CI guards and specialist checks.

## Galleries

| Tool | Command | Shows |
| --- | --- | --- |
| `gallery:kit` | `node tests/tools/kit-gallery.mjs` | The surface kit and the chart kit, every palette and both themes |
| `gallery:controls` | `node tests/tools/controls-gallery.mjs` | The control kit, every palette, plus reduced motion |
| `gallery:icons` | `node tests/tools/icon-gallery.mjs` | The navigation set and mood's faces at every size they ship |
| `gallery:mood` | `node tests/tools/mood-gallery.mjs` | Mood ramps and faces per preset. To capture the built app, run `VITE_DEMO=1 npm run build && node tests/tools/mood-gallery.mjs --app`. |
| `gallery:tile-block` | `node tests/tools/tile-block-gallery.mjs` | The tile, one crop per shape per palette |
| `gallery:progress` | `node tests/tools/progress-gallery.mjs` | The progress bar and a strip of its indeterminate sweep |
| `gallery:day` | `node tests/tools/day-gallery.mjs` | A day's records in its three shapes, every palette |
| `gallery:body-map` | `node tests/tools/body-map-gallery.mjs` | The body map's figure in its four data states |
| `gallery:gates` | `VITE_DEMO=1 npm run build && node tests/tools/gates-gallery.mjs` | The five pre-unlock gates, the security module and the first run |
| `gallery:journal-book-summary` | `VITE_DEMO=1 npm run build && node tests/tools/journal-book-summary-gallery.mjs --tag after` | Journal book summary crops |
| `gallery:permissions` | `VITE_DEMO=1 npm run build && node tests/tools/permissions-gallery.mjs` | Every permission row state, including the Android-only ones a browser cannot reach |
| `gallery:dose-sheet` | `VITE_DEMO=1 npm run build && node tests/tools/dose-sheet-gallery.mjs` | The log-a-dose sheet |
| `gallery:labs` | `node tests/guards/lab-entry-check.mjs --gallery` | Lab entry editor and import flows |
| `gallery:hair-removal` | `node tests/guards/hair-removal-entry-check.mjs --gallery` | New and saved hair-removal editors and saved-session continuation in English and Polish across palettes and themes, with 200% zoom and disguise |
| `gallery:dated-content` | `node tests/guards/content-before-dates-check.mjs --gallery` | Dated content screens |
| `gallery:appointments` | `node tests/guards/appointment-entry-check.mjs --gallery` | The appointment editor in English and Polish across all palettes and themes, including 200% zoom and disguise |
| `gallery:document-import` | `node tests/guards/document-import-check.mjs --gallery` | Document import flows |
| `gallery:documents` | `VITE_DEMO=1 npm run build && node tests/tools/documents-gallery.mjs` | The documents area, including a PDF page and one the renderer could not read |
| `gallery:savebar` | `VITE_DEMO=1 npm run build && node tests/tools/savebar-clearance-gallery.mjs --tag after` | What the save bar covers on each screen and viewport |
| `gallery:cohesion` | `VITE_DEMO=1 npm run build && node tests/tools/cohesion-sweep-gallery.mjs --prove && node tests/tools/cohesion-sweep-gallery.mjs --pin-android` | Computed layout, typography, touch targets and motion across routes |
| `gallery:blind-motion` | `VITE_DEMO=1 npm run build && node tests/tools/blind-motion-gallery.mjs` | The field as a blind, in depth - the yank sweep sends you here |
| `gallery:noticed-axis-motion` | `VITE_DEMO=1 npm run build && node tests/tools/noticed-axis-motion.mjs` | The changes axis between frames, the numbers `NoticedAxis.svelte` cites |
| `gallery:return-motion` | `VITE_DEMO=1 npm run build && node tests/tools/return-motion-gallery.mjs` | The return moment's five movements |
| `gallery:restore` | `VITE_DEMO=1 npm run build && node tests/tools/restore-gallery.mjs` | Setup's restore step and the welcome's new foot |
| `gallery:journal-month` | `VITE_DEMO=1 npm run build && node tests/tools/journal-month-gallery.mjs` | The Journal's open month. Add `--motion` to capture month changes, metric switches and the strip-to-grid transition. |
| `gallery:flipbook` | `node tests/tools/panel-motion-flipbook.mjs` | Convert screencast frames to a JSON flipbook |
| `gallery:tryouts` | `node tests/guards/tryout-save-check.mjs --gallery` | Tryout editors, saved details, and discard |
| `gallery:regimen` | `VITE_DEMO=1 npm run build && node tests/tools/regimen-editor-gallery.mjs` | Regimen editors |
| `gallery:letters` | `VITE_DEMO=1 npm run build && node tests/tools/letter-composition-gallery.mjs` | Letter composition and reading |

## Measurements

| Tool | Command | Shows |
| --- | --- | --- |
| `measure:journal-book` | `VITE_DEMO=1 npm run build && node tests/tools/journal-book-height.mjs` | Journal book height |
| `measure:journal-book-print` | `VITE_DEMO=1 npm run build && node tests/tools/journal-book-print-diff.mjs --tag after` | Printed journal output across builds |
| `measure:setup-contrast` | `VITE_DEMO=1 npm run build && node tests/tools/setup-contrast.mjs` | Every piece of type in setup against what is actually behind it (`--palettes`, `--themes`) |

## Frame sweeps

| Tool | Command | Shows |
| --- | --- | --- |
| `sweep:yanks` | `VITE_DEMO=1 npm run build && node tests/guards/yank-sweep.mjs --prove` | Every navigation and state change, per frame, for teleports and vanishes (`--prove` injects three) |
| `sweep:yanks-device` | `node tests/tools/yank-sweep-device.mjs <serial> --package dev.engender.app.test.<name> [apk]` | The yank sweep on a phone over USB. Accepts `--port` and `--reduced-motion`. |
| `sweep:hydration` | `VITE_DEMO=1 npm run build && node tests/tools/hydration-sweep.mjs --prove` | Every screen cold-mounted in both database profiles, for the pops the gesture sweep misses |

Build an isolated APK for device sweeps. See the header in [yank-sweep-device.mjs](yank-sweep-device.mjs) for setup.

## Field text

| Tool | Command | Shows |
| --- | --- | --- |
| `probe:field-text` | `VITE_DEMO=1 npm run build && node tests/tools/field-text-probe.mjs` | Field edges and visible text frame by frame |

Use `--only interrupted` for interrupted desktop scenes. Add `--frames` and use [field-text-edge-series.mjs](../field-text-edge-series.mjs) to read saved edge frames. For Android, pass `--device <serial>` and an isolated test package with `--package`.

## Navigation timing

| Tool | Command | Shows |
| --- | --- | --- |
| `cost:nav-motion` | `VITE_DEMO=1 npm run build && node tests/tools/nav-motion-cost.mjs` | The tab highlight's frame cadence at 4x CPU throttling, the number `app.css` and `motion-system.test.ts` cite |

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
