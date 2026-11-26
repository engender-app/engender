# An explicit feature choice beats automatic cycle visibility

Status: Accepted
Decided: 2026-10-04
Last reviewed: 2026-11-02
Supersedes: ADR-0043 (merged in)

Setup asks which tracking features to show, separately from Today pins, and
the same choices sit in one section of Settings. Hiding a feature takes away
its navigation and its prompts and nothing else: its records stay, its direct
address answers, and search still finds them. Two topics start off in a new
journal: cycle tracking, and genital and sexual effects.

Cycle tracking keeps the automatic rule (a regimen naming testosterone shows
it) only for journals where nobody has chosen. Once someone shows or hides it,
that choice wins over any regimen, in both directions.

## How it works

- **Setup's features step** lists the modules (`FeatureVisibilityList.svelte`
  over `FEATURE_MODULE_ROWS` in `src/lib/data/hubRows.ts`) and, under "Topics
  and cycle", the genital effects and sexual effects switches and the cycle choice
  (`src/routes/onboarding/+page.svelte`). A hidden module's areas are written
  hidden through `journal.areaStates.setAreasHidden`. **Settings** carries the
  same list and switches (`src/routes/settings/+page.svelte`).
- **Genital effects** and **sexual effects** are the `genital` and `sexual`
  effect categories, each off by default (`defaultEnabled: false` in
  `src/lib/data/vocabulary/builtins.ts`). They were one `genital_sexual`
  category until it was split (schema 121).
- **Cycle tracking** asks one question everywhere it is offered:
  `cycleTrackingVisible(episodes, timestamp, choice)` in
  `src/lib/data/cycleTracking.ts`. It returns the choice when there is one,
  otherwise whether a regimen episode active at that moment names testosterone
  (Polish "testosteron" and a bare "T" count; methyltestosterone does not).
  Every surface that offers cycle tracking asks it; none re-derives it.
- **The choice** is `cycleTrackingChoice: boolean | null`
  (`src/lib/data/prefs/catalogue.ts`). A new journal records `false` when setup
  finishes. A journal restored or set up before the choice existed keeps
  `null`, so what those people see does not change under them. The preference
  is portable (ADR-0003) and travels with the `cycle_event` rows it was set
  for.

## Why

Read cold, an unconditional cycle row is a dysphoria trigger. The surfaces are
the same for everyone, and a permanent prompt about periods and spotting tells
a transfemme reader the app was not drawn for them, every day. The mirror
reader exists too: a transmasc or nonbinary person who bleeds, on no
testosterone or before it, for whom hiding the log entirely is its own
message. The regimen was the automatic way in, because testosterone is what
makes bleeding stop and change.

The explicit half is what changed. Once somebody has said no, showing the log
because a regimen started would break the meaning of their answer. So an
explicit choice outranks the regimen both ways, and a new journal starts with
an explicit no instead of no answer.

## Consequences

- Hiding is all any of this does. No table is dropped, no record deleted, no
  write refused. `/health/cycle-events` answers at its address.
- A future surface offering cycle tracking asks `cycleTrackingVisible` instead
  of growing its own gate. The entry editor once read the old preference
  directly, so someone on testosterone who never touched the switch got the
  hub row but not the editor's cycle chips; "none re-derives it" was an intent
  before it was a description of the tree.
- The old opt-in, `cycleTrackingEnabled`, is gone.
  Migration 118 (`src/lib/data/sqlite/prefs-cleanup-migration.ts`) turned every
  stored opt-in into `cycleTrackingChoice: true` unless a choice existed, and
  an older archive carrying the flag restores the same way.

History: ADR-0043 decided 2026-09-03 (cycle row only via a testosterone regimen or an opt-in) and was amended the same day when the editor read the old preference directly; this record proposed 2026-10-04, shipped with the feature-visibility work, rewritten 2026-11-02, and absorbed ADR-0043 2026-11-02.