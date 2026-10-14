# Physical Android retained-read comparison

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
