# A column that holds a uuid is named `*_uuid`, and device-local state gets its own table

Status: Accepted
Decided: 2026-11-02
Last reviewed: 2026-11-02
Supersedes: none
Amends: ADR-0002 (refines its column naming)

ADR-0002 gives every row a rowid and a uuid. Foreign keys inside the journal
use the rowid, and the uuid is what travels. The column names did not say
which was which: `appointment.procedure_id` is a rowid, and
`milestone.procedure_id` held a procedure's uuid. A query that joined the
wrong pair read as plausible and returned nothing.

Schema version 119 settles it before 1.0 makes names permanent:

- **`*_id` is a rowid, `*_uuid` is a uuid.** `entry.presentation_uuid`,
  `entry_template.presentation_uuid`, `milestone.procedure_uuid` and
  `milestone.tryout_uuid` were renamed in place with `RENAME COLUMN`, which
  rewrites the foreign keys and indexes that name them. `entry` was not
  rebuilt for a name. `document.target_id` keeps its name: it holds a goal's
  key as often as a uuid, so neither suffix would be true.
- **The archive is untouched.** The payload's field names are its own shape
  (`presentationId`, `procedureId`), so the golden journal restores and
  re-exports as it did.
- **Device-local state is a table, not columns on a shared row.** The
  debrief offer's link and dismissal sat on the standalone `checklist` row,
  which is archived and merged. They are now `appointment_debrief`, one row
  per appointment, keyed by the appointment's uuid. Merge class `none`,
  discarded with the appointments on Replace, never on the wire. Each
  appointment keeps its own link instead of the latest one overwriting the
  rest.
- **A rebuilt table recreates its deletion trigger.** The migration rebuilds
  `checklist` and `hair_removal_session` and calls `deletionTrigger()` for
  each. `archiveMerge.test.ts` reads the migrated schema and fails on a
  table whose trigger is missing.
- **`voice_benchmark.analyzer_version`** says which analyzer measured a take
  (`ANALYZER_VERSION` in `src/lib/audio/analyzerVersion.ts`, raised when a
  change could move a reported figure). Null on a benchmark taken before it.

## Known gap

`analyzer_version` is stored but does not travel in the archive yet: the
acceptance for this change was that the golden payload stay identical. A
restored benchmark reads as unversioned. Adding the field to the voice
section later is one line plus a regenerated golden fixture.
