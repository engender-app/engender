/* The forward-only migration list (ADR-0006). Append new versions here;
   never edit a migration once it has shipped. */

import type { Migration } from './migration-runner.ts';
import { SCHEMA_V1 } from './schema.ts';

/* v2: custom gender dimensions hide, never delete (ticket 07, same F17
   rule as tags). Hiding takes a dimension out of everywhere a user picks
   things - presets, the editor, the charts - while its
   entry_dimension_value rows survive, so it needs its own flag: absence
   from every preset cannot say "hidden", because a dimension outside any
   preset still appears in the metric picker. */
const SCHEMA_V2 = `
ALTER TABLE gender_dimension ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
`;

/* v3: the search index becomes writable (ticket 09, ADR-0005).

   v1 shaped `entry_fts` but nothing ever wrote to it, and as shipped it
   could not forget a row: a plain contentless FTS5 table only deletes via
   `INSERT INTO entry_fts(entry_fts, rowid, folded_text) VALUES('delete',
   ...)`, which needs the exact text the row was indexed under. Every edit
   would therefore have to re-fold the old note and hope the fold function
   had not changed since - and a mismatch does not fail, it quietly
   decrements token counts that were never there. `contentless_delete=1`
   (SQLite 3.43+; Node ships 3.51.2 and SQLocal's WASM build 3.48.0) makes
   a delete a plain DELETE, so an edit is delete-then-insert.

   FTS5 options cannot be altered, hence the drop and recreate. There is
   nothing to carry across: the index has never held a row.

   Inserts and updates stay in application code because the folding does
   (ADR-0005) and SQL cannot call foldText(). Deletes do not need the
   folded text, so they become a trigger - which is what makes the index
   survive delete paths written later that know nothing about it, ticket
   14's Replace import first among them.

   Entries written before this migration are not in the index. Nothing had
   ever indexed them either, so this loses nothing, but it does mean a
   pre-v3 dev journal has notes that search will not find until they are
   saved again. No release has shipped, so no user is in that position. */
const SCHEMA_V3 = `
DROP TABLE entry_fts;
CREATE VIRTUAL TABLE entry_fts USING fts5(
  folded_text,
  content='',
  contentless_delete=1
);
CREATE TRIGGER entry_fts_after_delete AFTER DELETE ON entry BEGIN
  DELETE FROM entry_fts WHERE rowid = old.id;
END;
`;

/* v4: body regions (ticket 09). A region is a fixed, built-in key
   (bodyMap.ts) rather than a stored reference-data row like
   gender_dimension - there is no per-install customisation to persist, so
   the column is plain TEXT with no table to join against and no CHECK: the
   allowlist lives in application code, the same free-text treatment
   lab_result.analyte already gets.

   Whole-set replace on write, like entry_tag rather than
   entry_dimension_value: the picker shows every region every time, so a
   region missing from a save is the user deselecting it, not a preset
   narrowing what is on screen. */
const SCHEMA_V4 = `
CREATE TABLE entry_body_region (
  entry_id  INTEGER NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  region    TEXT NOT NULL,
  intensity INTEGER NOT NULL,
  PRIMARY KEY (entry_id, region)
);
CREATE INDEX idx_ebr_region ON entry_body_region(region);
`;

/* v5: body measurements (phase 4 ticket 08). Four fixed types - waist,
   hips, chest/bust and underbust - each a dated value in whatever unit the
   person measures in (ADR-0012, never converted). No regimen-episode
   reference: a measurement has to work whether or not an episode exists,
   the same reason ticket 06's side_effect stands alone. */
const SCHEMA_V5 = `
CREATE TABLE measurement (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('waist','hips','chest','underbust')),
  value      REAL NOT NULL,
  unit       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_measurement_type ON measurement(type, epoch_day);
`;

/* v6: the misgendering/correct-gendering tally (ticket 10). A tally event is
   its own record type, not entry content like a body region - it carries no
   mood, dimension values, tags or note, only which of the two counters was
   tapped and an optional free-text context, so it gets a table of its own
   rather than a join table off entry. `kind` is a fixed two-value CHECK, the
   same treatment reminder.type already gets, because the two counters are
   never extended or user-defined. */
