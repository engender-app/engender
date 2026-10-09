# Verification tiers

What each check answers, what it needs to run, and what fails on a clean
checkout today so a failure can be attributed correctly. Written for
phase 5 audit ticket 06 ("the suite reports what it actually ran"); update
the known-failure lists as they change rather than trusting them forever -
each entry below names the date it was last confirmed.

## Node tier — `npm test`

Plain `vitest run`, no build step, no generated code on disk: the fastest
tier and the one to run on every change (~4s for 2391 tests as of this
ticket). Per ADR-0016, nothing here may
import `$lib/paraglide/runtime` or anything that pulls it in - a module
that needs a locale binds it at the presentation layer instead, so the
arithmetic underneath stays reachable from this tier.

Answers: whether the data layer, domain logic and Svelte-free arithmetic
are correct. Cannot answer anything that needs a real browser (OPFS,
WebCrypto, canvas) or a real Android runtime - see the tiers below.

**Known failures (confirmed 2026-08-27, clean checkout):** `csp.test.ts`'s
four tests fail with `No build/index.html. Run npm run build first` unless
a build already exists at `build/` - not a bug, just a tier that needs a
build artifact present. Run `npm run build` once, or accept these four as
expected noise when running the tier in isolation.

**Also confirmed 2026-09-28 on untouched `main` at `c754e251`:**
`src/lib/motion/reveal.test.ts` has two tier-3 failures because its fake
element has no `hasAttribute` method. The full ticket-36 run had 6386
passing tests and these same two failures after a build; the walkthrough
locator gate passed.

## Browser tier — `npm run test:browser`

`svelte-kit sync && node tests/browser-tier/run.mjs`: serves the probe
pages under `tests/browser-tier/` on a throwaway dev server and drives them
through headless Chromium with Playwright. Set `CHROMIUM_PATH` if
`/usr/bin/chromium-browser` isn't where Chromium lives on this machine.

Answers what the Node tier structurally cannot: the production encrypted
driver against real OPFS, the real sqlite3mc driver and its window functions, WebCrypto, `<canvas>`
photo/video processing, service-worker update lifecycles, and the touch-
target/press-depth geometry of the control kit, measured rather than
assumed. Rendered screen contracts use `mountScreen(route, fixture)` with a
seeded encrypted journal and the real Home, Calendar and Settings components.
Their assertions inspect markup, computed styles and interactions, including
loading gates with held reads. The runner enforces each suite's check count
and repeats narrow layout checks at a 230px viewport. 16 probe pages, 165 checks as of phase 8 features ticket 55,
~30s end to end - the newest of them draws a PDF page and counts the ink
on it, which is how the standard fonts on this origin are checked.

Each check group runs through `createReporter().block(label, expected,
fn)` (`tests/browser-harness.mjs`): if `fn` throws partway through, or
just runs fewer `ok()`/`fail()` calls than `expected`, the shortfall is
reported by name - "ran 3 of 12 checks, the rest never ran" - rather than
silently passing over whatever never ran. `load(path, name)` also races
`page.on('pageerror')` against the ready-attribute wait, so a probe that
throws on import (a module reaching `$state` without the Svelte plugin,
for instance) fails immediately with the thrown error's own text, tagged
to the probe that was loading, instead of a 30-second anonymous timeout.
Verified by breaking `driver-probe.ts`'s import on purpose during this
ticket and reverting it once confirmed.

**Known failures:** none, on a clean checkout as of this ticket (159/159).

## Walkthrough — `npm run test:walkthrough`

`node scripts/prepare-vendor-assets.mjs && ENGENDER_VERSION=9.9.9-walkthrough VITE_DEMO=1 npm run build && node tests/walkthrough.test.mjs`.
Builds the real production bundle with the demo bar compiled in, serves it
with `vite preview`, and drives 130 flows through the actual app UI in one
continuous session - not probe pages, the screens themselves.

Answers whether a real user flow (onboarding, logging an entry, search,
archive export/import, PIN lock, wrapped, ...) works end to end against
the built app. `pageerror`s are collected through the whole run rather
than attributed per flow (`tests/walkthrough.test.mjs:25-26`) and reported
once at the end as `no uncaught page errors` - coarser than the browser
tier's per-probe attribution, and deliberately so: this is one continuous
page across every flow, not 15 independent page loads, so there is no
natural per-check boundary to attribute an error to. A flow's own
selector-timeout failure is usually the more specific signal anyway.

