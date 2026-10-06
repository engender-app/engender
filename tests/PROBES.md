# The probes in tests/*.mjs

Every `.mjs` file directly under `tests/` is a guard, a gallery, or a helper
the other two import, plus `walkthrough.test` (`walkthrough.test.mjs`), which has its own npm
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

CI's Node and Android jobs use `scripts/run-ci-checks.mjs`. Independent
checks continue after a failure; failed prerequisites leave named blocked
results. Browser fixtures, walkthroughs, installed PWA and hosting run in
separate jobs. The final required-checks job fails if any tier fails or is
blocked.

## Walkthrough groups

`walkthrough-groups` (`tests/walkthrough-groups.mjs`) assigns contiguous flow ranges to four hosted jobs.
Run one with `node tests/walkthrough.test.mjs --group journal` after
`VITE_DEMO=1 ENGENDER_VERSION=9.9.9-walkthrough npm run build`. The other group
names are `setup`, `features` and `actions`; `--list` prints their inventory.
No group argument keeps the continuous walkthrough available. `--only` is a
partial diagnostic run in either mode and does not prove the whole group.

Each process owns a new browser context and origin, including OPFS, IndexedDB
and localStorage. Initialization explicitly resets the synthetic journal and
waits for the demo control's database writes to finish. Each hosted job owns
its checkout and build. Concurrent local runs may read the same completed
walkthrough build; do not rebuild underneath them. Diagnostic files and JSON
results use a unique `ci-logs/walkthrough-<group>-*` directory. CI keeps these
results for seven days, including passing runs, and reports per-flow durations
in the job summary. The browser matrix remains part of `All required checks`;
a failed group does not cancel its siblings.

| Group | Starting state and retained sequence | Baseline flow span |
| --- | --- | --- |
| journal | Alice persona. Entry writes remain before search; stale-backup notice stays before archive and CSV exports. | 193 seconds |
| setup | Alice persona. Onboarding variants stay together; the forgotten-PIN reset restores the persona before wrapped and comparison. Journal-book reset stays before regimen and route checks. | 296 seconds |
| features | Alice persona. The demo-jump overlap check stays before fill-every-feature and its consumers. Coming-back restores the full fixture before letters, comparison, import, injection map and eras. | 205 seconds |
| actions | Alice persona plus the full fixture, needed by quick-add dose. Tally reset stays before appointments; effects reset stays before media. Recovery-key creation, mode changes and recovery at the gate stay together at the end. | 263 seconds |

