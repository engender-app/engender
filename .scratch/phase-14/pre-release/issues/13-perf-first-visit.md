# 13 - perf: First visit paints early and caches less at once

Status: ready-for-agent
Type: build
Audit findings: P03, P02
Severity: P2
Blocked by: none
Size: M
Size note: one to two days
Model: sonnet
UI: yes (a static first frame before the app boots, and its handover to the
app). Mandatory `/impeccable` pass on the splash and the handover, then
sign-off and the no-yank clause from the spec. The handover is a motion design
choice: put two options to Alicja as a flipbook rather than picking one.

## Problems

**P03, blank until all JS arrives.** Production build, first visit to `/`, 4x
CPU slowdown, 1.6 Mbps and 150 ms latency, three runs: first paint 3501 / 3718 /
3928 ms over HTTP/2 and 6038 / 5999 / 6024 ms over HTTP/1.1. HTML is parsed at
about 1055 ms; nothing paints until boot starts. `index.html` has 98
`modulepreload` links; first load is 104 files. `deploy/self-host/container.conf`
listens on plain port 80, so a self-hoster without a TLS proxy gets the 6 s
case. Repeat visits paint in 222 to 286 ms. Data:
`.claude/audit-2026-10-03/perf/cold-prod-*.jsonl`, `wf-prod.txt`.

**P02, the offline cache competes with boot.** The service worker precaches
684 files, 3.81 MB brotli, starting at about first paint (registered in a
layout `$effect`, `src/routes/+layout.svelte:100-102`) while the journal
worker downloads its own sqlite wasm. `sqlite3.wasm` is cached twice under two
paths (same md5, about 0.4 MB compressed each; `precache-prod.txt`);
`sqlite3-worker1-bundler-friendly-*.js` may be redundant (trace it). The PDF
worker and fonts add about 0.9 MB that only PDF export uses
(`src/lib/pwa/shell-assets.ts` cites ADR-0065 for the fonts).

## What to build

- A static first frame in `src/app.html`: the ground colour and the mark,
  matching the theme the person last used where that is readable without JS,
  so first paint lands near HTML parse. The logo never animates (settled); the
  handover from splash to the first screen must be a deliberate transition,
  not a cut. CSP: inline styles must stay within the existing policy (the CSP
  lives in the document; check `csp.test.ts` against the built document).
- One `sqlite3.wasm` in the build and the precache.
- Register the service worker after boot reaches ready or setup, in idle time.
- Fetch the PDF worker on demand like OCR; leave the PDF fonts unless
  ADR-0065 is revisited with Alicja.
- SELF-HOSTING.md says to serve over HTTP/2.
- `check:first-load-budget` stays green (2.9 KB of room today).

## Acceptance

- [ ] First paint on the same throttled profile lands under 1.5 s over HTTP/2,
      three runs reported with spread, before and after.
- [ ] Precache shrinks by the duplicate and the PDF worker; numbers before and
      after.
- [ ] Offline relaunch still works (`verify:hosting` passes).
- [ ] `/impeccable` pass done; splash-to-app handover shown as a scrubbable
      flipbook with frame times, trans light and dark; Alicja picks.
- [ ] No frame where the mark or ground jumps between splash and app.
