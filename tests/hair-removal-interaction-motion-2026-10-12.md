# Hair removal interaction motion, 12 October 2026

Ticket 10 covers adding a session, scrolling the regions and returning from the editor or screen. The candidate includes the session-first layout and the Settings ordering change through integration `6126e91264353b159c0848aa84dec9d681a7782b`.

## What moved

The first save in an empty journal replaced two copies of the region disclosure and area state. The old copy stayed inside the empty answer until its notice finished leaving. Its removal moved the visible footer by 223px in one frame, about 429ms after Save. The baseline painted pair is `hair-removal-motion/before/hair-removal-save-empty-light-p1-cast/025-410ms.png` and `027-439ms.png`.

The region controls and area state now have one lifetime outside the answer swap. The week answer crossfades within a positioned slot. Navigation ends that local transition immediately. The shared week label now fades its incoming text as well as its outgoing text.

An intermediate capture found another 117px movement at the end of the empty notice's outro. The height reveal treated its absolutely positioned outgoing sibling as another item on the same line, then collapsed horizontally. The reveal now ignores absolutely and fixed positioned siblings when choosing that axis. Three tests distinguish those overlays from an outgoing sibling that still occupies its line.

The browser recovery gate also exposed a portalled editor over the blank app. Hiding only the scroll region left the editor visible. The app root now becomes inert and has zero opacity during recovery. Its opacity does not transition. This hides the complete subtree, including its editor, while retaining the unsaved form for recovery. A reduced-motion frame exposed by an earlier visibility-based candidate is retained with the failed candidates.

## Painted evidence

Stable evidence lives under `.claude/phase-15-tester-report-01-delivery/evidence/10/` in the main checkout. `relocation.json` maps the original worktree paths in raw reports to that directory. Failed candidates, raw detector reports and casts remain available.

The final web sweep measured all 28 requested actions across empty and populated journals and both themes. No action failed or lacked proof; no page errors occurred. It retained 30 style candidates and 16 pixel candidates. These counts are not a zero-findings claim. `hair-removal-motion/after-fixed/classification.json` records their review without changing detector thresholds.

The empty-save trace contains an initial 97px DOM displacement while the closing editor covers the complete affected region. The 14ms and 28ms painted captures retain that occlusion. At the end of the outro, the footer measures 793.2px at 412ms and 793.3px at 431ms; the earlier visible 117px jump is gone. The populated dark footer moves through 658.7px, 702px, 737.4px, 765.4px and 787px rather than changing position once. Clipping makes the detector isolate its first 43px step.

Other retained candidates are intermediate eased crossfade alpha, a delayed heading wipe, translated sheet controls or hairlines crossing pixel coordinates, and a departing scrolled header being clipped during navigation. Scroll and Back traces contain no style candidates. The raw findings and their painted evidence remain available for review.

After that sweep, the persistent footer's entrance transition was removed. It did not participate in the first-save swap, but the screen contract correctly rejected its fade on a cold page. The sweep therefore predates this removal; the final lifecycle proof uses the source with that removal.

## Regression checks

`hair-removal-interaction-check` saves a backdated chin session, preserves its provider, saves a legs session in the current week and verifies both stored IDs. It checks expanded regions, scrolled position and opener focus after Back, then interrupts an opening editor with navigation and returns to the saved sessions.

The same check opens a draft and samples browser recovery for 450ms. All 112 sampled gate frames hide journal and editor content across light, dark, normal and reduced motion. Recovery retains the unsaved provider, stores no draft, releases inert and restores full opacity immediately. Painted casts and screenshots accompany those assertions. There were no page errors in the completed run.

The first final lifecycle attempt failed during development-server boot because a generated client module could not be fetched. Its error and report are retained. A rerun of unchanged source passed. There was no concurrent build or generated-output writer in this worktree. The guard duration records both attempts, 58.47s and 32.24s, excluding builds.

The shared week-label proof first failed the new incoming-alpha assertion, then passed for Cycle, dilation, Wear and hair removal in both themes. It also checks date selection, focus, reduced motion, 195px and 760px containers, and 48px controls. The recency and entry gallery covers English and Polish, all eight palettes, both themes and 200% zoom.

The earlier full Node run reported 7,539 passes and two failures introduced by this change: the cold-page footer fade and the missing guard registry entry. Both were fixed. That failed log remains available. Main's latest CI run was checked directly and was successful: `38136777462`, on 11 October 2026.

## Android

The native fixture uses the separate package `dev.engender.app.tester10`. Its namespace and activity remain `dev.engender.app`. The original journal package is not cleared, installed over or used for fixtures.

The final demo bundle was built after the footer cleanup and latest integration, then copied with Capacitor sync into an isolated Android shadow project. The shadow's old public assets were retained separately before copying the current bundle. `native-apk-final.json` records the APK hash, web release and source head. The earlier APK is retained as `app-tester10-pre-footer.apk` and is not the final-source acceptance build.

The native empty-state sweep measured all 12 requested actions, six per theme, with no failed or missing action and no page errors. It retained 59 style candidates and 14 pixel candidates. The initial 97px save displacement is under the closing sheet; later footer positions continue through the reveal. Sheet controls continue sliding out while ancestor clipping removes their neighbouring samples. Painted captures and raw samples are retained under `hair-removal-motion/native-empty/`.

The populated native lifecycle proof is still pending at this review checkpoint. Its first attempt saved a session, then timed out in the WebView's `Page.captureScreenshot` call. That attempt and its successful save cast are retained. The evidence driver now captures stationary screenshots through the same compositor screencast transport used by the shared native sweep.

