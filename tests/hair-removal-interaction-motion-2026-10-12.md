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
