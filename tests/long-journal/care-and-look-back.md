# Care and Look back count investigation, 15 October 2026

The native long-journal benchmark reported Look back at 782,563 bytes against
181,295, and Care at 38,855 against 33,120. The first failure in its one-year
fixture stopped the assertion before the decade was checked. The collector now
reports both fixtures and scaling in one assertion; timing, statement and byte
checks still apply.

## Source and measurement boundaries

The physical comparison starts at backend integration `b43a81284`, schema 91.
Final source also includes ticket 10 at `a5e3e1c96`, which adds schema 92's
partial trash index. Node checks on schema 92 reproduce the same Care counts.
The physical device is
the Pixel 10a, Android 17/API 37, fingerprint
`google/stallion/stallion:17/CP3A.261005.005/2026100601:user/release-keys`, running
Vanadium WebView `155.0.8059.79.0`. The isolated debug package is
`dev.engender.app.test.ticket83`. No personal journal is involved.

Both fixtures use seed 1 and the existing generator and JPEG photo maker:
365 days with 322 entries, and 3,653 days with 3,300 entries. Each database
closes after generation and reopens before measurement. Each before/after pair
uses the same fixture. Care starts with a fresh read generation; Look back uses
`prepareMountedLookBack`, including reference hydration outside the measured
window and the fixture's final day for its default 30-day range.

The native recorder counts calls and returned JSON above the ordinary-read
cache. Desktop Look back instead counts messages below that cache at the worker
boundary. A repeated native recorder row can be a cached answer, so its count
must not be called a count of native bridge messages. Both recording locations
remain unchanged here. These are count measurements, not frame or latency
acceptance. A diagnostic animation-frame loop kept the WebView active during
part of this run to avoid the photo generator's known idle-encoder delay.
Another session's emulator was also running on the host.

## Care

The September source at `119e4c701` reproduces the recorded 30,109 bytes and
15 driver calls on Node's real SQLite. Current unchanged source returns 38,855
bytes and 15 calls. The 8,746-byte difference is fully accounted for:

| Owner or fixture change | Bytes |
| --- | ---: |
| Three automatic-slot provenance columns across 87 returned dose rows | +6,699 |
| Three additional dose rows in the slot/tolerance window, before provenance | +923 |
| Changed dose values in the otherwise matching recent window | +34 |
| Schedule IDs in batched weekday and dose-amount rows | +125 |
| A second schedule read used to establish slot tolerance | +921 |
| `doses_per_unit` on two stock rows | +44 |

Slot provenance and the wider window preserve dose coverage after edits and
zone changes. Batched schedule rows need their IDs, and stock needs its unit
conversion. These are intended data. The extra schedule read comes from the
slot-read API; changing that API is unnecessary to repair the duplicate dose
work identified here.

`readCare` previously asked `exposure.getCounters` to read the 90-day dose
window and episodes again. Its slot read already contains that entire window,
plus doses needed for tolerance and forward slots. Care now passes those rows
and episodes to the same `cumulativeDoseTotals` function used by exposure.
That function filters by logged timestamp before attributing drugs. Older or
future rows admitted through automatic-slot provenance do not leak into the
90-day total. Last-dose fallback and stock projection keep their existing
owners and behavior.

Three physical samples per fixture returned identical counts. Every before/after
pair also returned the same complete Care result:

| Fixture | Before calls / bytes | After calls / bytes |
| --- | ---: | ---: |
| 365 days | 15 / 32,639 | 13 / 18,670 |
| 3,653 days | 15 / 38,855 | 13 / 22,046 |

The reduction removes one dose-list request and one episode-list request.
The latter can already be served by the ordinary-read cache. The dose request
has a different range from the slot request and previously returned its own
35 or 42 rows. Node reproduces the same driver counts and bytes. Both Care
count baselines tighten to 13 calls and 22,046 bytes; the existing 10% rule
gives a 24,251-byte ceiling. Timing baselines and targets stay unchanged.

## Look back

The native baseline still described the old hand-written composition. Replaying
that composition on the September source reproduces exactly 69 calls and
164,813 bytes. It omitted Words and included cards the current door no longer
mounts. Ticket 78 replaced it with the shipped component and corrected the
desktop baseline, but left the native baseline behind.

The increase can be followed without treating the old and current fixtures as
the same workload:

| Step on the decade fixture | Calls | Bytes |
| --- | ---: | ---: |
| September source and synthetic composition | 69 | 164,813 |
| Current source and fixture, same synthetic composition | 55 | 189,888 |
| Current shipped Look back mount, including Words | 53 | 782,563 |

The middle step adds 25,179 bytes of dose provenance and 3,054 bytes of changed
dose rows/content, offset by 3,158 fewer bytes in the other legacy reads.
The mounted Words tile reads 2,949 notes, totaling 748,493 raw JSON bytes. The
remaining mounted reads return 34,070 bytes, 155,818 less than the synthetic
composition. Thus `164813 + 25179 + 3054 - 3158 + 748493 - 155818 = 782563`.
Words uses those note texts for whole-journal word analysis; they are intended
coverage, not an unnecessary column added by this repair.

The one-year mount returns 53 calls and 100,597 bytes. All three native samples
at each size agree. The native decade baseline now records 53 and 782,563, with
a 53-call ceiling and `ceil(782563 × 1.1) = 860820` bytes. Only these counts and
the description change; the 292 ms baseline, 1,460 ms timing budget and 500 ms
target remain unchanged.

Desktop's 46 calls and 781,035 bytes count below the cache. Native's seven extra
recorded calls are four repeated empty era answers, one repeated empty mute
answer, and two repeated mood-series answers. Their decade bytes are
`4 × 2 + 2 + 2 × 759 = 1528`, exactly the difference. They are cached answers,
not seven additional native bridge requests. The desktop Look back budget
remains unchanged, and this ticket changes no Look back query or component.

## Regression checks and limits

The new Care count test fails on the old read at both sizes: the one-year case
has an extra dose request, and the decade exceeds its original byte budget.
It also compares every lane's totals with the existing exposure result. Care
unit tests cover window endpoints, hidden historical episodes, moved automatic
rows, future doses, missing recent doses, drug spelling, stock and failures.
The test that waited for a separate exposure call now waits for the slot rows
that supply those totals.

The Android collector tests report time, statement and byte failures from both
sizes alongside scaling. A planted first-fixture return makes two tests fail;
removing it restores all three. Unknown budgets, missing counts and unrecorded
baseline handling retain their checks. Existing mounted-Words ownership tests
remain applicable and unchanged.

The physical probe exercises the affected reads only. It does not claim a full
native long-journal pass, Play DEX acceptance, or a release-artifact result.
The isolated packages, fixture files and forward are removed after capture;
screen timeout is restored to 120,000 ms and stay-on remains 0.