const SCHEMA_V6 = `
CREATE TABLE tally_event (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('misgendered', 'correctly_gendered')),
  context    TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_tally_kind_day ON tally_event(kind, epoch_day);
`;

/* v7: the regimen episode area (phase 4 ticket 01, CONTEXT: "Regimen
   episode"). Greenfield - no regimen/dose/medication table existed before
   this. uuid-only identity (ADR-0002): every regimen episode is a user's
   own row, with no built-in counterpart to key by.

   No `end_epoch_day` column: an episode's end is derived from the next
   episode's start, never stored (ADR-0010), which is what lets a
   retroactive correction (a new episode inserted with a past start date)
   change every affected record's attribution without a migration or a
   stored link to rewrite. */
const SCHEMA_V7 = `
CREATE TABLE regimen_episode (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  drug            TEXT NOT NULL,
  ester           TEXT,
  dose            REAL NOT NULL,
  dose_unit       TEXT NOT NULL,
  route           TEXT NOT NULL,
  interval        TEXT NOT NULL,
  start_epoch_day INTEGER NOT NULL,
  hidden          INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_regimen_episode_start ON regimen_episode(start_epoch_day);
`;

/* v8: the dose log (phase 4 ticket 02, CONTEXT: "Dose event").

   `dose_event` has no episode column, deliberately. Which regimen episode a
   dose belongs to is resolved from its own timestamp (regimenEpisode.ts)
   every time it is asked, so backdating a dose - or inserting a corrective
   episode underneath one - changes the answer with nothing to rewrite. A
   stored link would be the migration ticket 01 exists to avoid.

   `timestamp` is epoch milliseconds, not an epoch day: ticket 03 derives
   hours-since-last-dose from it and sublingual estradiol peaks in one to
   two hours, so a day would round away the thing being derived.

   The route-conditional fields are nullable columns here because SQLite has
   no union type; the domain type is a union on route (types.ts) and the
   area module (doses.ts) is what turns one into the other, so an oral dose
   never surfaces a null site to a screen.

   `dose_schedule.episode_id` is UNIQUE: an episode expects one rhythm at a
   time, and a second row would leave "how often" ambiguous. Both child
   tables cascade from the episode rowid the way every other child table
   does, which is also what lets ticket 14's Replace import empty them by
   deleting episodes. */
const SCHEMA_V8 = `
CREATE TABLE dose_event (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                TEXT NOT NULL UNIQUE,
  timestamp           INTEGER NOT NULL,
  route               TEXT NOT NULL,
  dose                REAL NOT NULL,
  dose_unit           TEXT NOT NULL,
  injection_site      TEXT,
  vehicle             TEXT,
  application_site    TEXT,
  status              TEXT NOT NULL,
  scheduled_dose      REAL,
  scheduled_route     TEXT,
  scheduled_timestamp INTEGER,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX idx_dose_event_timestamp ON dose_event(timestamp);

CREATE TABLE dose_schedule (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid          TEXT NOT NULL UNIQUE,
  episode_id    INTEGER NOT NULL UNIQUE REFERENCES regimen_episode(id) ON DELETE CASCADE,
  every_n_days  INTEGER NOT NULL,
  doses_per_day INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE dose_pause (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  episode_id      INTEGER NOT NULL REFERENCES regimen_episode(id) ON DELETE CASCADE,
  start_epoch_day INTEGER NOT NULL,
  end_epoch_day   INTEGER,
  reason          TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_dose_pause_episode ON dose_pause(episode_id);
`;

