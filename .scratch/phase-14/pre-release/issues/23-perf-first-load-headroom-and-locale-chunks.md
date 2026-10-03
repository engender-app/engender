# 23 - perf: First-load room, by loading one language at start

Status: ready-for-agent
Type: build
Audit findings: P04, P05
Severity: P3, after release (not in the release gate)
Blocked by: 13
Blocked by note: (it also changes the first load; measure after it)
Size: M
Size note: one to two days
Model: sonnet
UI: no. Nothing renders differently; switching language must look the same as
now. No `/impeccable` pass. If switching language gains a wait, that is a UI
change: stop and mark the ticket `UI: yes`.

The two findings are one ticket because the second is how to fix the first.

## Problems

**P04, almost no room.** `npm run check:first-load-budget`: production is 104
files and 250,792 B against a budget of 105 files and 253,722 B, so 2,930 B
(1.2%) and one file of room. The demo build is 105 files and 254,857 B, 1,135 B
over; CI checks only production (`ci.yml:61/77`). The next feature merge will
probably trip the gate and force another re-record. See also project memory
`first-load-budget-has-no-headroom`.

**P05, both languages load at start.** First-load chunks carry English and
Polish side by side: `DmZuu0W4.js` (12.0 KB gzip) holds the affirmations in both
languages, `WKcbbJ_s.js` (29.9 KB gzip) the boot and error copy in both. The
exact share was not measured; the reader's estimate is 10 to 20 KB gzip.

Data: `.claude/audit-2026-10-03/perf/chunks-prod.txt`, `budget-prod.log`,
`budget-demo.log`.

## What to build

- Measure the share first: how many bytes of first load are the language not
  in use.
- Load messages per locale (Paraglide supports it): the active locale in first
  load, the other fetched on switch and precached for offline. Boot and error
  copy must still show in the right language before anything else loads, and
  the lock gate must work offline in both.
- Re-record the budget with the gain kept as room, not spent.
- Decide the demo build: gate it with its own budget, or note in
  `scripts/first-load-budget.json` why it is exempt.

## Acceptance

- [ ] Bytes saved stated before and after, three builds.
- [ ] First load holds one language; switching works online and offline; the
      lock gate shows the right language offline.
- [ ] Budget re-recorded with at least the measured gain as room.
- [ ] The demo build is gated or exempt on purpose.
