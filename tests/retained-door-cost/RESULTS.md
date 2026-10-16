# Physical Android retained-read comparison

## 14 October: blanket deferral

On 14 October 2026, a Pixel 10a (API 37, WebView 155) ran twelve alternating
current/deferred samples over one generated ten-year journal: 3300 entries,
391 entry photos and the other areas in `evidence/native-result.json`.
Generation took 568899.5 ms. The journal used SQLCipher and encrypted media.
The source revision was `d9c411a83bc05e488cd664e2bd05cbbb84266471`; the
result records probe and Android-driver hashes and build timestamp.

The first six samples disabled read tracing and byte serialization. The
remaining six attributed repository reads to visible and hidden owners.
The host and device were reserved for the comparison after generation;
thermal status was 0, battery temperature 25.0 C and the Activity was resumed.
These samples share one fixture and device, so they establish this workload's
tradeoff rather than a population estimate.

| Measure | Current | Disposable deferral |
| --- | --- | --- |
| Write completion, untraced | 39.7 / 49.4 / 50.5 ms | 43.8 / 46.7 / 49.0 ms |
| Save settlement, untraced | 825.8 / 834.5 / 841.9 ms | 148.6 / 149.9 / 150.1 ms |
| Warm Look back settlement, untraced | 41.1 / 66.2 / 75.1 ms | 767.9 / 783.7 / 800.8 ms |
| Visible Home read window, traced | 761.5 / 767.7 / 768.8 ms | 50.3 / 51.8 / 58.0 ms |
| Save statements, traced | 136 | 47 |
| Save response bytes, traced | 807620-807624 | 16087-16088 |
| Warm Look back statements, traced | 0 | 53 |
| Warm Look back response bytes, traced | 0 | 782664-782666 |

The visible read window runs from the first visible repository read's start
to the last visible read's completion. It measures foreground read readiness,
not first painted pixels. Settlement waits for live queries plus five quiet
animation frames; it also exceeds the exact data-ready instant. Write
completion ends when `upsertEntry` resolves. The experiment did not time an
entry editor's complete Save interaction.

Write completion improved by no consistent amount. Hidden reads competed
with visible Home refreshes: suppressing them shortened the visible read
window by about 710 ms. The cost returned on warm Look back: it kept its
previous reading DOM immediately, then took about 780 ms to refresh. Current
behavior had already refreshed that cache while hidden.

The existing save interaction guard allows 1.2 seconds, while the web tile
arrival guard allows 250 ms warm and 300 ms cold. ADR-0089 explicitly treats
physical Android separately from that web guard. The long-journal Look back
mount target is 500 ms. These are different measurement boundaries: the
write samples do not prove editor confirmation meets 1.2 seconds, and the
settlement samples do not replace tile paint timings. Still, an approximately
780 ms refresh on every dirty warm revisit would undermine the retained
cache's reason for existing. First-frame old content alone does not establish
freshness within a warm arrival budget.

Both modes passed saved-note freshness in Words and Calendar, retained
reading-node identity and lock teardown during all twelve native samples.
Separate captures of the actual demo shell passed the authored arrival hold,
0.004 opacity floor, same first reading node without a placeholder, hidden
`inert`/`display:none`, reduced motion and removal of private DOM on lock.
Those shell captures ran while host verification was active; their timestamps
are correctness observations, not quiet performance measurements. The shell's
demo journal differs from the ten-year timing fixture.

Do not adopt blanket activity admission in production. A follow-up is
justified for visible refresh contention. Its owners are
`src/lib/data/live/journal.svelte.ts` (query admission and version changes),
`src/lib/navigation/RetainedDoor.svelte` (activity), and the Android driver
queue. Measure visible-first scheduling or bounded hidden refresh against the
same fixture before selecting a repair. Preserve cached reading DOM on
arrival, refresh dirty versions on revisit, reject superseded responses,
retain the authored paint hold and conceal all journal DOM on lock. Require
both foreground readiness and warm fresh-revisit measurements; saving fewer
statements alone is insufficient. This investigation changes no production
query scheduling.

Existing recording-driver, readState, lastResults, androidTabMotion,
paintHold and screenArrival tests passed (59 tests). The full Node tier passed
8130 tests with three skipped; build, warning-failing check and static guards
passed before physical runs. No existing assertion needed weakening. The
new observer control uses a 90-day web fixture to catch bypassed Words reads
before spending nine minutes generating the native fixture.

README, ARCHITECTURE, both privacy policies, SECURITY, CHANGELOG, CONTEXT and
ADR-0089 describe unchanged production behavior and need no amendment for
this disposable experiment. `tests/PROBES.md` links this harness and its
recorded boundaries. Backend 78 owns the separate actual-mount budget probe.


## 15 October: bounded hidden refresh

