# 13 - data: Archive format guards that have to be inside 1.0

Status: ready-for-agent
Status note: (reopened 2026-10-05 for audit follow-up ARCH-02, L02-05; the original scope shipped)
Was: phase-14 pre-release 08 (moved 2026-10-05)
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
  The test passes vacuously with no fixtures; pre-release-human 06 writes
  `fixtures/released/1.0.0/{archive.ttbackup, journal.sqlite}` from the
  release candidate, and they are never rebuilt. Amend ADR-0006 in one
  paragraph to say so.
- Rewrite the four comments to name 1.0.0 as the cutoff.
- Fix the probe's KDF profile; add a node test that reads the Java constants
  and compares them to `ARCHIVE_ARGON2_PARAMS`.

## Acceptance

- [ ] An archive with an unknown section is refused with a clear message; test.
- [ ] ADR recorded; ADR-0006 amended.
- [ ] `released-formats.test.ts` exists and runs in the node tier; pre-release-human
      06 names the fixture write.
- [ ] JS/Java KDF constant test passes and fails when either side changes.

## Audit 2026-10-05 follow-up (reopened)

The original acceptance stands (the data reader confirmed unknown sections are
refused and the cutoff comments name 1.0.0). Two more format concerns belong
here because they have to be settled before 1.0 freezes the format. Status set
to ready-for-agent for them. Reports: `.claude/audit-2026-10-05/report-arch.md`,
`report-L02.md`.

- **ARCH-02 (P3).** The archive format version is owned through an import
  cycle: `container.ts:26,46` computes `ARCHIVE_FORMAT_VERSION` at load,
  `codec.ts:1-3` imports container at runtime (with `verbatimModuleSyntax` the
  type import stays a side-effect import), and `payload.ts:24,1080` imports the
  version back. Importing `codec.ts` first throws `ReferenceError: Cannot
  access 'ARCHIVE_CODECS' before initialization`
  (`.claude/audit-2026-10-05/arch/codec-first.ts`). Today only the import order
  in `pack.ts:21` saves it; a new caller that imports codec first would crash
  every backup and restore at load.
- **L02-05 (P3).** Wear-kind labels index `KIND_LABELS[kind]()` directly
  (`vocabulary/wearLabels.ts:150-163`), while the schema deliberately accepts
  unknown kinds so newer archives read back (`schema.ts:449-452`). A backup
  from a later build with a new wear kind, restored on 1.0, crashes the wear
  screen and the More hub (`hubLabels.ts:153`) with "undefined is not a
  function".

What to build:

- Codec owns `ARCHIVE_FORMAT_VERSION`; `applyMigrations` takes its target from
  the caller; codec imports ByteReader with `import type`; container imports the
  version from codec.
- `KIND_LABELS[kind]?.() ?? kind`, and the same for the other wear records (or
  normalise unknown kinds at the read).

Acceptance (added):

- [ ] A node test imports `codec.ts` alone in a fresh module graph and encodes;
      the import graph has no cycle through container.
- [ ] A wear session with an unknown kind renders on the wear screen and the
      More hub without throwing (a test).