/* v9: lab draw context (phase 4 ticket 03, CONTEXT: "Lab draw context").

   `provider` is free text with no list behind it, exactly as free as an
   analyte's `unit`: normalizing it would mean deciding that two spellings
   name one lab, and the step after that is deciding which lab's numbers
   are comparable with which (CONTEXT: "Analyte").

   `draw_time` is a local wall-clock 'HH:MM' like `reminder.time`, not a
   timestamp. `epoch_day` already says which day the result belongs to, and
   a second column that could disagree with it is the ambiguity CONTEXT.md
   keeps out of an Entry's Timestamp. Nullable because a lab slip often
   carries no time, and because day-of-interval does not need one.

   The timing columns are the route-conditional pair, nullable here the way
   dose_event's site columns are: SQLite has no union type, the domain type
   is a union on route (types.ts), and the labs area is what turns one into
   the other. `timing_hours` is REAL and keeps its fraction, since
   sublingual estradiol peaks inside two hours.

   THESE COLUMNS STORE A DERIVED FIGURE, WHICH ADR-0010 FORBIDS. The
   exception is deliberate, and the acceptance criteria pin it (ticket 03,
   box 6), so read this before removing it in ADR-0010's name.

   ADR-0010's case is about columns that drift out of agreement with the
   rows they were computed from: `milestone.kind` goes stale the day its
   date passes, `reminder.trigger_time` shifts by an hour across a DST
   boundary. Both have inputs that are still there to be recomputed from,
   which is exactly why the stored copy is the wrong one.

   This figure has no such input. It is measured against the dose log as it
   stood when the draw was recorded, and that log is not recoverable later:
   a dose corrected in November changes what a recomputation would say
   about a draw in August, silently rewriting the context on a result
   someone has already taken to an appointment and discussed. So the stored
   figure cannot drift out of agreement with anything - it is a recorded
   observation about a moment, in the same category as the value beside it,
   not a cache of a live computation. Ticket 01's derived episode end and
   ticket 02's absent episode link are still the rule; this is the one
   place the rule would destroy the data it was protecting.

   What follows from it: editing a dose event never touches a saved
   context. Correcting the draw's own day or time does recompute it, since
   that voids the figure outright rather than adjusting its input
   (labs.ts). */
const SCHEMA_V9 = `
ALTER TABLE lab_result ADD COLUMN provider TEXT NOT NULL DEFAULT '';
ALTER TABLE lab_result ADD COLUMN draw_time TEXT;
ALTER TABLE lab_result ADD COLUMN timing_route TEXT;
ALTER TABLE lab_result ADD COLUMN timing_hours REAL;
ALTER TABLE lab_result ADD COLUMN timing_day_of_interval INTEGER;
`;

/* v10: medication stock and its run-out prompt (phase 4 ticket 04, CONTEXT:
   pending - "Dose event", "Regimen episode").

   `medication_stock` holds what the user reported, not a decremented
   number: one row per drug (`drug` UNIQUE, matched exactly the way an
   analyte's unit or a lab provider is - CONTEXT: "Analyte", "Lab
   provider" - not by regimen episode, since a dose or route change starts
   a new episode and an episode-scoped count would go stale on the very
   next adjustment). "Remaining" is `quantity` minus every non-skipped dose
   logged against that drug since `recorded_epoch_day`, worked out on read
   (stockProjection.ts) - storing the subtraction itself would be the
   `reminder.trigger_time` mistake ADR-0010 already rejected: it would need
   rewriting after every dose, every edit, every delete and every import,
   and drift the first time one of those paths forgot. This is not the
   exception ticket 03 made for a lab result's dosing context: that figure
   is measured against a dose log that will not exist to recompute against
   later, while every dose this stock projects over is still sitting in
   `dose_event`, readable on demand.

   The two reminder columns are bookkeeping for box 4's run-out prompt
   (stockReminder.ts), not the projection: `reminder_ever_created` records
   that this drug has had an auto-managed Reminder at some point, and
   `reminder_dismissed` records that a person's own edit or delete took it
   over. Both live here rather than on the Reminder row because a person
   deleting that row is exactly the event this has to survive - if the
   marker went with it, the next dose write would recreate the very prompt
   they just silenced. A fresh `upsertEntry` (stock.ts) clears both: saving
   a new count is a deliberate act, and re-arming there is not the same
   thing as a background dose write conjuring a dismissed prompt back up.

   `reminder.auto_source` is the other half of that handoff: nullable, and
   left alone by every write except stock.ts's own, so a person saving a
   reminder through the ordinary editor clears it purely by never knowing
   it exists - the moment they touch their own copy, this feature stops
   touching it too. */
const SCHEMA_V10 = `
CREATE TABLE medication_stock (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                  TEXT NOT NULL UNIQUE,
  drug                  TEXT NOT NULL UNIQUE,
  quantity              REAL NOT NULL,
  unit                  TEXT NOT NULL,
  recorded_epoch_day    INTEGER NOT NULL,
  reminder_ever_created INTEGER NOT NULL DEFAULT 0,
  reminder_dismissed    INTEGER NOT NULL DEFAULT 0,
  updated_at            INTEGER NOT NULL
);

ALTER TABLE reminder ADD COLUMN auto_source TEXT;
`;

