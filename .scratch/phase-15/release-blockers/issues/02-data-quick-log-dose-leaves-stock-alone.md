# 02 - data: A dose logged from the entry editor leaves the stock count alone

Status: ready-for-agent
Was: phase-14 pre-release 36 (moved 2026-10-05)
Type: bug
Audit findings: L01-02 (blocker B2 in the audit's clusters)
Severity: P1, the audit calls it release-blocking
Blocked by: none
Size: S
Size note: under a day
Model: sonnet
UI: no. No `/impeccable` pass.

Source: full audit of 5 October 2026, run on main 2e362652. origin/main was
22 commits ahead by then (REL-09), so re-check each finding on the current main
before fixing it. Reports, probes and shots are under
`.claude/audit-2026-10-05/` (`report-<reader>.md` per reader).

## Problem

Quick-logging a scheduled dose from the entry editor writes a decrement into
the stored stock quantity, which the stock projection was designed never to
store (ADR-0046; `.scratch/done/phase-5/cohesion/issues/06-stock-shows-up-where-doses-are-logged.md`
rules out "any stored stock counter, decrement write, refund path or zero
floor").

- `src/lib/data/journal/entries.ts:796-801`:
  `UPDATE medication_stock SET quantity = MAX(0, quantity - ?), updated_at = ? WHERE drug = ?`
  with `dose.dose`, the mg amount.
- The projection (`stockProjection.ts` header, `stock.ts:150-164`) already
  subtracts every non-skipped dose since `recordedEpochDay`, so the dose is
  taken off twice, and the person's typed count is overwritten.
- Reachable by default: `entryDoseQuickLogEnabled: true`
  (`prefs/catalogue.ts:493`), and `EntryEditor.svelte:1311-1335` calls
  `setDoseLog`.
- Probe `.claude/audit-2026-10-05/L01/stock.probe.ts`: before, stored 30 and
  remaining 30; after one quick-logged 2 mg tablet, stored 28 and remaining 27.
  It should read 30 and 29.

One tap on the dose chip rewrites the count the person typed and brings the
run-out date and the refill reminder forward, more with every quick-logged
dose. Report: `report-L01.md`.

## What to build

- Delete the UPDATE.
- Route the contextual dose through `doses.upsertDose` (one insert path, with
  `routeColumns`) instead of the raw INSERT at `entries.ts:778-795`.
- A regression test over the quick-log path.
- Counts already decremented on devices cannot be repaired automatically, since
  the original typed value is gone. Say so in Comments; no release has shipped,
  so only development journals are affected.

## Acceptance

- [ ] The stock probe reads stored 30, remaining 29 after one quick-logged dose.
- [ ] A test fails if any journal write path updates `medication_stock.quantity`
      other than the stock editor itself.
- [ ] The contextual dose goes through `doses.upsertDose`.
