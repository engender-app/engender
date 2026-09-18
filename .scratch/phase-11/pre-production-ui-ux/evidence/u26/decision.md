# Today writing comparison

Retain the current layout. The compact agenda trial saves 24px on a busy day but does not expose the mood choices while a timer is running. Moving the pin editor cannot shorten the content above writing: it already follows the pinned rows. Neither option justifies a production layout change.

## Task and comparison

Captured on 18 September 2026 at commit `947f142f`, using a demo build in Chromium at 390×844, trans light. The task was to start writing today's entry from the top of Today. This is an implementation comparison, not a timed study with participants.

The trial reduced agenda row vertical padding from 8px to 4px and adjusted its heading spacing. Date blocks retain their 48px height. The script injects CSS into the browser only; no production file changes. Timer content, Stop, agenda items, fold, notices, and pins remain intact. The audit's recap-first and stock-photo reference directions were excluded.

| State | Baseline mood strip top | Compact strip top | Result |
| --- | ---: | ---: | --- |
| Empty journal | 325.5px | 325.5px | Mood choices visible; no agenda to compress |
| Busy agenda, no timer | 688.9px | 664.9px | 24px recovered; labels fit more comfortably |
| Busy agenda and running timer | 831.3px | 807.3px | Choices still below navigation |
| Return after five weeks, then Today | 872px | 840px | 32px recovered; choices still below navigation |

The fixed Quick add stays at y=777–833 in every capture. Clicking it and then the middle mood opened `/entry/new/today?seedMood=3` without scrolling in the busy timer scene. The baseline and trial therefore offer the same two-tap writing path. The on-page mood strip also starts writing after scrolling; empty journals expose it immediately. The trial makes the no-timer case slightly easier to scan but does not solve the timer case that motivated this ticket.

The running timer stays at y=258.1–380.5, with Stop visible. After the gap, its longer caution line extends it to y=399.2. Every measured scene preserves the same pin sequence: Measurements and sizes, Care, Milestones, Tryouts. Return-after-gap still opens its own review before Today; the empty fixture removes journal records while preserving those chosen pins.

## Screenshots

Each pair shows the unchanged baseline and the rejected compact proposal. The chosen result is the baseline, so there is no separate altered production screenshot.

| State | Before / retained | Compact proposal |
| --- | --- | --- |
| Empty | [Baseline](baseline-empty.png) | [Trial](compact-empty.png) |
| Busy agenda | [Baseline](baseline-busy.png) | [Trial](compact-busy.png) |
| Running timer | [Baseline](baseline-timer.png) | [Trial](compact-timer.png) |
| Today after gap | [Baseline](baseline-return.png) | [Trial](compact-return.png) |

[Return review](return-after-gap.png) shows the intervening screen. [Raw measurements](metrics.json) and [capture script](compare.mjs) retain the experiment. Run `VITE_DEMO=1 npm run build`, then `node .scratch/phase-11/pre-production-ui-ux/evidence/u26/compare.mjs` from the repository root. This overwrites the evidence with current demo dates.

## Verification

- Demo build passed after fetching the fresh worktree's Paraglide plugin; typecheck passed with zero errors and warnings.
- Existing Today tests passed: 43/43 in `tests/home-surfaces.test.ts`.
- Full suite: 5819 passed, 12 failed across 6 files. Two `release-switch` failures were sandbox-related; its focused unrestricted rerun passed 5/5. The remaining failures concern calendar source assertions, radius rules, flat-colour rules, motion assertions, and the app-opening mock's missing `style.setProperty`.
- No application or test implementation changed before that suite ran. These failures occur on the ticket's unchanged starting tree. Main's latest CI, run `35211085801`, also failed, but its browser failures are not evidence that these exact Node failures occurred in CI.
- Svelte analyzer reviewed the unchanged Today component and suggested existing effect refactors. No effect or state ownership changes belong to this retain decision.

No new data-model or spacing tests were added. This decision does not claim participant testing, a new accessibility audit, native-device verification, or new palette/locale/zoom coverage. Those surfaces are unchanged. The remaining tradeoff is explicit: the inline mood strip needs scrolling on busy timer days, while fixed Quick add remains available.

## Review

Standards review found no blockers and suggested formatting the capture script; that cleanup is applied. Spec review found no missing requirements or scope expansion. Both reviews used `git diff main...HEAD` against main at `d8da8389`. Today's route, Quick add, and navigation were unchanged between the captured baseline and that main tip.