/* v11: the side-effect log (phase 4 ticket 06). A first-class symptom
   record - name/type, severity, a day - structurally independent of the
   regimen episode model: it carries no episode reference, so it works
   whether or not ticket 01's regimen_episode table exists yet.

   Not modeled as, or alongside, entry: it carries no mood, dimension
   values, tags or note (CONTEXT: "Side effect"). severity is an ordered
   1-5 scale, backed by a CHECK the same way reminder's recurrence is - the
   area validates it before the write, and the schema is the backstop.
   epoch_day rather than a timestamp (ADR-0001): a side effect is something
   noticed on a day, with none of a dose event's intraday timing to keep. */
const SCHEMA_V11 = `
CREATE TABLE side_effect (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  severity   INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  epoch_day  INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_side_effect_epoch_day ON side_effect(epoch_day);
`;

/* v12: the personal effects timeline (phase 4 ticket 07). Four fixed
   markers - breast development, fat redistribution, skin softening, hair
   changes - each a single "first noticed" day, one row per effect
   (`effect` UNIQUE) the same way medication_stock is one row per drug
   (migrations.ts v10): a person answers "when did I first notice this",
   never "how much have I noticed since last time", so a fresh date
   replaces the old one rather than appending to a log. No row at all
   means the effect has not been marked yet, which is why the column is
   NOT NULL rather than nullable - there is nothing to store until a
   person marks it.

   No regimen-episode reference: the anchor these markers are read against
   is the earliest episode's start day (regimenEpisode.ts), resolved above
   this seam at read time rather than stored here, the same reason
   dose_event carries no episode link either. */
const SCHEMA_V12 = `
CREATE TABLE personal_effect (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                    TEXT NOT NULL UNIQUE,
  effect                  TEXT NOT NULL UNIQUE
                          CHECK (effect IN ('breast_development','fat_redistribution','skin_softening','hair_changes')),
  first_noticed_epoch_day INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
`;

/* v13: Norwood-Hamilton hair-progress staging and its scheduled
   fixed-position photos (phase 4 ticket 09).

   `hair_stage` is a dated series like `measurement` (v5), not a single
   replaced value like `personal_effect` (v12): a person re-stages over
   time, so this is many rows, not one row per something. `stage` is a
   closed CHECK over the published scale's twelve labels, the same
   free-value-but-fixed-set treatment `measurement.type` gets.

   `hair_photo` is its own table rather than a third owner arm on `photo`
   (SCHEMA_V1, ADR-0008): `photo`'s exactly-one-owner CHECK is over two
   columns, and SQLite cannot ALTER a table-level CHECK in place - widening
   it to three owners needs a full table rebuild (copy, drop, recreate),
   a bigger and riskier migration on the table every entry and milestone
   already depends on than this ticket's photos need. The shared pipeline
   is still reused exactly as ticket 09 asks: normalizePhoto and
   photos.ts's stagePhoto write the same normalized, metadata-stripped
   bytes through the same file-before-row order, and removeFilesOf reclaims
   them the same way on delete (journal/hairProgress.ts) - only the row
   naming the files lives in its own table, and the boot orphan sweep
   (sweepOrphanPhotos, photos.ts) reads both tables so a hair photo's files
   are reclaimed exactly like any other's.

   Neither table carries an anchor or an episode reference: what these are
   read against - the earliest finasteride/dutasteride/minoxidil dose - is
   resolved above this seam (hairTreatmentAnchor.ts), the same reason
   `personal_effect` carries none either. */
const SCHEMA_V13 = `
CREATE TABLE hair_stage (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  stage      TEXT NOT NULL CHECK (stage IN ('1','2','2a','3','3v','3a','4','4a','5','5a','6','7')),
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_hair_stage_epoch_day ON hair_stage(epoch_day);

CREATE TABLE hair_photo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  file_path  TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_hair_photo_epoch_day ON hair_photo(epoch_day);
`;