Integration `d249dce69619e11125bee27872a76d7567151657` was merged after building the APK. It adds the shared visually hidden save status. The installed native build is labeled with its earlier source; no claim is made that its binary includes that later change.

## Final gate results and remaining native scope

The reviewed implementation checkpoint is `9a2b238e49275797616e34bcbfc04bd38efaf7ae`. Standards and Spec reviews reported no code findings. Its production build passed. Svelte check reported zero errors and warnings. All 7,541 Node tests passed across 580 files. Copy, licence and screen-class checks passed. The first-load payload was 104 files and 251,066B gzip, within the 251,272B budget.

Integration `4796a6030195a37fdadb557f0e63570d7c46fde8` was then merged. Both the hair-removal lifecycle guard and the hair-progress photo-action guard remain registered with their own timing sources. The only merge conflict was those two additions to the timing source map. The affected roster, screen-contract and reveal tests passed again, 114 tests in total. The reviewed production changes did not change during this refresh.

Native populated-session and lifecycle acceptance remains open. A read-only foreground check found `dev.engender.app.ticket08` active while the tester10 fixture was backgrounded. The user had resumed that separate profiling task. Its activity explains why the fixture's screenshot call and later Save attempt did not complete. Those attempts are preserved and excluded from measured acceptance. Device retries stopped at the parent's request; the original journal was not touched. The tester10 package remains installed for a later exclusive-device run.

The completed native empty sweep is still valid evidence for its 12 measured actions. Its initial saved-footer movement and departing sheet controls were inspected in painted captures. Other native pixel candidates remain available for final visual review, as recorded in `native-empty/classification.json`. No claim is made that all Android acceptance is complete.


## Native completion after exclusive phone access

This section supersedes the native acceptance gaps above. The final APK was rebuilt from clean source `c7a16eb799d691477a483da7ed7dae383b8ec403`, after merging reviewed integration `7cbf2882377d8d3573b90dbdce2995fd844b6ca6`. It includes the shared save status. `hair-removal-motion/native-apk-complete.json` records SHA256 `f0e11d61cdefb7e7baac4845d8c787f26483363b2e79a32785151f528fa8ed20`, release `0.0.0-dev+gc7a16eb7` and build `1791762233378`. The installed release was asserted against that build before measuring. Earlier native captures retain their earlier APK labels.

All four light/dark and normal/reduced-motion profiles passed populated saves, expanded regions, Android Back with exact scroll and opener focus, background/resume retention of an unsaved provider, and interrupted navigation. Sixteen casts retain 424 painted frames. The actual native immediate-PIN resume gate passed with zero visible journal, editor or navigation in all 49 sampled resumed frames; its cast retains another 16 painted frames. No page errors occurred. The isolated fixture was unlocked and left on `/more`, and the phone was released for the remaining tickets. The original journal was not touched.

The saved empty-state review inspected all 59 style and 14 pixel candidates across all 12 measured actions. No confirmed code defect or unresolved candidate remains. The Sessions heading reveal matches the documented `kit-rule-in` clipping animation. A mistaken dark-save screenshot mismatch was corrected by byte comparison with the Hair removal cast frames. All 896 frozen raw files remain unchanged, and no detector threshold changed. `native-empty/classification.json` and both reviewer reports retain the candidate classifications.

Runner failures remain available rather than being erased: DOM `.click()` did not focus its launcher, touch input initially used moving or covered geometry, and native PIN setup opened the gate instead of remaining on settings. The completed four-profile result entries precede that last helper failure. `native-interaction-complete/report.json` combines those passed profiles with `native-gate-complete/report.json`, which closes the actual native gate check. `native-completion.md` records the full evidence and phone handoff. The original populated and lifecycle gaps are closed. The final APK did not repeat first empty save: its isolated journal retained earlier fixture sessions. The four ticket 10 production hashes match the final recorded source, but the earlier empty APK predates the shared visually hidden RecordSheet save-status addition. A brief final-source empty-save confirmation remains advisable before claiming that every native action used the final APK. It can join the remaining empty-device sweep after ticket 11; the phone was not retaken. The refreshed source passed 92 affected tests; no production code changed during completion.

## Final-source first empty save

The remaining empty-save confirmation passed on the same clean-source `c7a16eb7` APK in light theme with normal motion. The isolated journal started empty. Create and Save both passed their action postconditions; exactly one chin session was stored. Its provider survived returning through More and reopening the session. The shared visually hidden save-status element existed and remained at 1px or less. No page errors occurred.

`hair-removal-motion/native-empty-final/` retains 22 create frames, 27 save frames and their 73 and 78 layout samples. All 49 painted frames and all 20 saved style candidates were inspected. The candidates resolve to layout behind the closing sheet or the sheet's own travel and clipping. No confirmed code defect remains. The earlier pixel sweep was not repeated; its evidence and thresholds remain unchanged. The preparation failure caused by Home's continuous breathe animations is retained with its diagnostic. Preparation now waits for finite animations; the action sampler was unchanged.

This closes the final-source first-empty-save gap described above. Tester10 was released unlocked on `/more` with PIN `1111`, immediate locking and no debugger forward. Tester11 and the original journal were not changed. Integration `6ce68ed680c628e75ed33c66e05e9819e7233c6f` added only ticket metadata and first-load budget values after the APK source. The refreshed roster, reveal, screen-class and budget tests passed, 121 tests across four files. No production code changed during this confirmation.
