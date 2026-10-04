# 08 - data: Archive format guards that have to be inside 1.0

Status: done
Type: build
Audit findings: D3, A3, D5
Severity: P2, but must ship in 1.0 (1.0 cannot be changed after it ships)
Blocked by: none
Size: S
Size note: under a day (plus the fixture write at the release cut)
Model: opus
Model note: (backup compatibility is forever once released)
UI: no. No `/impeccable` pass. (If the refusal needs a new string, it is copy
only.)

## Problems

**D3, sections, not versions.** `restore.ts:374-380` (`assertRestorable`)
throws `CorruptArchiveError` for any registered section missing from an
archive. `payload.ts:1056` (`PAYLOAD_MIGRATIONS`) has one step and the format
version stays at 2 when a section is added. `applyArchiveJournal` ignores
sections it does not know. So after release the first update that adds an area
makes every 1.0 backup unrestorable, and a newer backup restored on 1.0 drops
whole areas silently. Noted in project memory
(`adding-an-archive-section-refuses-older-archives`) on 3 September, never
ticketed.

**A3, tests rebuild what release freezes.** The golden archive
(`fixtures/golden-archive.ttbackup`, `archive-golden.test.ts`) is both the
completeness check (rebuilt routinely, 37 commits since 1 September) and the
only proof an older archive still opens. Schema tests start from an empty
database (`{78: BASELINE} + 79..84`). Four comments justify unversioned changes
with "no release has shipped": `payload.ts:49`, `payload.ts:198`,
`schema.ts:5`, `migrations.ts:11`.

**D5, KDF constants can drift.** The archive header records JS
`ARCHIVE_ARGON2_PARAMS` (`params.ts:21`, via `pack.ts:80`); native automatic
backup uses its own constants (`AutoExportPlugin.java:86-89`). Parity holds
today (the "failure" in ticket 03's log was the probe passing `{8192,1,1,32}`,
`tests/android-tier/archive/archive-cross-probe.ts:398-415`), but nothing
tests it, and native verification checks length and hash, not decryptability.

## What to build

- 1.0 refuses an archive that carries a section it does not know, with a
  plain message that a newer version of the app made it. (Warn-and-continue is
  the alternative; pick refuse unless Alicja says otherwise, since silent loss
  is the failure being prevented.)
- An ADR: from 1.0 on, adding a section bumps the format version and adds a
  payload migration that fills the absent section with `[]`.
- `fixtures/released/` and a `released-formats.test.ts` that opens every file
  under it with the current codec and migration runner and checks row counts.
  The test passes vacuously with no fixtures; human step 03 writes
  `fixtures/released/1.0.0/{archive.ttbackup, journal.sqlite}` from the
  release candidate, and they are never rebuilt. Amend ADR-0006 in one
  paragraph to say so.
- Rewrite the four comments to name 1.0.0 as the cutoff.
- Fix the probe's KDF profile; add a node test that reads the Java constants
  and compares them to `ARCHIVE_ARGON2_PARAMS`.

## Acceptance

- [ ] An archive with an unknown section is refused with a clear message; test.
- [ ] ADR recorded; ADR-0006 amended.
- [ ] `released-formats.test.ts` exists and runs in the node tier; human step
      03 names the fixture write.
- [ ] JS/Java KDF constant test passes and fails when either side changes.
