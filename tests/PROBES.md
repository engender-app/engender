# The probes in tests/*.mjs

Every `.mjs` file directly under `tests/` is a guard, a gallery, or a helper
the other two import, plus `walkthrough.test.mjs`, which has its own npm
script and its own rules (ADR-0029). A probe written for one ticket's
sign-off does not stay by default. Either this file gets a line for it
before the ticket merges, or the probe is deleted before the merge.

The rule for keeping one, from phase 12 final-audit ticket 33: it guards
something a later ticket can break, or it proves a frame someone will look
at again. A probe that `src/` or a node test names as the source of a number
counts as the second kind, as long as it still runs. On 2026-09-23 that rule
sorted 201 files into 38 guards, 24 galleries and tools, 13 helpers and the
walkthrough, and 125 deletions. Deleted probes are still in history, and a
few kept files still name them as the source of a pattern:
`git log --all -- tests/<name>.mjs` finds the last version.

Most of these start their own Vite server or `vite preview`. Anything that
says "demo build" serves `build/`, which has to be a `VITE_DEMO=1` build.

## Guards

Pass/fail checks: each exits non-zero when what it holds stops being true.
CI's `guards` job runs both sets. To run one on its own, use
`node tests/<name>.mjs`, with the right build on disk first.

### `npm run test:guards` (dev server, no build)

| Probe | Holds |
| --- | --- |
| `blind-edge-padding-check` | a padding-only change to a field still moves `--blind-edge` |
| `dilation-schedule-action` | the dilation schedule's edit action, keyboard editor and its empty and deleted states |
| `letters-ready-jump` | the ready-letters count and the jump above the waiting list |
| `body-map-selected-context` | the figure and the cluster select one region, and each case gets an honest sentence |
| `body-map-figure-yank` | nothing on the body map's figure is painted at its destination first or in neither place |
| `chart-tick-readout` | what a chart's tick says under a mouse and a finger, across grains, languages and widths |
| `voice-task-names` | the voice task chooser's labels fit their segments in both languages |
| `record-dismissal-check` | a cancelled dismissal keeps unsaved record edits and the sheet's position |
| `recovery-key-departure-check` | every way off the recovery key screen asks before the key is lost |
| `photo-browse-compare` | browsing, selecting and wiping photos on a small library |
| `photo-grid-batching` | the grid stays whole batches deep at 3000 photos |
| `photo-export` | the export format and count are stated before anything is selected |
| `chosen-appointment` | the room's answers stay attached to the appointment they were given in |
| `document-reader` | document identity, the enlarged reader, owner links and export, at 195/390/1280px |
| `empty-reflection` | Safe space's empty and sparse states, and a comfort link above the fold at 320x568 |
| `hair-progress-photo-jump-check` | the hair progress jump reaches its photo and keeps its context |
| `hair-removal-recency-handoff-check` | the recency rows open their own area prefilled, and nothing saves before Save |
| `measurements-sizes-jump-check` | the Measurements/Sizes jump moves focus and keeps an open editor's input |
| `search-filter-scope` | search says what its filter covers and what a saved question holds |
| `mark-edge-fringe` | no pixel of the mark's corners is brighter than the ground, at every size |

### `npm run test:guards:built` (demo build, then a production build)

| Probe | Holds |
| --- | --- |
| `date-picker-check` | the calendar's targets are 48px, and it works by keyboard, at 200% and inside a sheet |
| `sheet-focus-check` | a sheet takes focus and gives it back, on appointment, lab and dose screens |
| `tryout-form-check` | what a screen reader is handed for the tryout form's fields |
| `media-transport-check` | both players' transports work by keyboard, speak their position, go full screen and run offline |
| `care-lane-labels` | three Care lanes' captions do not collide at 390px in Polish |
| `changes-methodology-check` | the changes screen's methodology disclosure and record action |
| `words-reading-scope-check` | the words reading's scope and baseline on stats, stats/words and settings/words |
| `radio-groups-gallery` | radio groups select by keyboard and the mood faces have full targets (a guard despite its name) |
| `roadmap-track-summary` | the selected track travels with the goal list it shows |
| `prep-context-check` | an empty prep list still shows the next visit and keeps every section |
| `debrief-offer-check` | the appointment debrief loop, end to end |
| `device-recovery-check` | recovery after real key loss, against a production build, where the first run is real |

