# Ticket 110 evidence

The reviewed candidate was refreshed with delivery `bf8f76ee`. [Delivery refresh evidence](delivery-bf8f76ee/README.md) records the preserved review commit, combined source SHA and post-build checks. Root filed the separate narrow-layout finding below as ticket 117.

Base: `9b392184146966110982e8c89fc819263a393f50`. The final product change imports `collapse` and attaches it to Settings' conditional automatic Cycle tracking explanation. The preference rule, switch handler, accessible label and catalogue strings are unchanged.

The explanation previously had no transition. Saving an explicit choice removed its block span during the DOM flush, shortening the row immediately. The shared `collapse` transition now masks and fades that span while returning its height through the existing 380ms motion contract. Reduced motion still uses the contract's immediate state change.

## Before and after

All casts retain every compositor frame received, with frame index and milliseconds in filenames and `frames.json`. Geometry samples are retained beside them. The focused probe uses a fresh journal context for each theme and motion preference. `raw-logs.tar.gz` retains the original terminal logs; readable `.log` copies normalize trailing whitespace and blank lines at EOF only.

| Run | Light | Dark |
| --- | --- | --- |
| Exact clean-base focused probe | 29.50px downstream step, no intermediate heights | 29.50px downstream step, no intermediate heights |
| Final focused probe | 11.30px largest step, 13 intermediate heights | 11.30px largest step, 13 intermediate heights |
| Original sweep, fresh before | 23 style findings | 26 style findings |
| Original sweep, fresh final | 0 style / 0 render findings | 0 style / 0 render findings |

The final original sweeps each sampled 67 style frames and retained 22 painted frames. Measurement units and Reminders & prompts move by the same amount in the focused samples. Scroll remains 1456 throughout the final normal and reduced-motion samples. Both reduced-motion controls retain the intentional 29.50px cut and no intermediate heights.

The final focused runner fails on the exact clean base and passes on the candidate. It checks the disappearance independently through intermediate heights, plus downstream travel against the existing sweep's `TELEPORT_PX` constant. No sweep thresholds were changed.

Paired focused casts and reports:

- [Clean-base report](focused-clean-base/report.json), [light frames](focused-clean-base/cycle-explanation-light-cast/frames.json), [dark frames](focused-clean-base/cycle-explanation-dark-cast/frames.json).
- [Final report](focused-final/report.json), [light frames](focused-final/cycle-explanation-light-cast/frames.json), [dark frames](focused-final/cycle-explanation-dark-cast/frames.json).
- [Original light before](before/report.json), [original fresh dark before](before-dark-fresh/report.json), [final light](final-light/report.json), [final dark](final-dark/report.json).

Painted review: the original light frame 000 at 0ms shows the explanation; frame 001 at 37ms has removed it and moved the following content. The original fresh dark pair is 000 at 0ms and 001 at 26ms. Final light frames 001 at 36ms and 003 at 65ms, and final dark frames 001 at 30ms and 003 at 61ms, show the mask progressing with the following rows.

## Retained intermediate findings

The first combined original sweep reused the saved explicit preference for its dark pass. That pass did not test automatic explanation withdrawal. A separate fresh dark sweep, and the final separately launched theme sweeps, correct that coverage.

The first implementation used `disclose`. Its painted mask progressed, but the original sampler reported one final opacity-1 disappearance. The final implementation uses `collapse`, which adds the established closing fade. Both final original sweeps have no remaining findings. The rejected implementation's casts and reports remain under `after/` and `focused-after/`.

The initial focused probe guessed a 15px step ceiling, which rejected `disclose`'s 16.94px first step despite its intermediate heights. The final probe uses the existing sweep constant instead of inventing a second threshold. The exact clean-base rerun confirms that the final probe still rejects the original defect. Its earlier scroll field used the wrong container; the final probe reads `.app-main`. Those earlier reports remain unchanged under `focused-before/`.

## Verification and cleanup

Enter changes the switch, focus remains on it, reload retains the explicit choice, and Space reverses the choice without restoring the automatic explanation. The shared visibility arithmetic and preference tests pass in the full Node suite.

- Final demo build: passed, `build-final.log`.
- Warning-failing typecheck: 0 errors and 0 warnings, `check-final.log`.
- Full Node suite: 565 files, 7,314 tests passed, `node-complete.log`.
- Focused arithmetic, motion, Settings and probe-roster checks: 114 tests passed, `relevant.log`.
- Copy, screen classes and licences: passed, `guard-*.log`.
- First-load-budget command recorded the demo-build exemption; this is not a production budget sign-off.
- Svelte autofixer findings concern the unchanged manage-tags link and existing effects, outside this two-line product diff.

The two initial Node runs failed only because the new probe needed registration, then because its registration was placed in the CI guard table rather than the manually run probe list. The final registration and full suite pass. Their failure logs are preserved.

All owned servers and browsers were stopped. The clean detached baseline worktree was removed after checking its Git status. The implementation worktree remains for review and integration. Root owns fresh Luna Standards and Spec review dispatch; ticket status and integration were not edited here.

## Impeccable audit and polish

This is a refinement of the existing Settings surface. The source audit followed the adaptive playbook; painted checks cover the browser bundle only. No phone or emulator was used.

| Dimension | Score | Evidence |
| --- | --- | --- |
| Accessibility | 4/4 | Named switch, Enter/Space, retained focus, 48px square target, reduced-motion control |
| Performance | 4/4 | Existing bounded height/fade primitive, no dependency, both final sweeps clear |
| Theming | 4/4 | Existing tokens and catalogue text, paired light/dark painted review, palette tests in Node suite |
| Implementation integrity | 4/4 | Two-line product diff, no new preference or local animation implementation |
| Adaptivity | 3/4 | 390px and 780px captures clear; independently confirmed 195px overflow below |

Score: 19/20 within this browser-side scope. No remaining motion finding belongs to ticket 110. The polish pass reviewed the paired final casts and keyboard captures, retained the established closing fade, and required no further product changes.

### Separate narrow-layout finding

At 195px, Settings' Theme segmented control clips the Dark option. The control is 212.125px wide while `.app-main` has 185px of content width. Before programmatic horizontal scrolling, the control's right edge is 232.125px and `.app-main.scrollWidth` is 232px. The Measurement units text also has a 152.80px `max-content` floor inside a 145px row. These dimensions match on the exact clean base and candidate in both themes.

[Clean-base geometry](narrow-layout/clean-base.json) and [candidate geometry](narrow-layout/candidate-final.json) identify the overflowing elements. [Visible Theme geometry](narrow-layout/theme-overflow.json) accompanies paired `*-theme-195px.png` screenshots. The visible Theme captures also show that programmatic scrolling can shift the control left without fitting it; Dark remains clipped.

Suggested separate P2 carpet ticket: keep Settings' Theme segments and measurement-unit title within the narrow layout. The ticket 110 product diff does not alter their resting layout. No speculative layout change was added here.
