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
says "demo build" serves `build/`, which has to be a `VITE_DEMO=1` build. A
probe that takes `--root <built tree>` starts its preview through
`previewBuild` in browser-harness.mjs, which changes into that tree first:
SvelteKit's preview reads the built server from the working directory, so a
`--root` alone used to serve the checkout the probe was started in (ticket
226).

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
| `letter-composition-check` | letter dismissal, Back and navigation preserve text/date; validation, rejected and delayed storage, retry, single write, reading, lock uses real routes |
| `recovery-key-departure-check` | every way off the recovery key screen asks before the key is lost |
| `photo-browse-compare` | browsing, selecting and wiping photos on a small library |
| `photo-grid-batching` | the grid stays whole batches deep at 3000 photos |
| `photo-export` | the export format and count are stated before anything is selected |
| `chosen-appointment` | the room's answers stay attached to the appointment they were given in |
| `appointment-entry-check` | appointment field order, saved values, suggestions, surgery links, draft dismissal, calendar handoff and deletion; English and Polish at 390px and 200% zoom |
| `content-before-dates-check` | milestone, side-effect, cycle and hair-stage field order, saved edits, photo and anchor retention, preparation handoff, cycle visibility and shared editor safety; English and Polish at 390px and 200% zoom |
| `document-reader` | document identity, the enlarged reader, owner links and export, at 195/390/1280px |
| `empty-reflection` | Safe space's empty and sparse states, and a comfort link above the fold at 320x568 |
| `hair-progress-photo-jump-check` | the hair progress jump reaches its photo and keeps its context |
| `hair-removal-entry-check` | session field order, failed save and retry, duplicate taps, saved-owner photo continuation, library day, editing, deletion and privacy; English and Polish at 390px and 200% zoom |
| `hair-removal-recency-handoff-check` | the recency rows open their own area prefilled, and nothing saves before Save |
| `measurements-sizes-jump-check` | the Measurements/Sizes jump moves focus and keeps an open editor's input |
| `roadmap-tick-motion-check` | ticking a roadmap step animates the box's fill, the tick and the strike rather than cutting them in |
| `search-filter-scope` | search says what its filter covers and what a saved question holds |
| `mark-edge-fringe` | no pixel of the mark's corners is brighter than the ground, at every size |
| `getting-started-cross-check` | Home's Getting started rows cross when done, frame by frame, and are static on a cold arrival |
| `noticed-effects-picker-check` | the entry editor's effects sheet follows the regimen, searches and takes several, and no row appears or leaves in one frame |
| `breathing-frames` | Safe space's breathing tide: nothing jumps, pops in or goes backwards across a cycle, pause, resume, a mid-breath reduced-motion switch and a trip to the background, and the Polish hold word fits the vessel |

### `npm run test:guards:built` (demo build, then a production build)