**Fixture failures from the 2026-09-21 audit, resolved 2026-09-29:**

1. `wrapped`: the month containing the entries shaded no days in the audit.
   This flow passed on 2026-09-29.
2. `compare two periods`: one picked period had zero entries in the audit.
   This flow passed on 2026-09-29.
3. `journal book`: the audit's short fixture printed as 1.3 viewports.
   Earlier flows left the shared journal empty. The flow now reseeds it,
   opens the preview, and checks that `beforeprint` loads every entry batch.
   It passed on 2026-09-29.

The 2026-09-29 full walkthrough passed all 130 flows. On untouched `main` at
`c754e251`, the map flow failed:
the two left sites were 49.9px apart, below the required 56px. The drawing
needed more room, so ticket 36 kept the map 320px wide inside a 320px sheet.
The same baseline failed after undisguising because the flow expected
`/favicon-trans.svg` but got `/favicon-lesbian.svg`. Earlier flows can change
the palette, so ticket 36 checks the icon against the selected palette. Both
flows passed in the ticket-36 full run, including the map at 320px.

These checks share one SQLite journal; `fresh()` clears localStorage and
reloads, but does not reseed the journal after a reset or import. Recheck the
set on every run.

Attributing a walkthrough failure needs a second run on untouched `main`, and
`main` is usually checked out nowhere: `git worktree add --detach
.claude/worktrees/main-walkthrough main`, symlink the ticket worktree's
`node_modules` into it, then run `npm run test:walkthrough`. Its build
generates the SvelteKit and Paraglide files. The runner asks Vite for an
available port; sequential runs
avoid browser and build contention.

Running a single flow fast by skipping the `npm run build` chain (a direct
`node tests/walkthrough.test.mjs` after only `npx svelte-kit sync`) dies
silently around flow 36 instead - a different trap, not a real failure.

## Long-journal benchmark — `npm run benchmark:long-journal`

Compiles the message catalogues into `src/lib/paraglide`, then runs
`svelte-kit sync && node tests/long-journal/run.mjs`. The real Home mount
needs those generated modules even when no app build has run. Generates a
ten-year, ~3300-entry journal with ~400MB of photos inside a real browser
(encrypted driver, encrypted photo store) and times 37 named operations
against it - boot, calendar, search, stats, archive export/import, and so
on. ~45 seconds, mostly spent writing the fixture. A separate CI job from
the correctness tiers on purpose: it gates on timing, not correctness, so
a timing wobble shouldn't turn the correctness suite red, and it costs
nothing extra in wall clock run concurrently.

`--record` mode prints re-baselined `budgets.json` entries instead of
gating, for re-baselining on new hardware.

