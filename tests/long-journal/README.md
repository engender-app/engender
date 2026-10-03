# Long-journal scaling gate

`npm run benchmark:long-journal` generates 365-day and 3,653-day journals
from the same seed and generator. Each fixture starts empty, closes after
generation, and reopens before measurement. Historical offsets shrink with
shorter spans while decade dates stay unchanged. Recent tracking stays inside
the fixture bounds; future letter unlock dates can remain in the future.
Every timing line reports the one-year time, ten-year time, their ratio,
and the existing absolute budget.
Both sizes also retain the statement and byte budgets for screen mounts.
`--record` reports both sizes but only records the ten-year absolute baseline;
it skips both budget and scaling failures, as it did for budget failures.

The growth limit is twice the actual entry-count ratio, calculated for each
run. The first desktop run on 4 October 2026 had 322 and 3,300 entries, a
10.25x size ratio, and 48 measurements. Its largest timing ratio was 7.44x
for hair progress (1.98ms to 14.73ms). The 20.50x limit leaves 2.75x room
over that observation for scheduling and sub-millisecond timing noise.
Quadratic work at these sizes should grow about 105x, which remains well
above the limit. Times use full precision for the gate; output rounds to
two decimal places. Missing, duplicate, zero, or nonfinite measurements
fail instead of disappearing from the comparison. Absolute budgets do not
change when selecting or recording this limit.

That first run took 86.7s, including 11.3s and 70s to generate the fixtures.
The two-size desktop benchmark stays below the roughly two-minute target.
With historical dates inside the one-year span, a later paired run takes
70.9s. Bounds and overlap tests verify that the one-year tryout detail reads
a full page of entries, and decade dates and counts keep their old values.
A scratch copy adds 100 arithmetic rounds per entry pair to the existing
whole-journal stats read. It grows 74.64x and fails the same 20.50x scaling
gate, as well as its unchanged 200ms absolute budget, in a 73.3s run. The
scratch code does not ship with the benchmark.

Android uses the same generator, measurements, and scaling policy. Its
instrumentation consumer logs both times beside native budgets, checks
both fixtures against recorded native budgets, and checks scaling even
when native absolute baselines are unrecorded. Separate database and photo
paths keep the fixtures apart. Cleanup removes both before the next run;
the existing origin snapshot still restores the app's keystore afterwards.
Device timings require a supported WebView and are separate from desktop
measurements. The native probe bundle and Java consumer can be compiled
without running the device benchmark.
