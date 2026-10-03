# 24 - perf: The demo journal seeds in seconds, not twelve

Status: ready-for-agent
Type: build
Audit findings: P06
Severity: P3, after release (matters only if a demo is hosted; also speeds up
every guard and capture that seeds the demo)
Blocked by: none
Size: M
Size note: one to two days
Model: sonnet
UI: no. The demo shows the same content sooner. No `/impeccable` pass. If the
first screen now appears before seeding ends and fills in as it lands, that is
a UI change with the no-yank rule: mark the ticket `UI: yes`.

## Problem

Demo build, HTTP/2, 4x CPU slowdown, 1.6 Mbps, three runs per route, time to
ready: `/` 12.2 to 12.8 s, `/timeline` 12.1 to 13.2 s, `/calendar` 11.3 to
12.2 s (content appears only at ready), `/stats` 11.7 to 12.6 s, `/care` 11.2
to 12.7 s. First paint is 3.2 to 4.0 s; the rest is persona seeding in the
worker (`boot.svelte.ts:781-791`). Unthrottled, `/` still takes 4.3 to 6.4 s.
Data: `.claude/audit-2026-10-03/perf/cold-demo-*.jsonl`.

The guard suites and audit captures seed the demo on almost every run, so this
also costs CI time (ticket 04).

## What to build

- Profile where seeding spends its time: generation, inserts, photo bytes.
- Seed from a pre-built snapshot (a database built at build time from the
  persona, or the inserts batched in one transaction), keeping the persona's
  dates relative to today, as they are now.
- Fill every feature stays a separate, slower action.
- Report the time to ready before and after, three runs.

## Acceptance

- [ ] Demo `/` ready under 5 s on the same throttled profile, three runs with
      spread, before and after.
- [ ] Persona content identical to today's (a test compares row counts and a
      sample of rows).
- [ ] Guard and walkthrough runs that seed the demo pass.
