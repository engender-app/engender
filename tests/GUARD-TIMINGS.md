# Guard scheduling measurements

The guard runner assigns the longest measured guard first, then puts each
remaining guard in the group with the lowest projected duration. A group's
projection includes each required build once. The runner executes the selected
guards in roster order, so the production build cannot replace the demo bundle
until that job's demo guards finish. Separate hosted jobs own their checkout,
build output, fixture files and browser storage.

`guard-durations.json` records the observed attempts, their sum in seconds, and
their source. The estimates include failed attempts and recovered retries. A new
guard needs a duration before it can enter a hosted shard; missing measurements
fail selection instead of silently omitting coverage. The roster test compares
the union of the actual workflow groups with the complete roster, including
multiplicity.

## Before

[Checks run 37188235861](https://github.com/engender-app/engender/actions/runs/37188235861)
checked revision `3dfa9cdfe2922dcdfd9e14d577eb4301ff05d071` on Ubuntu 24.04.
It finished with a failed cold-screen guard, so these timings are not a claim of
passing verification.

| Job | Setup before guards | Guard step, including builds | Whole job |
| --- | ---: | ---: | ---: |
| dev 1/1 | 37s | 968s | 1008s |
| built 1/2 | 83s | 1214s | 1298s |
| built 2/2 | 44s | 1804s | 1851s |

The two demo builds took 70.74s and 67.11s. The production build took 64.63s.
Those values are the first guard's total duration minus its attempt durations.
Scheduling rounds the demo cost up to 71s and production to 65s. Setup includes
checkout, Node, npm install, Chromium, and, for built guards, media fixture tools.

The workflow took 31m36s from creation to the aggregate job's completion, with
110.90 summed runner minutes. The three guard jobs consumed 69.28 runner minutes.
Initial queue time was 2-4s. The walkthrough alone took 18m03s.

## Build reuse decision

Each group builds its own bundle. Sharing a demo artifact could avoid five of
six demo builds, at most 355 runner seconds at the measured rounded cost. It
would not remove the producer's 71s build from the path to the last guard result.
Consumers would also wait for the producer's checkout, npm install, upload and
artifact download. No measured transfer time demonstrates a wall-clock saving,
so this change does not add that dependency. This leaves about six runner
minutes of possible build savings for a separate measured experiment.

The production guards still receive a production build. The walkthrough's
version override is not reused. Every guard job keeps full history and tags;
`scripts/app-version.mjs` remains the version source for its own revision.

## First candidate

CI uses three dev groups and six built groups on the existing runner type.
The additional jobs repeat setup and demo builds; runner minutes can rise even
when the longest guard group gets shorter. The hosted comparison below records the first candidate and the imbalance it
exposed.

The source roster also contains guards absent from the earlier run. The latest
main run, [37221482998](https://github.com/engender-app/engender/actions/runs/37221482998),
checks `90dac6f01321d116424b06f457acdb2737be95e3`. It supplies current dev timings
and the two production guard timings. Its demo build fails because release
metadata scans the former worker asset directory. The prerequisite repair reads
the shared asset directory and still matches the database binary by bytes.

Four built guards use local seed measurements because that hosted run never
executed them: dose save 13.09s, entry editor return 104.07s, calendar month
accessibility 84.11s, and chart accessibility 130.07s. All passed locally. These
numbers do not prove hosted runtime; their provenance is separate in the JSON.
The complete candidate roster has 74 guards, compared with 68 in the older
baseline. The coverage test compares the candidate roster with its own workflow,
so the additional six guards are not lost in a historical comparison.

| Projected group | Guard attempts plus required builds |
| --- | ---: |
| dev 1/3 | 241.78s |
| dev 2/3 | 239.59s |
| dev 3/3 | 240.36s |
| built 1/6 | 621.91s |
| built 2/6 | 626.13s |
| built 3/6 | 626.08s |
| built 4/6 | 624.04s |
| built 5/6 | 624.02s |
| built 6/6 | 627.22s |

These are projections before setup or queue time. They already exceed ten
minutes for built guards; the retained two-attempt cold-screen cost is 539.71s
before its 71s build. More groups cannot split that guard. The earlier
walkthrough's 18m03s also prevents a ten-minute full-workflow claim. The hosted results below supply elapsed time, setup costs and summed runner
minutes for this candidate.

## First hosted candidate

[PR 8 run 37223138118](https://github.com/engender-app/engender/actions/runs/37223138118)
ran the reviewed scheduling code. The public branch head was
`47b0aeb8cd1bab8f3b1aebd26fa2143bae8105fa`, code-equivalent to local ticket tip
`8a0f84365820137e4fde9b2e2ad520cf4bd9529c`. Actions checked out the PR merge
revision `07d8347caa92f7b0ab8a4fc0788f4d46497289c5`; the Node build recorded
`0.0.0-dev+g07d8347c`. The candidate does not contain ticket 01's cold-notice repair.

The workflow failed. Every one of the 74 guards ran exactly once at the guard
level, with the existing second attempt on failure. There were 67 passing guards,
seven failing guards, no blocked guards and no recovered retries. Every required
job ran, and the aggregate reported the failures.

| Measurement | Earlier baseline | First candidate | Second candidate |
| --- | ---: | ---: | ---: |
| Trigger to aggregate completion | 31m36s | 20m09s | 19m14s |
| Summed runner minutes, all jobs | 110.90 | 136.40 | 135.37 |
| Summed runner minutes, guards | 69.28 | 93.35 | 93.18 |
| Longest guard job | 30m51s | 18m09s | 15m20s |
| Walkthrough job | 18m03s | 19m46s | 19m07s |
| Initial job start delay | 2-4s | 3-210s | 2-38s |

This is an observed comparison, not a controlled steady-state benchmark. The
older run has six fewer guards and an earlier application revision. PR 7 ran
concurrently with PR 8 during this campaign; the queue-inclusive result includes
that contention. The data does not establish a particular GitHub concurrency
limit. Runner minutes increased by 25.50 across the workflow and 24.07 for guards.
The walkthrough was the longest job, while group 6's later start left it as the
last guard to finish. The final aggregate finished 20m09s after the trigger.

| Guard group | Start delay | Setup | Guard step | Demo build | Production build | Whole job | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| dev 1/3 | 98s | 39s | 297s | - | - | 339s | success |
| dev 2/3 | 3s | 48s | 311s | - | - | 363s | failure |
| dev 3/3 | 3s | 36s | 386s | - | - | 424s | success |
| built 1/6 | 99s | 46s | 601s | 68.89s | - | 651s | failure |
| built 2/6 | 3s | 47s | 552s | 49.93s | - | 602s | failure |
| built 3/6 | 51s | 50s | 586s | 59.44s | - | 638s | failure |
| built 4/6 | 210s | 57s | 685s | 71.42s | - | 747s | success |
| built 5/6 | 209s | 56s | 689s | 72.14s | 65.46s | 748s | failure |
| built 6/6 | 115s | 51s | 1036s | 68.16s | - | 1089s | failure |

Start delay is trigger-to-job-start for the independent jobs. Setup is job start
through the start of the guard step. Guard steps include builds; whole-job time
also includes reporting and cleanup. Build times come from the first guard's
total minus its attempts, rounded to the log's 0.01s precision. All six demo
builds and the production build succeeded. The production guards ran only after
the production build in group 5; no job shared mutable build output.

| Other job | Whole job | Result |
| --- | ---: | --- |
| Checks, Node tier, catalogues and licences | 205s | success |
| Browser verification (walkthrough) | 1186s | success |
| Ten-year Journal, against the regression budget | 350s | success |
| Browser verification (installed-pwa) | 111s | success |
| Android debug artifact and F-Droid checks | 246s | success |
| Browser verification (hosting) | 94s | success |
| Browser verification (browser-tier) | 389s | success |
| All required checks | 2s | failure |

The seven guard failures remain visible:

- `record-dismissal-check`: the dose-requirements selector did not become visible.
  This also failed in main run 37221482998 before the scheduling change.
- `radio-groups-gallery`: the second save waited for `[data-home-log]` and timed
  out at line 75.
- `entry-pending-save`: the URL wait at line 294 timed out after navigation to
  `/day/today`.
- `cold-screen-moves`: both attempts reported "measuring notice was not visible
  during cold load" on the first light measurements case. This candidate still
  has the old sampling contract; ticket 01's repair is separate.
- `date-picker-check`: both attempts failed "\"Use date\" can be brought inside
  the zoomed visual viewport" at line 189.
- `settings-erase-check`: both attempts found an extra `photos` directory in the
  device-bound cancellation file-list assertion.
- `tile-arrival-timing`: warm Look back to Today medians were 253ms and 260ms
  against 250ms. Attempt one also failed the Android-presentation timing case
  with readable content at 445ms and the field ending at 429ms.

The table records every attempt from the hosted logs. Exit code 0 means success;
1 means failure. These are attempt seconds, excluding build time. A retry still
counts as the same roster guard.

| Group | Guard | Result | Attempts: exit code / seconds |
| --- | --- | --- | --- |
| dev 1/3 | `blind-edge-padding-check` | pass | 0 / 3.49s |
| dev 1/3 | `letters-ready-jump` | pass | 0 / 15.87s |
| dev 1/3 | `body-map-selected-context` | pass | 0 / 18.99s |
| dev 1/3 | `recovery-key-departure-check` | pass | 0 / 9.57s |
| dev 1/3 | `photo-export` | pass | 0 / 26.11s |
| dev 1/3 | `content-before-dates-check` | pass | 0 / 56.83s |
| dev 1/3 | `document-reader` | pass | 0 / 17.44s |
| dev 1/3 | `hair-progress-photo-jump-check` | pass | 0 / 11.09s |
| dev 1/3 | `hair-removal-recency-handoff-check` | pass | 0 / 9.69s |
| dev 1/3 | `search-filter-scope` | pass | 0 / 19.56s |
| dev 1/3 | `noticed-effects-picker-check` | pass | 0 / 31.66s |
| dev 1/3 | `breathing-frames` | pass | 0 / 76.60s |
| dev 2/3 | `dilation-schedule-action` | pass | 0 / 15.38s |
| dev 2/3 | `record-dismissal-check` | fail | 1 / 26.93s; 1 / 25.39s |
| dev 2/3 | `letter-composition-check` | pass | 0 / 16.17s |
| dev 2/3 | `photo-browse-compare` | pass | 0 / 9.68s |
| dev 2/3 | `photo-grid-batching` | pass | 0 / 114.33s |
| dev 2/3 | `chosen-appointment` | pass | 0 / 8.88s |
| dev 2/3 | `empty-reflection` | pass | 0 / 33.46s |
| dev 2/3 | `hair-removal-entry-check` | pass | 0 / 17.37s |
| dev 2/3 | `roadmap-tick-motion-check` | pass | 0 / 9.95s |
| dev 2/3 | `document-import-check` | pass | 0 / 14.12s |
| dev 2/3 | `measurements-entry-check` | pass | 0 / 20.14s |
| dev 3/3 | `body-map-figure-yank` | pass | 0 / 12.37s |
| dev 3/3 | `chart-tick-readout` | pass | 0 / 145.92s |
| dev 3/3 | `year-days-list` | pass | 0 / 18.96s |
| dev 3/3 | `voice-task-names` | pass | 0 / 70.88s |
| dev 3/3 | `appointment-entry-check` | pass | 0 / 18.05s |
| dev 3/3 | `measurements-sizes-jump-check` | pass | 0 / 13.65s |
| dev 3/3 | `mark-edge-fringe` | pass | 0 / 4.18s |
| dev 3/3 | `getting-started-cross-check` | pass | 0 / 25.44s |
| dev 3/3 | `tryout-save-check` | pass | 0 / 30.47s |
| dev 3/3 | `regimen-editor-check` | pass | 0 / 16.43s |
| dev 3/3 | `lab-entry-check` | pass | 0 / 17.73s |
| dev 3/3 | `leave-lock-check` | pass | 0 / 11.66s |
| built 1/6 | `changes-methodology-check` | pass | 0 / 10.55s |
| built 1/6 | `cold-screen-moves` | fail | 1 / 260.92s; 1 / 261.11s |
| built 2/6 | `sheet-touch-drag-check` | pass | 0 / 9.04s |
| built 2/6 | `yank-sweep` | pass | 0 / 153.69s |
| built 2/6 | `calendar-month-a11y-check` | pass | 0 / 197.43s |
| built 2/6 | `tally-chip-row-yank` | pass | 0 / 57.84s |
| built 2/6 | `radio-groups-gallery` | fail | 1 / 34.41s; 1 / 34.27s |
| built 2/6 | `boot-error-alone` | pass | 0 / 15.04s |
| built 3/6 | `no-auto-keyboard` | pass | 0 / 25.17s |
| built 3/6 | `sheet-handoff-scroll-check` | pass | 0 / 8.71s |
| built 3/6 | `media-transport-check` | pass | 0 / 16.15s |
| built 3/6 | `care-lane-labels` | pass | 0 / 39.46s |
| built 3/6 | `day-cold-load-yank` | pass | 0 / 84.19s |
| built 3/6 | `entry-pending-save` | fail | 1 / 59.83s; 1 / 58.61s |
| built 3/6 | `home-fold-reserve` | pass | 0 / 233.82s |
| built 4/6 | `sheet-navigation-leftover-check` | pass | 0 / 14.06s |
| built 4/6 | `tryout-form-check` | pass | 0 / 38.60s |
| built 4/6 | `wear-tile-close-yank` | pass | 0 / 217.13s |
| built 4/6 | `words-reading-scope-check` | pass | 0 / 9.67s |
| built 4/6 | `prep-context-check` | pass | 0 / 48.49s |
| built 4/6 | `debrief-offer-check` | pass | 0 / 82.59s |
| built 4/6 | `documents-rows-settle` | pass | 0 / 109.92s |
| built 4/6 | `home-idle-raster` | pass | 0 / 93.07s |
| built 5/6 | `date-picker-check` | fail | 1 / 129.91s; 1 / 130.48s |
| built 5/6 | `time-picker-check` | pass | 0 / 34.94s |
| built 5/6 | `sheet-focus-check` | pass | 0 / 22.40s |
| built 5/6 | `screen-part-last-row` | pass | 0 / 55.85s |
| built 5/6 | `more-search-nothing-found` | pass | 0 / 76.67s |
| built 5/6 | `device-recovery-check` | pass | 0 / 19.76s |
| built 5/6 | `settings-erase-check` | fail | 1 / 40.68s; 1 / 40.56s |
| built 6/6 | `date-picker-motion` | pass | 0 / 32.67s |
| built 6/6 | `dose-editor-copy-check` | pass | 0 / 10.93s |
| built 6/6 | `dose-save-check` | pass | 0 / 19.95s |
| built 6/6 | `care-cold-load-yank` | pass | 0 / 88.62s |
| built 6/6 | `entry-editor-return` | pass | 0 / 250.15s |
| built 6/6 | `chart-a11y-check` | pass | 0 / 228.26s |
| built 6/6 | `roadmap-track-summary` | pass | 0 / 4.50s |
| built 6/6 | `tile-arrival-timing` | fail | 1 / 145.26s; 1 / 145.84s |
| built 6/6 | `restore-previous-journal` | pass | 0 / 41.98s |

## Timing correction for the second candidate

The first run demonstrated material imbalance: group 6 took 1089s, while the
other built jobs took 602-748s. Three local seeds in group 6 underestimated
hosted cost: dose save took 19.95s instead of 13.09s, entry return 250.15s instead
of 104.07s, and chart accessibility 228.26s instead of 130.07s. Calendar
accessibility, in group 2, took 197.43s instead of 84.11s. Group 6 also incurred a
second tile-arrival attempt. The first forecast therefore does not count as
proof that the actual groups were balanced.

The duration file now uses all 74 guards' attempts from this hosted run, including
failures. Demo and production build estimates round the largest observed cost
up to 73s and 66s. The runner and the three-dev/six-built matrix are unchanged.
Refreshing only the four local seeds would leave replayed built groups at
504-847s. Using all observed attempt costs gave 693-702s with the original 71s/65s
build estimates; the refreshed build estimates add their measured difference.
These replays hold attempt costs fixed and exclude setup and queue time. They
are a reason to rerun the candidate, not a replacement for that run.

The next section records the second candidate's hosted evidence. Ticket 01
changes the cold guard's runtime when integrated, and ticket 05 owns the
subsequent integrated samples.

## Second hosted candidate

[PR 8 run 37224740045](https://github.com/engender-app/engender/actions/runs/37224740045)
checked public head `a903638593fe032069d87adf6e8055b3118b18e9`, code-equivalent
to local `b562d15168f90eda1502370602fa41c5e941e57c`. Actions tested PR merge
revision `93a9315c770bbd109d356a9f6bac7dfdfa9216bc`, and the Node build recorded
`0.0.0-dev+g93a9315c`. This run also preceded integration of ticket 01.

All 74 guards executed, with no omissions, duplicate assignments or blocked
guards. There were 68 first-attempt passes, one recovered guard and five failures.
Every other verification tier passed. The aggregate correctly failed because four guard
jobs failed. The top comparison table records the completed workflow totals.

| Guard group | Start delay | Setup | Guard step | Demo build | Production build | Whole job | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| dev 1/3 | 3s | 109s | 269s | - | - | 382s | failure |
| dev 2/3 | 2s | 41s | 347s | - | - | 390s | success |
| dev 3/3 | 3s | 48s | 351s | - | - | 403s | success |
| built 1/6 | 2s | 47s | 651s | 60.19s | - | 700s | success |
| built 2/6 | 3s | 53s | 466s | 56.98s | - | 521s | success |
| built 3/6 | 3s | 54s | 700s | 72.8s | - | 758s | failure |
| built 4/6 | 2s | 51s | 751s | 73.6s | - | 805s | failure |
| built 5/6 | 2s | 57s | 861s | 66.22s | - | 920s | success |
| built 6/6 | 3s | 75s | 632s | 66.56s | 75.3s | 712s | failure |

All six demo builds and the production build passed. Every guard job started
within 3s; installed-PWA verification started after 38s. PR 7 was still active
when this run began, so these queue costs also describe the campaign rather
than an isolated benchmark.

The longest built job dropped from 1089s to 920s after the timing refresh. Dev
jobs took 382-403s. Built jobs took 521-920s, so observed runtime remains uneven.
Group 2 saved an attempt when tile-arrival passed first time in 121.89s, compared
with two failed attempts totaling 291.10s before. In the longest group, calendar
accessibility rose from 197.43s to 299.81s and home-fold reserve from 233.82s to
289.89s. These observed costs explain why equal projected totals did not produce
equal wall-clock durations. The longest remaining job was the 1147s walkthrough.

The measured allocation, full coverage and independent job execution are
verified. The duration file keeps the first hosted run's measurements used by
this verified candidate. There is no further calibration in this ticket. Ticket
05 must measure the integrated candidate, whose cold-guard behavior differs,
and report the remaining runtime tradeoff. Neither the ten-minute target nor a
passing full workflow has been reached here.

The five failures were `record-dismissal-check`, `date-picker-check`,
`entry-pending-save`, `radio-groups-gallery` and `settings-erase-check`. Their
second-run diagnostics repeat the selector, viewport, return-URL and file-list
failures described above. The runner continued through every later independent
guard. `tile-arrival-timing` passed on its first attempt this time.

`cold-screen-moves` recovered: exit 1 after 244.43s, then exit 0 after 244.21s.
Its first failure was the light `/more` case: the section heading moved up 19px
at 371ms and down 19px at 376ms. This was a movement finding, not the earlier
missing-notice message. The successful retry does not erase that observation.
The existing workflow labels it PASS; this report identifies it as recovered.
Retry-evidence retention changes belong to ticket 02.

## Independent old-allocation comparison

[PR 7 run 37223064935](https://github.com/engender-app/engender/actions/runs/37223064935)
used the same application code and shared metadata repair, the old one-dev/two-
built allocation, and ticket 01's different cold-notice guard. Its head was
`f9fcde7b420f1768e345dd5b9a256002682f983e`. It is not an untouched-main control.
It ran concurrently with parts of both PR 8 samples.

That run failed in 38m09s with 126.53 summed runner minutes. Its dev job took
1037s; built jobs took 1763s and 2257s. It also failed the same record-dismissal,
date-picker, entry-pending-save, radio-groups, tile-arrival and settings-erase
guards. Those failures therefore also occur without the new allocation.
The repaired cold guard passed its first attempt in 220.38s. Yank-sweep recovered
from exit 1 in 169.96s to exit 0 in 169.42s. This comparison separates repeated
failures from new scheduling work while retaining the changed-guard and campaign
limitations.

## Complete second-run results

| Other job | Whole job | Result |
| --- | ---: | --- |
| Checks, Node tier, catalogues and licences | 254s | success |
| Browser verification (hosting) | 123s | success |
| Browser verification (walkthrough) | 1147s | success |
| Ten-year Journal, against the regression budget | 217s | success |
| Android debug artifact and F-Droid checks | 258s | success |
| Browser verification (browser-tier) | 393s | success |
| Browser verification (installed-pwa) | 136s | success |
| All required checks | 3s | failure |

Every guard attempt follows. As above, these seconds exclude builds. Recovered
means a failed first attempt followed by a successful bounded retry.

| Group | Guard | Result | Attempts: exit code / seconds |
| --- | --- | --- | --- |
| dev 1/3 | `blind-edge-padding-check` | pass | 0 / 4.16s |
| dev 1/3 | `letters-ready-jump` | pass | 0 / 16.09s |
| dev 1/3 | `chart-tick-readout` | pass | 0 / 71.84s |
| dev 1/3 | `record-dismissal-check` | fail | 1 / 27.27s; 1 / 26.25s |
| dev 1/3 | `photo-export` | pass | 0 / 28.63s |
| dev 1/3 | `chosen-appointment` | pass | 0 / 10.13s |
| dev 1/3 | `appointment-entry-check` | pass | 0 / 17.87s |
| dev 1/3 | `hair-progress-photo-jump-check` | pass | 0 / 11.35s |
| dev 1/3 | `hair-removal-entry-check` | pass | 0 / 19.74s |
| dev 1/3 | `measurements-sizes-jump-check` | pass | 0 / 13.59s |
| dev 1/3 | `search-filter-scope` | pass | 0 / 22.06s |
| dev 2/3 | `dilation-schedule-action` | pass | 0 / 17.33s |
| dev 2/3 | `body-map-selected-context` | pass | 0 / 17.66s |
| dev 2/3 | `body-map-figure-yank` | pass | 0 / 6.03s |
| dev 2/3 | `photo-browse-compare` | pass | 0 / 12.09s |
| dev 2/3 | `photo-grid-batching` | pass | 0 / 130.16s |
| dev 2/3 | `content-before-dates-check` | pass | 0 / 59.87s |
| dev 2/3 | `roadmap-tick-motion-check` | pass | 0 / 11.12s |
| dev 2/3 | `mark-edge-fringe` | pass | 0 / 1.24s |
| dev 2/3 | `getting-started-cross-check` | pass | 0 / 25.19s |
| dev 2/3 | `noticed-effects-picker-check` | pass | 0 / 32.28s |
| dev 2/3 | `regimen-editor-check` | pass | 0 / 16.22s |
| dev 2/3 | `lab-entry-check` | pass | 0 / 17.17s |
| dev 3/3 | `year-days-list` | pass | 0 / 23.41s |
| dev 3/3 | `voice-task-names` | pass | 0 / 71.16s |
| dev 3/3 | `letter-composition-check` | pass | 0 / 18.05s |
| dev 3/3 | `recovery-key-departure-check` | pass | 0 / 10.69s |
| dev 3/3 | `document-reader` | pass | 0 / 19.46s |
| dev 3/3 | `empty-reflection` | pass | 0 / 38.56s |
| dev 3/3 | `hair-removal-recency-handoff-check` | pass | 0 / 10.98s |
| dev 3/3 | `breathing-frames` | pass | 0 / 78.09s |
| dev 3/3 | `tryout-save-check` | pass | 0 / 30.76s |
| dev 3/3 | `document-import-check` | pass | 0 / 15.90s |
| dev 3/3 | `measurements-entry-check` | pass | 0 / 22.53s |
| dev 3/3 | `leave-lock-check` | pass | 0 / 11.69s |
| built 1/6 | `date-picker-motion` | pass | 0 / 29.35s |
| built 1/6 | `sheet-touch-drag-check` | pass | 0 / 7.92s |
| built 1/6 | `prep-context-check` | pass | 0 / 48.30s |
| built 1/6 | `cold-screen-moves` | recovered | 1 / 244.43s; 0 / 244.21s |
| built 1/6 | `boot-error-alone` | pass | 0 / 16.43s |
| built 2/6 | `sheet-focus-check` | pass | 0 / 21.23s |
| built 2/6 | `care-cold-load-yank` | pass | 0 / 71.98s |
| built 2/6 | `tally-chip-row-yank` | pass | 0 / 60.44s |
| built 2/6 | `changes-methodology-check` | pass | 0 / 8.56s |
| built 2/6 | `documents-rows-settle` | pass | 0 / 89.76s |
| built 2/6 | `tile-arrival-timing` | pass | 0 / 121.89s |
| built 2/6 | `restore-previous-journal` | pass | 0 / 35.16s |
| built 3/6 | `date-picker-check` | fail | 1 / 130.17s; 1 / 131.04s |
| built 3/6 | `no-auto-keyboard` | pass | 0 / 26.39s |
| built 3/6 | `care-lane-labels` | pass | 0 / 44.53s |
| built 3/6 | `words-reading-scope-check` | pass | 0 / 9.09s |
| built 3/6 | `entry-pending-save` | fail | 1 / 61.99s; 1 / 62.04s |
| built 3/6 | `more-search-nothing-found` | pass | 0 / 78.23s |
| built 3/6 | `home-idle-raster` | pass | 0 / 83.82s |
| built 4/6 | `dose-editor-copy-check` | pass | 0 / 11.83s |
| built 4/6 | `yank-sweep` | pass | 0 / 187.56s |
| built 4/6 | `tryout-form-check` | pass | 0 / 37.73s |
| built 4/6 | `media-transport-check` | pass | 0 / 19.07s |
| built 4/6 | `day-cold-load-yank` | pass | 0 / 97.58s |
| built 4/6 | `entry-editor-return` | pass | 0 / 247.81s |
| built 4/6 | `radio-groups-gallery` | fail | 1 / 35.64s; 1 / 35.95s |
| built 4/6 | `roadmap-track-summary` | pass | 0 / 4.74s |
| built 5/6 | `time-picker-check` | pass | 0 / 36.48s |
| built 5/6 | `sheet-navigation-leftover-check` | pass | 0 / 13.24s |
| built 5/6 | `sheet-handoff-scroll-check` | pass | 0 / 9.81s |
| built 5/6 | `calendar-month-a11y-check` | pass | 0 / 299.81s |
| built 5/6 | `debrief-offer-check` | pass | 0 / 82.28s |
| built 5/6 | `home-fold-reserve` | pass | 0 / 289.89s |
| built 5/6 | `screen-part-last-row` | pass | 0 / 63.02s |
| built 6/6 | `dose-save-check` | pass | 0 / 18.19s |
| built 6/6 | `wear-tile-close-yank` | pass | 0 / 172.82s |
| built 6/6 | `chart-a11y-check` | pass | 0 / 201.82s |
| built 6/6 | `device-recovery-check` | pass | 0 / 18.18s |
| built 6/6 | `settings-erase-check` | fail | 1 / 39.65s; 1 / 39.48s |

After these measurements, local integration tip
`c8f38bec4e8e4d6118875ac5692881841e4bc5c9` was merged into the ticket branch.
That brings in ticket 01's cold-notice repair and preserves the hosted scheduling
candidate's runner, matrix and duration inputs. The hosted revision identities
above remain the evidence for these timings. Post-merge focused checks verify
compatibility; integrated hosted sampling remains ticket 05's work.
