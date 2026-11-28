# Photo and return-surface budget investigation, 15 October 2026

Ticket 82 started from two failures reported by the Android long-journal test:
`photo-add` at 8,522/8,552 ms with R8 on/off, and `mount-coming-back` at
22,359 bytes. The test checks the one-year fixture first and throws there.
Those numbers describe the one-year fixture, not the decade. Replaying the
unchanged decade reads gives 25,587 bytes, 3,445 over its 22,142-byte budget.
The one-year increase over the recorded 20,129-byte baseline is 2,230 bytes.

## Device and comparison

The recorded native baseline names a Pixel 10a, Android 17/API 37, fingerprint
`google/stallion/stallion:17/CP2A.260805.005/2026081301:user/release-keys`.
Photo timing was recorded on 27 August; return counts were added on 24 September.
The baseline does not record a WebView version. Ticket 50's two October run
receipts also omit that version; it cannot be recovered from those receipts.

This investigation used the physical Pixel 10a, Android 17/API 37, fingerprint
`google/stallion/stallion:17/CP3A.261005.005/2026100601:user/release-keys`, with
Vanadium WebView `155.0.8059.79.0`. It is the same handset model and API level,
with a newer OS build. The old photo timing bound remains applicable: the
failure repeats on current hardware before the repair and passes afterwards.
No hardware excuse or larger photo budget is needed.

Source baseline: `9d88449bbe61b53639f37c39de960e8ca0d31e3f`, the accepted backend
integration tip. Its application source matches ticket 50's `bab88b858`; their
differences are instrumentation repairs, a benchmark timeout and evidence.
The app was an isolated debug build, `dev.engender.app.test.r850`, with the
production Android SQLite and encrypted photo-store owners. The app APK SHA-256
was `0555a9c8b0e85ce6c8d208898ab7a598211cf8505fcf0a867380abb8d7dec5b0`.
Candidate JavaScript modules were bundled from the working tree and loaded into
that same test WebView. This compares JavaScript repairs over unchanged native
code; it is not another R8 comparison or a release-artifact sign-off.

The fixture used seed 1 and 3,653 days ending at epoch day 20,676: 3,300 entries,
2,619 days with entries, 391 entry/milestone photos, 1,466 primary dose events
and 491 additional dose events. The native generator took 548.35 seconds.
The same retained fixture and sample JPEG were reused for comparisons. Photo
samples attach to disposable entries after the fixture's final day. A read
snapshot boundary clears cached answers before each return-surface sample.

## Photo cause and repair

Direct photo-add calls initially took 389.1 to 447.8 ms over the decade fixture.
Running the benchmark prefix through its mounted Look back and then photo-add
reproduced 8,473.9 ms. Mounting and unmounting Look back alone also reproduced
the delay. Subsequent samples stayed slow. Each `OffscreenCanvas.convertToBlob`
call waited about four seconds; a requested idle callback timed out at five
seconds. A visible status element and forced garbage collection did not fix it.
A temporary animation-frame loop removed it, which isolates page idle scheduling
rather than SQL, storage or image size. No frame loop ships in the repair.

`normalizePhoto` now runs the existing decoder, resize and JPEG encoder in one
short-lived module worker per image. The caller keeps its input buffer. The
worker transfers both outputs and terminates on success or failure. Error kinds,
orientation, quality, dimensions and metadata removal remain unchanged.

Three stage-instrumented samples per arm, milliseconds, shown as
minimum / median / maximum:

| Stage | Before | After |
| --- | --- | --- |
| Complete photo-add | 8524.9 / 8532.0 / 8592.4 | 600.0 / 613.1 / 618.5 |
| Read and decrypt source | 56.1 / 59.4 / 61.0 | 56.0 / 70.0 / 70.6 |
| Normalize, including worker startup after repair | 8262.5 / 8274.3 / 8299.4 | 289.6 / 311.8 / 334.6 |
| JPEG encoding, contained in normalization | 8177.1 / 8180.1 / 8188.0 | 170.3 / 173.0 / 181.6 |
| Encrypt and durably write full image and thumbnail | 41.2 / 53.1 / 58.7 | 45.8 / 51.0 / 56.3 |
| Remaining attachment reads and transaction | 147.5 / 157.1 / 178.8 | 162.7 / 179.8 / 203.4 |