### Written as a guard, not in CI yet

| Probe | Why not |
| --- | --- |
| `return-floor-check` (`npm run test:return-floor`) | Red on main. At 195px, the width 200% zoom leaves of a 390px phone, the English milestone subtitle "Its day was 4 September 2026." is wider than its row, and `.kit-row-sub` cannot break the word. Promote it once that is fixed. |

`browser-tier/run.mjs` also imports five probes (`care-read`,
`care-spine-links`, `read-failures`, `source-record-links`,
`timeline-fact-selection`), so they run in the browser job with
`npm run test:browser`. Three of them take `--gallery` as well.

## Galleries and tools

Screenshots, flipbooks and measurements a person reads. None of them fail a
build. Output goes to `.claude/` unless the script takes a directory.

### Component sheets, off a browser-tier fixture page (no build)

| Script | Shows |
| --- | --- |
| `gallery:kit` | the surface kit and the chart kit, every palette and both themes |
| `gallery:controls` | the control kit, every palette, plus reduced motion |
| `gallery:icons` | the navigation set and mood's faces at every size they ship |
| `gallery:mood` | mood's ramps and faces per preset (`VITE_DEMO=1 npm run build && node tests/mood-gallery.mjs --app` shoots the built app instead) |
| `gallery:tile-block` | the tile, one crop per shape per palette |
| `gallery:progress` | the progress bar and a strip of its indeterminate sweep |
| `gallery:day` | a day's records in its three shapes, every palette |
| `gallery:body-map` | the body map's figure in its four data states |

### Screens in every state they have (demo build)

| Script | Shows |
| --- | --- |
| `gallery:gates` | the five pre-unlock gates, the security module and the first run |
| `gallery:permissions` | every permission row state, including the Android-only ones a browser cannot reach |
| `gallery:dose-sheet` | the log-a-dose sheet |
| `gallery:documents` | the documents area, including a PDF page and one the renderer could not read |

### Motion (demo build)

| Script | Shows |
| --- | --- |
| `gallery:blind-motion` | the field as a blind, in depth - the yank sweep sends you here |
| `gallery:noticed-axis-motion` | the changes axis between frames, the numbers `NoticedAxis.svelte` cites |
| `gallery:return-motion` | the return moment's five movements |
| `gallery:restore` | setup's restore step and the welcome's new foot |
| `gallery:flipbook` | not a gallery: turns a directory of screencast frames into one JSON bundle for a review page |

### Sweeps and measurements (demo build)

The two yank sweeps and the hydration sweep belong to their own phase of
work and were kept here without being run by ticket 33. Every other entry
on this page ran green on 2026-09-23.

| Script | Measures |
| --- | --- |
| `sweep:yanks` | every navigation and state change, per frame, for teleports and vanishes (`--prove` injects three) |
| `sweep:yanks-device` | the same sweep on a phone over USB; see the file's header for the APK steps |
| `sweep:hydration` | every screen cold-mounted in both database profiles, for the pops the gesture sweep misses |
| `gallery:cohesion` | every route read against DIRECTION.md from the computed tree (`savebar-frame.test.ts` reads it) |
| `gallery:savebar` | what the save bar covers, per screen and viewport, in minutes rather than the cohesion sweep's 25 |
| `measure:setup-contrast` | every piece of type in setup against what is actually behind it (`--palettes`, `--themes`) |
| `cost:nav-motion` | the tab highlight's frame cadence at 4x CPU throttling, the number `app.css` and `motion-system.test.ts` cite |

## Helpers

Imported or read by the probes above, never run on their own:
`browser-harness` (Chromium launch, reporting, `settlePage`),
`probe-handshake`, `palettes`, `png-decode`, `pdf-fixture`, `photo-fixture`,
`prep-fixture`, `media-fixtures`, `fake-microphone`, `motion-sampling`,
`setup-flow`, `contrast-walk`, `yank-sweep-core`.