/* v14: the doubt journal (phase 4 ticket 11, CONTEXT: "Doubt entry",
   "Counterevidence snapshot"). Free-write reflection for a "not trans
   enough" spiral, its own record type - it carries no mood, dimension
   values, tags or note beyond the one free-write field (CONTEXT: "Entry"),
   the same reasoning `tally_event` (v6) and `side_effect` (v11) are their
   own tables rather than a variant of `entry`.

   `doubt_snapshot` and `doubt_snapshot_entry` hold a one-tap capture of
   which of the user's own euphoria-tagged entries were on screen as
   counterevidence when a person tapped save. They are copied in rather
   than referenced by the source entry's id.

   THIS PAIR STORES DERIVED DATA, WHICH ADR-0010 FORBIDS ON ITS FACE. The
   exception is the same one lab_result's dosing-context columns argue
   above (v9): the figure is measured against a moment - the counterevidence
   list as it read when "save" was tapped - that is not recoverable later,
   since the source entry can be edited, untagged or deleted afterwards. So
   the copy cannot drift out of agreement with anything; it is a recorded
   observation, not a cache of a live computation. Re-deriving it from a
   live join on every read would let exactly the edit, untagging or
   deletion above silently rewrite what a past snapshot showed, defeating
   the feature's own point - rereading later what convinced someone then.

   `doubt_snapshot_entry` carries no identity of its own (no uuid, no
   updated_at) and no link back to the source entry's row: like
   `entry_dimension_value`, it is a detail row that lives and dies with its
   parent snapshot, never a thing addressed on its own. */
const SCHEMA_V14 = `
CREATE TABLE doubt_entry (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  timestamp  INTEGER NOT NULL,
  text       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_doubt_entry_epoch_day ON doubt_entry(epoch_day);

CREATE TABLE doubt_snapshot (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  timestamp  INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_doubt_snapshot_epoch_day ON doubt_snapshot(epoch_day);

CREATE TABLE doubt_snapshot_entry (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES doubt_snapshot(id),
  order_index INTEGER NOT NULL,
  epoch_day   INTEGER NOT NULL,
  mood        INTEGER,
  note        TEXT NOT NULL
);
CREATE INDEX idx_doubt_snapshot_entry_snapshot ON doubt_snapshot_entry(snapshot_id);
`;

/* v15: name and pronoun tryouts (phase 4 ticket 16, CONTEXT: "Tryout",
   "Felt-sense entry"). Greenfield - no prior table tracked a name or
   pronoun set someone was trying.

   No "current tryout" column or flag: several tryouts can be in progress
   at once (a name and a pronoun set tried together) or entirely in the
   past, and nothing here may force exactly one to be it. `end_epoch_day`
   is nullable for the same reason `dose_pause.end_epoch_day` is (v8) -
   null means still going, not "forgot to close it out".

   No entry link of any kind: which entries fall inside a tryout's date
   range is read at query time against `start_epoch_day`/`end_epoch_day`
   (ADR-0010), the same rule regimen_episode's missing `end_epoch_day`
   argues at v7. Storing one would drift the moment a tryout's dates were
   corrected after entries had already been logged against it.

   `tryout_felt_sense` gets its own uuid and updated_at, unlike
   doubt_snapshot_entry (v14): a felt-sense observation is watched change
   over the tryout's life and is addressed, edited and deleted on its own,
   never written and forgotten alongside its parent - the same shape
   dose_pause has against regimen_episode. `mood` reuses the app's one
   five-level scale (CONTEXT: "Mood") rather than a second one for the
   same kind of judgement, and is required: a felt-sense row with no
   rating is the one thing this table exists to hold. */
const SCHEMA_V15 = `
CREATE TABLE tryout (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL CHECK (kind IN ('name', 'pronouns')),
  label           TEXT NOT NULL,
  start_epoch_day INTEGER NOT NULL,
  end_epoch_day   INTEGER,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_tryout_start ON tryout(start_epoch_day);

CREATE TABLE tryout_felt_sense (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  tryout_id  INTEGER NOT NULL REFERENCES tryout(id) ON DELETE CASCADE,
  epoch_day  INTEGER NOT NULL,
  mood       INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  note       TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_tryout_felt_sense_tryout ON tryout_felt_sense(tryout_id);
`;