The follow-up compared unbounded admission (`current`) with a 75 ms hidden
admission bound (`bounded`) on the same Pixel 10a, API 37 and WebView 155.
Each query attempt shares one admission promise across its operations. A door
becoming visible releases its pending reads. Dependency capture remains
synchronous, and a superseded generation cannot dispatch a delayed read.
The selected repair now lives in `live/hiddenReadAdmission.ts`, called by the
existing live-query and retained-door owners. The driver queue is unchanged.

The twelve samples used one freshly generated ten-year SQLCipher journal:
3300 entries, 2619 days with entries and 391 entry/milestone photos. Other
areas are recorded in `evidence/native-bounded-result.json`. An independent
`SELECT COUNT(*) AS total FROM entry` returned 3300 before measurement.
Generation took 903352.1 ms. The first six rounds disabled tracing and byte
serialization; the last six recorded visible and hidden read operations.
Both modes ran three times in each group, in alternating pairs.

| Measure | Current | Bounded |
| --- | --- | --- |
| Write completion, untraced | 41.7 / 49.7 / 51.4 ms | 50.6 / 85.5 / 48.2 ms |
| Full save settlement, untraced | 825.7 / 841.9 / 868.1 ms | 925.5 / 942.2 / 900.8 ms |
| Warm Look back after hidden settlement, untraced | 74.3 / 57.5 / 65.6 ms | 66.1 / 57.5 / 65.6 ms |
| Immediate dirty Look back settlement, untraced | 797.6 / 821.2 / 787.9 ms | 799.3 / 803.2 / 802.9 ms |
| Visible Home read window, traced | 762.6 / 778.4 / 736.9 ms | 48.8 / 53.8 / 57.1 ms |
| Save statements, traced | 130 | 130 |
| Save response bytes, traced | 805778-805782 | 805778-805782 |
| Warm revisit statements / bytes, traced | 0 / 0 | 0 / 0 |

The foreground read window shrank by roughly 700 ms. Unlike blanket deferral,
the bounded candidate refreshed hidden data before the settled warm revisit;
that revisit stayed at 58-66 ms. Switching immediately after a second write,
before hidden refresh had settled, still took about 800 ms in both modes.
This repair does not make that immediate dirty revisit fast. Full save
settlement, including hidden refresh, increased by roughly 75-100 ms in the
first two pairs and 33 ms in the last pair. Write completion had no consistent
gain. The statement and byte totals did not fall: this changes admission
order, not the questions asked or their answers.

These measurements use the boundaries defined above, including five quiet
animation frames for settlement. The visible window measures repository
readiness, not pixels; write completion is not the editor's full Save
interaction. The 1.2 s Save guard, 250/300 ms web warm/cold arrival guards,
and 500 ms long-journal Look back mount target therefore remain separate
checks. ADR-0089 keeps physical Android distinct from the web arrival guard.
The evidence supports bounded admission because foreground readiness improves
without moving a comparable delay into the settled warm revisit. It does
not establish every arrival or Save budget on every device.

All twelve native samples preserved Words and Calendar saved-note freshness,
hidden Words refresh, retained reading-node identity and lock cleanup.
Separate current/bounded captures of the actual demo shell preserved the
authored hold, 0.004 opacity floor, reduced motion, hidden
`inert`/`display:none` and lock concealment. Their demo data differs from the
ten-year journal, and their timings are not performance measurements.

The source base was `a5e3e1c962597e9ae621f952b4d02cfba60d7407`. The raw result
records source, probe and driver identities; `evidence/bounded-identity.json`
adds APK hashes and setup receipts. `evidence/promotion-equivalence.json`
compares the measured transformed owners with the promoted owners: imports,
the helper comment and its superseded-read error wording are the only
normalized differences in those owners. Activity lookup also preserves
standalone effect roots: without a component context they remain active,
covered by the existing real live-reads browser probe and focused tests.
That compatibility path does not participate in the physical retained-door
comparison. The probe now bypasses the production admission only
for the unbounded baseline. Native measurements came from the isolated debug
probe, not a signed release or an R8 build.

Fixture setup encountered the known idle JPEG encoder delay. A temporary
animation-frame loop ran only during generation; it stopped at
`awaiting-quiet`, and its counter stayed at 42014 across a 250 ms check before
samples. The original generator and photo bytes were unchanged. The count
check's temporary debugger breakpoint was removed and the debugger disabled.
The Activity was resumed, visible and focused; thermal status was 0 and
battery temperature 23.6 C. This team's heavy host work was paused. Another
session's `ui37-api35` emulator remained active, so the host was not fully
idle. This is repeated evidence on one device and fixture, not a population
estimate.

Both owned packages and port 9381 were removed after captures. Synthetic
fixtures disappeared with the packages. Screen timeout stayed at 120000 ms
and stay-on remained 0; the phone lease was released for ticket 83.

ARCHITECTURE and CHANGELOG now describe bounded background refresh. README,
CONTEXT, SECURITY, both privacy policies and ADR-0089 need no changes: no
storage, encryption, network, domain wording or published budget changed.