The split uses timestamps from passing [Checks run 37223064935](https://github.com/engender-app/engender/actions/runs/37223064935),
job 111497183448. The unsplit job took 1064 seconds (17.73 runner minutes),
including setup and build. The spans above exclude preparation and are not a
claim about parallel speed. No assertion or fixture scale was reduced. The
two quick-add tally cases now share a named flow so selection cannot run them
outside their group. `walkthrough-groups.test.ts` checks complete ordered
coverage and the command's selection behavior.

## Guards

Pass/fail checks: each exits non-zero when what it holds stops being true.
CI's regression jobs run both sets from `guards.json`. The runner retries each
failed guard once and prints every result. CI uses three dev shards and six
built shards, balanced by measured duration in `guard-durations.json`, including
build costs. Each hosted job owns its browser storage and build directory.
The runner preserves roster order within each shard so demo guards finish
before the production build replaces their bundle. Local npm scripts run the
whole tier. Timing sources and the cost comparison are in [GUARD-TIMINGS.md](GUARD-TIMINGS.md).
To run one on its own, use
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
| `year-days-list` | the yearly grid's days as a list: the painted cells out of the accessibility tree, every day's value (or "Not logged") read off it a month at a time, three tab stops, a tap or Enter to open and step, and the fold and a month change never moving anything in one frame |
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
| `tryout-save-check` | tryout label guidance, retained drafts, pending writes, discard, saved outcomes, navigation retry and photo ownership against real routes |
| `tryout-milestone-felt-check` | tryout felt-sense rows name their mood, adoption sets the app name to the stored tryout name, and a milestone's anniversary offers a felt sense, names it, saves, says so and goes |
| `regimen-editor-check` | independent episode and schedule edits, retained drafts, failed writes, pending saves, pause and end actions, route discard and lock concealment |
| `document-import-check` | document import field order, saved values, owner links, draft dismissal, failures and privacy in English and Polish |
| `lab-entry-check` | lab result field order, saved values, draft dismissal, failures and privacy in English and Polish |
| `measurements-entry-check` | measurement field order, saved values, draft dismissal, failures and privacy in English and Polish |
| `leave-lock-check` | leaving locks and unmounts the journal under Immediately; two-finger swipes do not lock under any timing; Restart keeps the running journal open |

### `npm run test:guards:built` (demo build, then a production build)

| Probe | Holds |
| --- | --- |
| `date-picker-check` | the date picker's day targets are 48px and own their edges; arrows, PageUp/PageDown, Shift and Enter work; typed entry refuses a day the calendar lacks; the arrows and the month drum turn months; Escape closes the drum before the picker and the picker before its sheet, at 320-430px, 200% text and 200% pinch |
| `date-picker-motion` (`--themes light --gate`) (pickers ticket 01) | the date picker opens, closes, turns a month by arrow, finger and trackpad, springs back, stretches at a bound, jumps to Today and through the month drum without a yank in any sampled frame, and a swipe past the threshold turns the month while a short one and one past a bound do not; `--out <dir>` keeps the frames for a flipbook |
| `time-picker-check` (`--themes light --gate`) (pickers ticket 02) | the time picker opens on the stored time, steps by arrow, brings a tapped row to the band, rests a flick on a whole row, turns both drums to a typed time, refuses a time that is not one, commits on Use time, leaves the value on Escape and gives focus back, offers Clear only on an optional field, and a downward swipe on a drum at 00 does not move the sheet; no drum moves its whole five-row window in one frame and the surface never arrives or leaves in one; `--out <dir>` keeps the frames for a flipbook |
| `sheet-focus-check` | a sheet takes focus and gives it back, on appointment, lab and dose screens |
| `no-auto-keyboard` | no screen, the new-entry editor and search included, arrives with a text field focused, so a phone never opens with the keyboard up |
| `dose-editor-copy-check` | dose editor labels and field order in English and Polish, without duplicate prompts |
| `dose-save-check` | Dose saves close and confirm through Care, Quick add and Today, preserving navigation and single-row confirmation |
| `sheet-navigation-leftover-check` | a sheet clears within 200ms of navigating away by tab bar or link, none left in the DOM, and Escape right after doesn't act on the departed one |
| `sheet-handoff-scroll-check` | a sheet raised by another's close keeps the shell inert while it is up, and the editor still scrolls once both close |
| `sheet-touch-drag-check` | a finger dragging a sheet down from its handle or body moves it with the finger and a long swipe dismisses it (real CDP touch, where `touch-action` applies) |
| `yank-sweep` (`--scenes doses-sheet,surgery-sheet,regimen-add,settings-about,letters-compose,eras-add --gate`) (ticket 244) | an ordinary sheet's rise and scrim fade actually play rather than teleporting open/shut in one frame - `--gate` exits non-zero on any style yank; render findings don't gate (tickets 149/231/152's scrim-blur-fade-in false positive) |
| `tryout-form-check` | what a screen reader is handed for the tryout form's fields |
| `media-transport-check` | both players' transports work by keyboard, speak their position, go full screen and run offline |
| `care-lane-labels` | three Care lanes' captions do not collide at 390px in Polish |
| `care-cold-load-yank` | Care's cold load at 1x and 4x CPU: no rail caption steps sideways, nothing below the care read paints before the rail, what it answers with fades in, and the nav pill never paints wider than its tab |
| `wear-tile-close-yank` | stopping the Home wear-timer tile collapses its own tier's row rather than snapping the agenda up under a still-visible ghost, even when an unrelated fold promotion lands the same tick |
| `day-cold-load-yank` | The day view's cold load at 4x CPU: margin notes and dose drug names land with the day's records, never after |
| `entry-editor-return` | The entry editor's Save keeps an accessible name, its date line clears the header, save and delete return to Calendar, Search (query kept), a day, and delete says Moved to trash with Restore or says it failed; the header field spans the same box as Care's and Day's, an opened Photos, Voice or Video section lands above the foot, and an untouched scale draws no thumb or fill and saves no value |
| `calendar-month-a11y-check` | the open calendar month is a list named by its month with one item per day, every day says its date, axe finds nothing in it, Tab walks the date links in order, and every link is 48px or more without overlapping at 360, 390 and 411px phones and the 390px desktop page (320 is printed only) |
| `quick-add-focus-check` | Enter on the add button puts focus in the quick-add fan, a labelled modal dialog over an inert screen; Tab stays in it and Escape gives focus back to the button, also after a slide onto a target; arrows on Today's mood faces move focus and open nothing; a keyboard screen change and quick add's mood land focus on the new screen's h1 with the tab title unchanged; each onboarding step's question takes focus and names the name field |
| `chart-a11y-check` | every screen that places a chart card has an unbroken heading order and no axe target-size, nested-interactive or heading-order finding; the changes line's marks meet 24px and each has a 48px row, the Look back rail's reachable controls are its two 48px handles and its list holds every fact it draws, and the hormone curve's image holds no control while a list beside it names every marked thing and opens its record by keyboard, at 320 and 390px |
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
| `boot-error-alone` | a boot that fails on an unreadable journal shows its notice and nothing a booted app draws, and Today leaves by crossfade rather than a cut; a refused SQLite wasm and a worker served without COEP reach the same notice; the notice names the failure in words rather than the driver's, and a development build's journal (below the baseline) gets the start-over way out and no retry; a normal boot, and one at 6x CPU, still reach Today |
| `restore-previous-journal` | after a migration fails past its copy, the failure screen offers the journal from before the update and restoring it boots, on the web (a control retry of the stamped live file must fail); an interrupted restore finishes by itself on the next boot; "Try opening again" pressed the frame it appears boots like a slow retry, 5 of 5 |
| `day-addresses` | malformed day addresses keep the unavailable notice, navigation and Back; ISO dates select the right day, future entries are refused, and same-route navigation reads the second letter |
| `device-recovery-check` | recovery after real key loss, against a production build, where the first run is real |
| `settings-erase-check` | Settings' Delete everything in passphrase, PIN, biometric (virtual authenticator with PRF) and device-bound (the web's Unlocked) mode, against a production build: no Ko-fi row; a saved photo makes the OPFS fixture independent of deferred housekeeping; cancelling preserves every root entry and photo byte; confirming lands at first run saying so once (a reload does not repeat it) with no device key left; a new journal finds nothing from before (a control search finds the entry first) |

### Written as a guard, not in CI yet

`resurfacing-consent-check` requires a demo build. It checks that muting an
era removes retrospective offers and sharing controls, direct Wrapped share
URLs show the muted notice, and unmuting restores the offers and sharing.

| Probe | Why not |
| --- | --- |
| `locale-25` | Polish weekdays, decimal values and translated joins at 390 px; a real 30 MiB PNG imports while the document ceiling stays 25 MiB (run after a build) |
| `return-floor-check` (`npm run test:return-floor`) | Red on main. At 195px, the width 200% zoom leaves of a 390px phone, the English milestone subtitle "Its day was 4 September 2026." is wider than its row, and `.kit-row-sub` cannot break the word. Promote it once that is fixed. |
| `a11y-targets-large-text` | Every control the 30 September and 5 October accessibility audits listed reaches 48px by `elementFromPoint` from its centre, at 320 and 390px with text at 100% and 200%, and every bottom-navigation name is whole in English and Polish at 100%, 130% and 200%; the calendar's date links at 320 are printed only. About six minutes over 13 screens, which is more than a CI shard has room for (after-release 18). |

`browser-tier/run.mjs` also imports seven probes (`care-read`,
`care-spine-links`, `read-failures`, `source-record-links`,
`timeline-fact-selection`, `pin-progress-status`, `gates-say-what-happened`), so they run in the browser job with
`npm run test:browser`. Three of them take `--gallery` as well.

`screen-mount.html` renders Home, Calendar, Settings and related routes over
seeded encrypted journals. The browser runner checks their DOM, computed
styles, interactions and loading gates, then repeats the narrow layout checks
at 230px. The three screen contract suites run here rather than in Node.

`clinician-summary-access` reruns the clinician table audit against the ticket-owned axe assets and writes paired screenshots. Run it from the prepared ticket 31 evidence tree.

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
`cold-screen-sampler` (shared frame capture), `measurement-notice-observation` (notice travel and observation completeness),
`probe-handshake`, `palettes`, `png-decode`, `pdf-fixture`, `photo-fixture`,
`prep-fixture`, `media-fixtures`, `fake-microphone`, `motion-sampling`,
`setup-flow`, `frame-band-distances`, `contrast-walk`, `yank-sweep-core`, `field-text-core`, `field-text-edge-series`, `device-evidence`, `picker-motion-yanks`.

`run-guards` runs the roster; its Node tests check retry, builds and sharding.
The roster's `diagnostics` paths identify files to retain per attempt. Only files
created or changed by that attempt are copied; gallery-only output is excluded.

`letter-composition-gallery` captures composition and discard across all palettes, both themes, English/Polish, compact widths and 200% zoom. It needs a demo build. `android-tier/letter-composition.mjs` checks native Back and drag on a disposable emulator.

`tryout-save-check` checks label guidance, retained drafts, pending writes, discard, saved outcomes, navigation retry and photo ownership against real tryout routes. `gallery:tryouts` also captures saved details and discard controls across every palette, both themes, English and Polish, with compact and 200% zoom checks. Its feedback arrival/removal scenes reuse the browser harness screencast and write timestamped frames plus a manifest for `panel-motion-flipbook`.

## Other retained probes

These tools have direct commands rather than gallery npm scripts. Each remains
available for the surface or device it measures.

| Probe | Purpose |
| --- | --- |
| `device-bound-writes` | verify wrapping-key reuse and failed metadata writes on real OPFS and IndexedDB; run with `node tests/device-bound-writes.mjs` |
| `android-tab-status-strip` | sample tab and system-icon backgrounds in an Android WebView; requires a demo build and attached device |
| `journal-book-height` | measure the journal book height against a demo build (`measure:journal-book`) |
| `journal-book-print-diff` | compare printed journal output between demo builds (`measure:journal-book-print`) |
| `journal-book-summary-gallery` | capture journal book summary crops (`gallery:journal-book-summary`) |
| `journal-book-summary-signoff-page` | assemble the journal book crops into a review page |
| `lock-timing-gallery` | capture access mode, security, setup and unlock changes against a demo build |
| `milestone-shuffle-motion` | sample each frame of milestone suggestion shuffles against a dev server |
| `onboarding-scales-cold` | check that scales appear on a cold first run against a demo build |
| `regimen-editor-gallery` | capture regimen editors against a demo build (`gallery:regimen`) |
| `measurement-notice-proof` | prove delayed stationary appearance, missing content, incomplete observation, unsettled content and injected travel using the cold-load sampler; fresh and remembered reserves against a demo build |

`guard-recovery-proof` runs disposable synthetic guards through the production runner
and checks recovery, revision identity and retained evidence. The separate Guard
recovery proof workflow uploads both attempts for seven days, including on success.