/* v16: time-capsule letters (phase 4 ticket 19, CONTEXT: "Milestone",
   "Countdown", "Anniversary"). A free-write note to the person's future
   self, sealed until `unlock_epoch_day`.

   No `sealed` column: whether a letter is readable is a question about
   today, the same reasoning that keeps `kind` off `milestone` (ADR-0010).
   Screens compare `unlock_epoch_day` against today's epoch day and refuse
   to render the text before it, the same way milestoneStatus() decides a
   milestone's presentation above the schema rather than in it.

   No reference to a specific milestone row either: the ticket's unlock
   condition is a date, chosen either by typing one or by copying a
   milestone's own date into the picker, and nothing here needs to keep
   tracking that milestone afterwards - a letter sealed against "two years
   on hormones" still means that day if the milestone is later renamed or
   deleted.

   No second cryptographic layer: the journal is already encrypted whole-
   database (ADR-0020), so this row is protected exactly as every other
   journal row already is, and a UI-level gate is the entire feature. */
const SCHEMA_V16 = `
CREATE TABLE letter (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid             TEXT NOT NULL UNIQUE,
  epoch_day        INTEGER NOT NULL,
  text             TEXT NOT NULL,
  unlock_epoch_day INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX idx_letter_epoch_day ON letter(epoch_day);
`;

/* v17: transition-roadmap progress (phase 4 ticket 23, CONTEXT: "Roadmap
   goal", "Country pack"). The pack's content itself is not here and
   never will be: a country pack is a bundled content module read
   synchronously off the bundle (roadmap.ts), so what a person is working
   through is a build artifact and what they have ticked off is the only
   part that is theirs.

   A row exists exactly when a goal is ticked, and unticking deletes it.
   No `checked` column, and no row seeded per goal per pack at install
   time: a table pre-filled with every goal of every pack would have to be
   migrated each time a pack gained an item, which is the schema change
   this ticket's contributable-pack requirement rules out.

   No uuid either, unlike letter (v16) or tryout (v15) and for the same
   reason `tag` identifies a built-in by `key` instead - ADR-0002, whose
   amendment for this ticket argues the case a tick is neither of its two
   branches: a tick
   is named by which pack and which goal, and those two strings mean the
   same thing on every device. Two installs that ticked the same goal
   ticked the same goal, so an archive matches on the pair and a merge has
   nothing to reconcile.

   `pack_key` is not constrained to a list of packs. Storing the pack a
   goal came from as free text is what lets a second country's pack ship
   as content alone, with no migration behind it; the price is that a row
   can outlive a pack that stops being bundled, which is the right way
   round - a stale row is invisible and harmless, whereas a CHECK
   constraint would make removing a pack a migration too. */
const SCHEMA_V17 = `
CREATE TABLE roadmap_check (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_key   TEXT NOT NULL,
  goal_key   TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (pack_key, goal_key)
);
`;

export const migrations: Migration[] = [
  { version: 1, sql: SCHEMA_V1 },
  { version: 2, sql: SCHEMA_V2 },
  { version: 3, sql: SCHEMA_V3 },
  { version: 4, sql: SCHEMA_V4 },
  { version: 5, sql: SCHEMA_V5 },
  { version: 6, sql: SCHEMA_V6 },
  { version: 7, sql: SCHEMA_V7 },
  { version: 8, sql: SCHEMA_V8 },
  { version: 9, sql: SCHEMA_V9 },
  { version: 10, sql: SCHEMA_V10 },
  { version: 11, sql: SCHEMA_V11 },
  { version: 12, sql: SCHEMA_V12 },
  { version: 13, sql: SCHEMA_V13 },
  { version: 14, sql: SCHEMA_V14 },
  { version: 15, sql: SCHEMA_V15 },
  { version: 16, sql: SCHEMA_V16 },
  { version: 17, sql: SCHEMA_V17 }
];

/** The newest schema this build can produce. Two things refuse a database
    numbered higher than this rather than guessing at it (ADR-0006): the
    migration runner, which computes it from whatever array it was handed,
    and ticket 10's conversion, which has no array to hand and asks here. */
export const LATEST_SCHEMA_VERSION = Math.max(...migrations.map((migration) => migration.version));