| Probe | Holds |
| --- | --- |
| `date-picker-check` | the date picker's day targets are 48px and own their edges; arrows, PageUp/PageDown, Shift and Enter work; typed entry refuses a day the calendar lacks; the arrows and the month drum turn months; Escape closes the drum before the picker and the picker before its sheet, at 320-430px, 200% text and 200% pinch |
| `date-picker-motion --themes light --gate` (pickers ticket 01) | the date picker opens, closes, turns a month by arrow, finger and trackpad, springs back, stretches at a bound, jumps to Today and through the month drum without a yank in any sampled frame, and a swipe past the threshold turns the month while a short one and one past a bound do not; `--out <dir>` keeps the frames for a flipbook |
| `time-picker-check --themes light --gate` (pickers ticket 02) | the time picker opens on the stored time, steps by arrow, brings a tapped row to the band, rests a flick on a whole row, turns both drums to a typed time, refuses a time that is not one, commits on Use time, leaves the value on Escape and gives focus back, offers Clear only on an optional field, and a downward swipe on a drum at 00 does not move the sheet; no drum moves its whole five-row window in one frame and the surface never arrives or leaves in one; `--out <dir>` keeps the frames for a flipbook |
| `sheet-focus-check` | a sheet takes focus and gives it back, on appointment, lab and dose screens |
| `no-auto-keyboard` | no screen, the new-entry editor and search included, arrives with a text field focused, so a phone never opens with the keyboard up |
| `sheet-navigation-leftover-check` | a sheet clears within 200ms of navigating away by tab bar or link, none left in the DOM, and Escape right after doesn't act on the departed one |
| `sheet-handoff-scroll-check` | a sheet raised by another's close keeps the shell inert while it is up, and the editor still scrolls once both close |
| `sheet-touch-drag-check` | a finger dragging a sheet down from its handle or body moves it with the finger and a long swipe dismisses it (real CDP touch, where `touch-action` applies) |
| `yank-sweep --scenes doses-sheet,surgery-sheet,regimen-add,settings-about,letters-compose,eras-add --gate` (ticket 244) | an ordinary sheet's rise and scrim fade actually play rather than teleporting open/shut in one frame - `--gate` exits non-zero on any style yank; render findings don't gate (tickets 149/231/152's scrim-blur-fade-in false positive) |
| `tryout-form-check` | what a screen reader is handed for the tryout form's fields |
| `media-transport-check` | both players' transports work by keyboard, speak their position, go full screen and run offline |
| `care-lane-labels` | three Care lanes' captions do not collide at 390px in Polish |
| `care-cold-load-yank` | Care's cold load at 1x and 4x CPU: no rail caption steps sideways, nothing below the care read paints before the rail, what it answers with fades in, and the nav pill never paints wider than its tab |
| `wear-tile-close-yank` | stopping the Home wear-timer tile collapses its own tier's row rather than snapping the agenda up under a still-visible ghost, even when an unrelated fold promotion lands the same tick |
| `day-cold-load-yank` | The day view's cold load at 4x CPU: margin notes and dose drug names land with the day's records, never after |
| `tally-chip-row-yank` | Tally's presentation chip row on a cold load: chips land with (or before) the chart, never after |
| `changes-methodology-check` | the changes screen's methodology disclosure and record action |
| `words-reading-scope-check` | the words reading's scope and baseline on stats, stats/words and settings/words |
| `entry-pending-save` | delayed encrypted attachment writes freeze every entry field, block duplicate saves and departure, retain drafts on failure, and allow correction and retry in English and Polish |
| `radio-groups-gallery` | radio groups select by keyboard and the mood faces have full targets (a guard despite its name) |
| `roadmap-track-summary` | the selected track travels with the goal list it shows |
| `prep-context-check` | an empty prep list still shows the next visit and keeps every section |
| `debrief-offer-check` | the appointment debrief loop, end to end |
| `home-fold-reserve` | nothing under Home's reserves moves in one frame on a cold open, with a right, wrong or missing guess, or when a notice inside one is dismissed |
| `cold-screen-moves` | no top-level block steps in one frame after a cold open's first paint, on the sixteen screens where one did (a heading-led ReadGate's margin, a late block cut in); `--routes` sweeps any others |
| `screen-part-last-row` | a row arriving or leaving last in a screen part, on `disclose`'s first frame, moves nothing and leaves the row before it its own margin |
| `more-search-nothing-found` | typed past its last area or record match, More's search collapses the last card and the "nothing found" notice arrives clipped, with nothing painted vanishing or jumping (a box clipped whole or transparent in both frames of a step is not counted, ticket 224) |
| `documents-rows-settle` | the documents list's first group never changes height after it paints on a cold load (row link lines and the size line land with the list), at 4x CPU |
| `tile-arrival-timing` | Today's and Look back's tiles land within 250ms of a warm tab switch and 300ms of a cold shell, and a revisit paints them in its first frame with no placeholder and nothing moving, on the web tier (the Android bridge is ADR-0089's device record, not this) |
| `home-idle-raster` | Home at idle rasters nothing beyond a timer's tick, and wakes the main thread only while a mood face moves: the flag sun's breath runs on the compositor, and the faces pause their loops between moves |
| `boot-error-alone` | a boot that fails on an unreadable journal shows its notice and nothing a booted app draws, and Today leaves by crossfade rather than a cut; a refused SQLite wasm and a worker served without COEP reach the same notice; a normal boot, and one at 6x CPU, still reach Today |
| `restore-previous-journal` | after a migration fails past its copy, the failure screen offers the journal from before the update and restoring it boots, on the web (a control retry of the stamped live file must fail); an interrupted restore finishes by itself on the next boot; "Try opening again" pressed the frame it appears boots like a slow retry, 5 of 5 |
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

### Screen editors (dev server, no build)

| Script | Shows |
| --- | --- |
| `gallery:hair-removal` | new and saved hair-removal editors and saved-session continuation in English and Polish across palettes and themes, with 200% zoom and disguise |
| `gallery:appointments` | the appointment editor in English and Polish across all palettes and themes, including 200% zoom and disguise |

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
| `gallery:journal-month` | the Journal's open month; `--motion` records month change, metric switch and strip to grid, with a per-frame yank count per scene |
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
| `probe:field-text` | (ticket 285) nothing on a field paints past its painted edge or teleports against it, on every frame of every change that moves a field: doors both ways from top, middle and bottom, interrupted and reversed, deep push and back, gear, Polish, reduced motion, resize, setup's steps and handover, and the door field's height on a cold load, at 390 and 1440; `--only`, `--runs`, `--report`, `--frames`, `--json`, and `--device <serial>` to drive the Pixel WebView over its own forwarded port (`--port`, default 9341, `--package`, default the separate probe build and never the real app, `--rate` to slow the animations for reading the edge on pixels (`field-text-edge-series.mjs` reads the frames); the PIN gate opening is a scene there). Timing-dependent: run it several times |
| `tab-bar-withdraw-crossfade` | the floating bar's withdrawal crossfade across three sheet scenes, per frame, for blur snaps and dropouts (ticket 232) |

## Helpers

Imported or read by the probes above, never run on their own:
`browser-harness` (Chromium launch, reporting, `settlePage`),
`probe-handshake`, `palettes`, `png-decode`, `pdf-fixture`, `photo-fixture`,
`prep-fixture`, `media-fixtures`, `fake-microphone`, `motion-sampling`,
`setup-flow`, `contrast-walk`, `yank-sweep-core`, `field-text-core`, `field-text-edge-series`.

`letter-composition-gallery` captures composition and discard across all palettes, both themes, English/Polish, compact widths and 200% zoom. It needs a demo build. `android-tier/letter-composition.mjs` checks native Back and drag on a disposable emulator.

`tryout-save-check` checks label guidance, retained drafts, pending writes, discard, saved outcomes, navigation retry and photo ownership against real tryout routes. `gallery:tryouts` also captures saved details and discard controls across every palette, both themes, English and Polish, with compact and 200% zoom checks. Its feedback arrival/removal scenes reuse the browser harness screencast and write timestamped frames plus a manifest for `panel-motion-flipbook`.
