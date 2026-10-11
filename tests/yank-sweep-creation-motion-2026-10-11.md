# Creation and return motion measurements, 11 October 2026

Ticket 09 extends the shared web and Android scene table. Hair removal and
letters now include saves, cancellation, populated scrolling and returns.
Two further scenes enter Letters from a scrolled Transition screen and
measure Back to that source position. Missing controls, wrong routes,
unchanged saves and incomplete scroll actions fail the sweep.

The before captures use Chromium 154.0.8037.57 at 390x844, light and dark,
with empty and Alice persona journals. The app release is
`0.0.0-dev+g6d09bcc4.dirty`, build `1791743917450`, schema 88. Harness changes
were present when this build was made; production screen code was unchanged.

Evidence remains at the project root under
`.claude/phase-15-tester-report-01-delivery/evidence/09/`. Every measured
scene keeps its complete compositor PNG sequence, absolute frame times and
DOM/view-transition samples. No detector thresholds changed.

| Directory | Measured/requested | Painted frames | DOM samples |
| --- | --- | --- | --- |
| `web-before-phone-final` | 92/92 | 3109 | 6194 |
| `web-before-scrolled-transition` | 12/12 | 563 | 801 |
| `web-empty-isolation` | 14/14 | 509 | 933 |
| `web-onboarding-regression` | 4/4 | 284 | 265 |

All four runs have zero failed or missing scenes. The first matrix repeats
each scene twice per theme. Its empty saves restore the journal per repeat;
its empty cancel/back paths initially inherited the preceding save. The
isolation run replaces those empty create/cancel/back measurements with a
fresh empty journal before every flow. The final harness applies that reset
to all named empty flows. The initial 23-scene smoke run also remains in
`web-before-phone` as historical evidence.

Each proof run detected all six injected defects and retained painted
evidence. The synthetic findings are classified separately from product
candidates. Pure populated scrolling produced no style or render findings.

The following classifications come from the retained samples and frames:

| Finding | Classification and evidence |
| --- | --- |
| Empty Hair removal save | Confirmed painted jump. Finishing/pausing rows disappear together after the save, and the area notice and recency list move 155px in one frame. Initial smoke cast frames `026-421ms.png`, `027-438ms.png`, `028-454ms.png` show the change. The repeated matrix records the same family in all four empty saves. Preserve for ticket 10. |
| Empty letter save | Confirmed painted jump, separate from ticket 11. Waiting heading and sealed card move 42px in one frame. Initial smoke cast frames `024-389ms.png`, `025-403ms.png`, `026-416ms.png` show the shift. All four repeated empty saves contain this family. |
| Populated saves | Smaller recency and letter-heading candidates remain for review. Repeated Hair removal saves have 10 style candidates; letters have six. Counts represent marks and repetitions, not separate defects. |
| Opening record sheets | Raster dropout candidates include the intended moving sheet and background blur. Inspected Hair removal triples retain the background text while blurring it. These counts do not establish disappearance defects. |
| Letters reading close and scrolled-feature returns | Number-arrival and raster-dropout candidates remain unconfirmed. Keep their casts; do not convert their counts into product defects. |
| Scrolled Transition into Letters and Back | Reported pair of jumps not reproduced on web. All eight product scenes have zero style/render findings. Back restores 491px in the persona and 519px in the empty journal, in both themes. Preserve this baseline for ticket 11. |

Physical Android acceptance remains unmet. `adb devices -l` returned no
devices. `physical-android-excluded.json` records 54 requested scene/profile/
theme combinations as excluded, zero measured, and no device or version.
The device runner records model, Android/SDK version, WebView user agent,
dimensions and app release when hardware is available. Shared contracts and
web evidence do not substitute for a physical run. Desktop-width web,
reduced motion, interrupted navigation and gate replacement were not part of
this ticket's run; repair tickets own their additional checks.

Verification: offline dependency installation, demo build, targeted sweep
contracts and typecheck passed. One intermediate full Node run failed the
audio polling timing ratio at 0.2ms versus 0.8ms; its targeted rerun passed.
Raw results remain in `node-tests.log` and `node-tests-final.log`.

Integration ticket 04 is merged at `ca9f45a8`; the retained before captures
remain tied to their original app release. Final integration checks are
recorded separately so rebuilding cannot overwrite the before evidence.
The integrated demo build is `0.0.0-dev+gca9f45a8`, schema 89. Build and
typecheck pass; the final Node run passes 579 files and 7528 tests
(`build-integrated.log`, `node-tests-integrated.log`).
`web-integrated-smoke` measures five empty-profile light scenes with no
failed or missing runs. The proof still passes, both save jumps remain, and
scrolled Transition entry and Back retain zero detector findings.