The gate (`tests/long-journal/budgets.mjs`'s `budgetFor`): `budgetMs =
min(max(5 * baselineMs, 200ms floor), targetMs)`. The floor absorbs
run-to-run wobble on a fast measurement; the target ceiling means a
near-zero baseline can never leave the gate looser than what a person can
actually wait for - before this ticket, `budgetMs` had no ceiling, so 27
of 37 measurements sat at the 200ms floor regardless of target, several
against a target *under* 200ms (`calendar-month`: 9ms baseline, 100ms
target, previously a 200ms budget - a regression could double the target
and still pass). `overTarget()` separately reports any measurement whose
*baseline* is already past its target - a release problem, not something
this benchmark fixes.

Answers whether the app's real cost at ten years of data stays inside
what a person can wait for. Cannot say anything about a device's actual
hardware - the Android emulators both run with `hw.gpu.enabled=no`, so no
rendering-performance question can be asked there either; that needs a
real phone.

There is a second, unrelated "long-journal" name: `npm run test`'s
`tests/long-journal/measure.test.ts` is the harness's own node-tier unit
tests (four months of fixture over `node:sqlite`, not the ten-year browser
run) - a ~50 second desktop suite, not this 21-minute-class benchmark.

This runner forwards `pageerror` too, converging with the browser tier: a
module that throws on import fails by name rather than running out this
runner's 5-minute timeout (longer than the browser tier's 30s default,
since the ten-year fixture takes a while to generate - so the case for
converging is stronger here, not weaker). `walkthrough.test.mjs` is the
one runner that keeps a different policy - see the Walkthrough section
above for why.

**Known failures:** none as of this ticket - every measurement passes
its budget.

## Android tier — `npm run test:android`

Needs a real Android runtime: two emulators (API 26 and current, override
with `ANDROID_TIER_AVDS=name1,name2`), JDK 21 (`JAVA_HOME`), and
`ANDROID_HOME`/`ANDROID_SDK_ROOT`. `ANDROID_TIER_HEADLESS=1` runs
emulators without a window - except the `tracker35` AVD, which segfaults
under `-no-window` and must boot windowed. Builds the instrumentation
probe bundles the on-device tests serve, brings the emulators up, and
turns the instrumentation output into PASS/FAIL lines.

Answers what neither the Node nor browser tier can: whether the shipped
native SQLite build actually has FTS5 and window functions (framework
SQLite on API 35 has neither, one of two reasons the journal ships
SQLCipher - ADR-0020), Android Keystore's data-key authorization model,
and cross-platform archive round-trips through one probe that boots both
the web and Android storage stacks. The native checks run on both
emulators; the WebView-dependent suites (contract, encryption claim) run
only on the current one, since the API 26 image ships a 2018 WebView with
no OPFS and the app cannot start there at all.

Probe bundles under `probe/`, `encryption-probe/`, `archive-cross-probe/`
are gitignored build artifacts - a fresh worktree has none, and the
affected tests fail with `FileNotFoundException: probe` until built:
`for p in contract encryption archive; do ANDROID_TIER_PROBE=$p npx vite build --config tests/android-tier/android-tier.vite.config.ts; done`.
Run one instrumentation class per invocation for clean attribution -
`JournalContractTest`'s leftover `contract-probe-photos` file fails
`AndroidEncryptionClaimTest` if both run in the same gradle invocation.
`adb uninstall`/`pm clear` and `run-as` for reading app state may not work
depending on the device (confirmed unavailable on a GrapheneOS phone).

**Known failures (confirmed 2026-08-27 on a Pixel 10a, Android 17, GrapheneOS -
device-specific, re-check on whatever hardware is actually available):**

- The JVM unit suite (`./gradlew :app:testDebugUnitTest`, not the
  instrumentation tests above): `ReminderPlannerTest.everyNDaysUsesItsAnchorProgression`
  fails on a clean checkout (`nextReminder`'s `EVERY_N_DAYS` branch produces
  `2026-08-14T20:00+02:00` where the test expects `2026-08-16T20:00+02:00`),
  confirmed since `f50d3db`. Looks like a real bug in the anchor-progression
  arithmetic, or a wrong test expectation - owned by ticket 05, not this one.
- `DisguiseAliasTest.mainActivityIsExcludedFromRecents` contradicts the
  manifest and `tests/android-manifest-recents.test.ts` outright (a later
  ticket reversed the Recents-exclusion decision and left this test behind).
  Unticketed.
- `ArchiveCrossPlatformRoundTripTest` fails creating a photo directory under
  `/data/user/0/.../files/` - the export path has no on-device evidence yet.

## `npm run verify:build`

`node scripts/prepare-vendor-assets.mjs && npm run build && node tests/browser-tier/verify-build.mjs`.
Drives the actual built, installed PWA through cold install, offline
start, an update, and a wrong-then-right PIN - what `test:walkthrough`
can't, since that serves a fresh build every time rather than simulating
an already-installed one.

**Known failures (confirmed 2026-08-27):** the "install and offline
start" step fails with an anonymous `locator.click: Timeout 30000ms
exceeded` - a dead selector. A selector that no longer matches anything
fails this way across every browser-driven tier, not just this one - the
timeout carries no indication of which element or why. Everything before
it passes (9 PASS first).

**That step passes again as of 2026-09-06** (phase 8 features ticket 55's
run): install, offline start, the nested-route start and the offline OCR
load all pass, and the whole release is in the shell at 9.07 MB of the
15 MB ceiling. One trap worth knowing instead: the About-version check
compares the version the app was built with against the version resolved
when the check runs, so committing anything while the run is in flight
fails it with two different `g<sha>` strings and nothing wrong with the
build.

## Browser capability matrix

`npm run verify:capabilities` runs the production checks in Chromium,
Firefox and automated WebKit. Build first, then run
`npm run verify:capabilities:lifecycle` against the same production build
for the existing actual BFCache guard. Both runs write per-engine results and raw logs under
`.claude/browser-capabilities/`; failed or unavailable cases remain visible.
See [browser capabilities](../browser-capabilities.md) for executable
selection, fault boundaries and evidence limits. Actual Safari and iOS PWA
remain unverified. Apple hardware is not a prerequisite.

## `npm run verify:hosting`

Boots the real nginx config from `deploy/nginx` in a container with a
built app mounted, and checks headers, cache policy, SPA fallback, release
metadata, and a cold install followed by an offline start against it.
Needs a container runtime. Not run as part of this ticket's verification;
no current known-failure list recorded.

## Galleries — `npm run gallery:*`

The human sign-off surface for UI work: scripts under `tests/` that
screenshot a component or screen across every palette/theme combination it
can be seen in, for the round of visual review a diff alone can't stand in
for. Each writes to its own gitignored, durable `.claude/*-shots/` directory
rather than the session scratchpad. The table below is not the whole set -
several tickets have added one since, and `ls tests/*-gallery.mjs` is the
list that cannot go stale.

| script | needs a build first | writes to |
| --- | --- | --- |
| `gallery:icons` | no | `.claude/icon-shots/` |
| `gallery:mood` | no | `.claude/mood-shots/` |
| `gallery:controls` | no | `.claude/control-shots/` |
| `gallery:kit` | no | `.claude/kit-shots/` |
| `gallery:scales` | yes (`VITE_DEMO=1`) | `.claude/scale-shots/` |
| `gallery:gates` | yes (`VITE_DEMO=1`) | `.claude/gate-shots/` |
| `gallery:dose-sheet` | yes (`VITE_DEMO=1`) | `.claude/dose-shots/` |
| `gallery:documents` | yes (`VITE_DEMO=1`) | `.claude/documents-shots/` |
| `gallery:in-the-room` | yes (`VITE_DEMO=1`) | `.claude/room-shots/` |
| `gallery:more-ia` | yes (`VITE_DEMO=1`) | `.claude/more-ia-shots/` |

The palette set every gallery iterates comes from `tests/palettes.mjs`'s
`PALETTES` export - the one place it's declared, as of this ticket.

**Known failures:** none - all six of the originals ran clean during the
ticket that wrote this section (24, 19, 16, 25, 82 and 32 shots
respectively, in the table's order). `gallery:more-ia` runs clean too, 12
shots, as of phase 9 carpet ticket 16: the More hub and the five screens
that host a row which left it, in both themes.

## Static checks

- `npm run check` (`svelte-check --tsconfig ./tsconfig.json --fail-on-warnings`,
  phase 9 audit ticket 07): Svelte and TypeScript diagnostics, warnings
  included in the exit code since this ticket - a warning nobody reads is a
  channel worth as little as no check at all, which is how this repo carried
  two "role=radiogroup must have a tabindex value" warnings past every green
  CI run before the ticket fixed the keyboard gap they were actually
  pointing at. **Passes clean, 0 warnings, as of phase 9 audit ticket 07.**
  If svelte-check raises a warning that's a genuine false positive (as
  `a11y_interactive_supports_focus` was for both radiogroups until they
  each got a real `tabindex="-1"`), fix what's actually wrong first; only
  reach for a `<!-- svelte-ignore <code> -->` comment naming the code and
  the reason once there's nothing left to fix. Don't drop
  `--fail-on-warnings` to get a warning off the board - that reopens the
  channel nobody reads.
- `npm run check:copy` (`scripts/check-copy.mjs`): both locale catalogues
  hold the same keys, no new user-facing string literal outside the
  paraglide catalogue beyond a known allowlist, and no Polish string uses a
  gendered verb form (`docs/ui-copy.md`'s rule - existing catalogue strings
  predate the rule and are grandfathered, don't copy their pattern into new
  strings). **Passes clean as of 2026-08-27.** If you've heard this fails
  against specific files, that's stale - trust a fresh run over any older
  note.
- `npm run check:licences` (`scripts/check-licences.mjs`) and
  `npm run check:progressive-release` (`scripts/check-progressive-release.mjs`,
  phase 2 ticket 22): not re-verified for this ticket.