The encoder timings after repair come from a test-only worker wrapper around
the same pixel-normalization function. Three ordinary production-worker samples
were 567.3, 576.1 and 618.7 ms. Both arms produced 939,290 full-image bytes and
11,682 thumbnail bytes. Minima and medians of separate stages do not add up to
the corresponding total statistic.

Live-query settlement is outside this metric. It calls the raw journal handle,
without a mounted editor or a live-query wait. There is no settlement duration
to subtract from the recorded total. These measurements do not claim a complete
editor interaction or frame-latency result. The native 3,135 ms photo budget and
900 ms target remain unchanged.

## Return bytes and repair

The September source at `8a958ff13` reproduces the recorded 20,129 bytes under
Node's real SQLite driver. The current baseline returns 25,587 bytes. The
5,458-byte difference decomposes as follows:

| Change | Bytes |
| --- | ---: |
| Three automatic-slot provenance columns on 45 dose rows | +3,465 |
| Wider tolerance window and its dose rows/content | +940 |
| Batched schedule rows carry their schedule IDs | +125 |
| A second read of those schedules | +921 |
| Changed fixture values in bounded last-write rows | +7 |

`019db00bb` last changed the dose-read owner. It added slot provenance and
introduced the repeated schedule read. `9528e30a0` introduced tolerance-window
reads; `e7c4f4312` batched the schedules. The fixture's last change is
`789286601`, following `8e6538920`'s two-size generator. Provenance, tolerance and
fixture changes are intended correctness/coverage work. Reading schedules again
within the same comparison is unnecessary.

For the reported one-year result, the 2,230-byte increase over the historical
decade baseline is 2,849 bytes of provenance on 37 dose rows, minus 1,680 bytes
from different dose-row counts/content, plus 125 schedule-ID bytes, the 921-byte
duplicate schedule read and 15 bytes of changed last-write values. The fixture
sizes differ, so the dose-row difference combines fixture content and the wider
tolerance window. Removing the duplicate read alone clears its 217-byte breach.

The dose owner now supplies the schedules it already holds to its shared slot
read. Standalone slot reads still fetch their schedules. Comparison results and
next-slot semantics retain the same SQL window and row mapping.

Three native decade samples before repair all returned 35 statements and 25,587
bytes (71.0 to 109.1 ms). Three afterwards all returned 32 statements and 24,666
bytes (68.3 to 110.3 ms). This establishes the crossing reduction, not a timing win.
The one-year Node fixture falls from 22,359 to 21,438 bytes. The desktop decade
benchmark independently returns 24,666 bytes after repair.

Both count baselines now record 32 statements and 24,666 bytes. Statement budgets
tighten to 32; byte budgets apply the existing 10% rule, `ceil(24666 × 1.1) =
27133`. The remaining increase is accounted for above. Timing baselines, timing
targets and other measurements' budgets are unchanged.

## Verification and limits

The original native photo timing gate failed before the repair. A focused Node
return-read test failed at 35 statements against 32; after removing the duplicate
read, the old byte budget still failed at 24,666 bytes. Updating that baseline
with the measured justification makes the focused count gate pass.

Existing dose tests cover tolerance and slot attribution. The browser photo
probe exercises real worker output, metadata stripping, orientation, typed
refusals and preservation of the caller's bytes. `return-budget.test.ts` covers
both one-year and ten-year crossing budgets. The existing native long-journal
photo timing gate remains the performance regression check.
The production-build probe also executes the precached normalization worker
with the network unavailable and checks the decoded output dimensions.

The full desktop benchmark found an additional Care byte breach: 38,855 against
33,120. The unchanged native benchmark prefix also found Look back at 782,563
bytes against 181,295, plus the same Care breach. Both occur before this repair
on the source baseline. These are separate follow-up work; their budgets were
not changed here. No complete native or desktop benchmark pass is claimed.
The [Care and Look back follow-up](care-and-look-back.md) records their later
investigation and corrected count budgets.

The shared phone was released after removing both isolated packages, their
fixtures and forward 9382. Screen timeout was restored to 120,000 ms; stay-on
remained 0. No real journal package or other session's resources were used.
