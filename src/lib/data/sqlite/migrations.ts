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

   No `end_epoch_day` column here: an episode's end was derived from the
   next episode's start, never stored (ADR-0010), which is what let a
   retroactive correction (a new episode inserted with a past start date)
   change every affected record's attribution without a migration or a
   stored link to rewrite. v40 adds the column and stops relying on that
   derivation, once two episodes for different drugs are allowed to
   overlap and there is no longer a single "next" episode to derive one
   from. */
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
   person marks it. Widened to eight markers by v19.

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
   read against is resolved above this seam (hairAnchor.ts), the same reason
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

/* v17: voice recordings (phase 4 ticket 24, CONTEXT: "Voice recording"). An
   entry-only file-carrying row - its own table rather than a third owner
   arm on `photo` (SCHEMA_V1), for the same reason `hair_photo` (v13) got
   its own table rather than widening `photo`'s CHECK: SQLite cannot ALTER
   a table-level CHECK in place. Simpler than either precedent, though:
   ticket 24 excludes milestones, so there is only ever one owner column,
   and `entry_id` is plain NOT NULL rather than a CHECK across two nullable
   columns.

   No thumbnail pair: a recording has one file, not the full-plus-thumb pair
   normalize() gives a photo (ADR-0008). It shares photo's file store and
   the same file-before-row/row-before-file ordering (journal/photos.ts's
   header comment), so the boot orphan sweep has to read this table too
   (sweepOrphanPhotos, journal/photos.ts) or every saved recording looks
   orphaned the moment it runs. */
const SCHEMA_V17 = `
CREATE TABLE voice_recording (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  entry_id    INTEGER NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_voice_recording_entry ON voice_recording(entry_id);
`;

/* v18: transition-roadmap progress (phase 4 ticket 23, CONTEXT: "Roadmap
   goal", "Country pack"). The pack's content itself is not here and never
   will be: a country pack is a bundled content module read synchronously
   off the bundle (roadmap.ts), so what a person is working through is a
   build artifact and what they have ticked off is the only part that is
   theirs.

   A row exists exactly when a goal is ticked, and unticking deletes it.
   No `checked` column, and no row seeded per goal per pack at install
   time: a table pre-filled with every goal of every pack would have to be
   migrated each time a pack gained an item, which is the schema change
   this ticket's contributable-pack requirement rules out.

   No uuid either, unlike letter (v16) or tryout (v15), and ADR-0002's
   amendment for this ticket argues why a tick is neither of that ADR's two
   branches. In short: a tick is named by which pack and which goal, both of
   which name bundled content and so mean the same thing on every device.
   Two installs that ticked the same goal ticked the same goal, so an
   archive matches on the pair and a merge has nothing to reconcile.

   `pack_key` is not constrained to a list of packs. Storing the pack a
   goal came from as free text is what lets a second country's pack ship
   as content alone, with no migration behind it; the price is that a row
   can outlive a pack that stops being bundled, which is the right way
   round - a stale row is invisible and harmless, whereas a CHECK
   constraint would make removing a pack a migration too. */
const SCHEMA_V18 = `
CREATE TABLE roadmap_check (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_key   TEXT NOT NULL,
  goal_key   TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (pack_key, goal_key)
);
`;

/* v19: the personal effects timeline widens to eight markers, adding
   voice drop, facial/body hair, masculinizing fat redistribution and
   cycle cessation alongside v12's four feminizing ones (phase 5 ticket
   02). Deliberate reversal of v12's own closed-list rule, once, to reach
   trans-masc parity - see PersonalEffectType's doc comment (types.ts) for
   why, and why eight is the new closed count rather than an opening to a
   ninth.

   SQLite cannot ALTER a column CHECK in place, the same limitation v13's
   comment describes for `photo`'s owner CHECK - so this is a rebuild:
   copy the table under the widened constraint, drop the old one, rename.
   Existing markers carry across unchanged; only the allowed vocabulary
   grows. */
const SCHEMA_V19 = `
CREATE TABLE personal_effect_v19 (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                    TEXT NOT NULL UNIQUE,
  effect                  TEXT NOT NULL UNIQUE
                          CHECK (effect IN (
                            'breast_development','fat_redistribution','skin_softening','hair_changes',
                            'voice_drop','facial_body_hair','masculinizing_fat_redistribution','cycle_cessation'
                          )),
  first_noticed_epoch_day INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
INSERT INTO personal_effect_v19 (id, uuid, effect, first_noticed_epoch_day, updated_at)
  SELECT id, uuid, effect, first_noticed_epoch_day, updated_at FROM personal_effect;
DROP TABLE personal_effect;
ALTER TABLE personal_effect_v19 RENAME TO personal_effect;
`;

/* v20: free-text checklists (phase 5 ticket 05, CONTEXT: "Checklist"). A
   checklist item is entirely the user's own content with no bundled
   counterpart, so both a checklist and its items carry a minted uuid like
   any other user-owned row (ADR-0002) rather than a content key -
   `roadmap_check` (v18) is the opposite case, a tick with no data of its
   own.

   A checklist's owner is a nullable (kind, uuid) pair rather than a foreign
   key: no owner table ships with this ticket (ticket 07's procedure is the
   first one that will), and the pair lets that or any later owner kind
   reuse this table with no migration of its own. Both columns are NULL
   together for a standalone checklist (ticket 11) or set together for an
   owned one (ticket 07); the CHECK rules out the half-set case a typo could
   otherwise write silently. */
const SCHEMA_V20 = `
CREATE TABLE checklist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  owner_kind TEXT,
  owner_uuid TEXT,
  updated_at INTEGER NOT NULL,
  CHECK ((owner_kind IS NULL) = (owner_uuid IS NULL))
);
CREATE INDEX idx_checklist_owner ON checklist(owner_kind, owner_uuid);

CREATE TABLE checklist_item (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  checklist_id    INTEGER NOT NULL REFERENCES checklist(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  checked         INTEGER NOT NULL DEFAULT 0,
  carried_forward INTEGER NOT NULL DEFAULT 0,
  order_index     INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_checklist_item_checklist ON checklist_item(checklist_id);
`;

/* v21: the cycle event log (phase 5 ticket 03, CONTEXT: "Cycle event"). A
   menstrual event for people on testosterone - period occurred, spotting,
   nothing this month - structurally independent of the regimen episode
   model, the same reasoning `tally_event` (v6) and `side_effect` (v11)
   are their own tables for: no episode reference, so it works whether or
   not a regimen episode exists. `kind` is a fixed three-value CHECK, the
   same treatment tally_event.kind already gets, because the three states
   are never extended or user-defined - "nothing this month" is a real,
   loggable state here, not the absence of a row. epoch_day rather than a
   timestamp (ADR-0001): a cycle event is something noticed on a day, with
   none of a dose event's intraday timing to keep. */
const SCHEMA_V21 = `
CREATE TABLE cycle_event (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('period_occurred', 'spotting', 'nothing_this_month')),
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_cycle_event_epoch_day ON cycle_event(epoch_day);
`;

/* v22: the binder/tucking wear log (phase 5 ticket 04, CONTEXT: "Wear
   session"). Its own record type, not an Entry: no mood, dimension values,
   tags or note beyond the one free-text comfort/pain field it carries.

   duration_ms is nullable to hold a live session's running state - a start
   timestamp set and no stop tapped yet - the same way dose_pause's
   end_epoch_day is null for a pause still running. A backfilled session
   never has a null duration: its day and duration are both known at save
   time, so there is nothing left running to represent.

   No episode reference, the same reason side_effect and personal_effect
   have none: a wear session has to work whether or not a regimen episode
   exists. Its optional Reminder is not a column here either - it is an
   ordinary reminder row, matched back to its session by an auto_source
   marker (wearSessions.ts), the same handoff medication_stock's run-out
   prompt uses. */
const SCHEMA_V22 = `
CREATE TABLE wear_session (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  start_timestamp INTEGER NOT NULL,
  duration_ms     INTEGER,
  note            TEXT,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_wear_session_start ON wear_session(start_timestamp);
`;

/* v23: hair-removal sessions (phase 5 ticket 08). An electrolysis/laser
   session log - date, area, method, pain rating, cost, provider - the same
   reasoning `side_effect` (v11) and `cycle_event` (v21) are their own
   tables for: no episode reference, so it works whether or not a regimen
   episode exists.

   `area` is a closed CHECK over hairRemovalAreas.ts's own vocabulary,
   deliberately separate from `entry_body_region.region` (v4, opened to a
   reference-data area by v32) - a treatment area is finer-grained and
   procedural, not a dysphoria hotspot, so this never reuses or widens that
   list. `method` is a small
   closed CHECK the same way. `pain_rating` gets the identical CHECK
   `side_effect.severity` does - the area validates it before the write, and
   the schema is the backstop. `cost` and `provider` are plain TEXT with no
   CHECK, the same free-text treatment `lab_result.provider` already gets.

   `hair_removal_photo` is its own table rather than a third owner arm on
   `photo` (SCHEMA_V1, ADR-0008) - the same reason `hair_photo` (v13) is:
   `photo`'s exactly-one-owner CHECK cannot be widened in place. Unlike
   `hair_photo`, though, a session photo genuinely belongs to one session -
   a before/after picture of that treatment - so it carries a `session_id`
   foreign key rather than standing as its own independently dated series.
   The shared pipeline is still reused exactly as the ticket asks:
   normalizePhoto and photos.ts's stagePhoto write the same normalized,
   metadata-stripped bytes through the same file-before-row order, and
   removeFilesOf reclaims them the same way on delete
   (journal/hairRemoval.ts) - the boot orphan sweep (sweepOrphanPhotos,
   photos.ts) reads this table too so a session photo's files are reclaimed
   exactly like any other's. */
const SCHEMA_V23 = `
CREATE TABLE hair_removal_session (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  area       TEXT NOT NULL
             CHECK (area IN ('upper_lip','chin','neck','underarms','chest','abdomen','back','arms','legs','bikini_line')),
  method     TEXT NOT NULL CHECK (method IN ('laser','electrolysis','other')),
  pain_rating INTEGER NOT NULL CHECK (pain_rating BETWEEN 1 AND 5),
  cost       TEXT NOT NULL,
  provider   TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_hair_removal_session_epoch_day ON hair_removal_session(epoch_day);
CREATE INDEX idx_hair_removal_session_area ON hair_removal_session(area);

CREATE TABLE hair_removal_photo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  session_id INTEGER NOT NULL REFERENCES hair_removal_session(id) ON DELETE CASCADE,
  file_path  TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_hair_removal_photo_session ON hair_removal_photo(session_id);
`;

/* v24: entry trash with a 30-day undo window (phase 5 ticket 19). A trashed
   entry is marked, not moved: `trashed_at` sits on the same `entry` row for
   as long as it is trashed, so it stays covered by the same whole-database
   encryption every other row already has (ADR-0020) - no second table, no
   second crypto layer, the same reasoning the letter migration (v16) gives.
   NULL means "in the journal"; every entry-reading query (entries.ts,
   stats.ts, photos.ts, voiceRecordings.ts, archiveRead.ts) filters on it,
   the same way a hidden tag stays out of the pickers rather than being
   deleted. A trashed entry's photos and recordings are not touched - they
   stay exactly as they were, and come back with the entry on restore.

   The sweep that turns an expired trash row into a real delete runs at
   boot (entries.ts's purgeExpiredTrash), the same shape sweepOrphanPhotos
   already has. */
const SCHEMA_V24 = `
ALTER TABLE entry ADD COLUMN trashed_at INTEGER;
CREATE INDEX idx_entry_trashed_at ON entry(trashed_at);
`;

/* v25: the surgery journey module (phase 5 ticket 07, CONTEXT: "Procedure").
   One row per procedure someone is going through - top surgery, facial
   feminization surgery, orchiectomy - and nothing about the module assumes
   exactly one is active: two can run concurrently or in sequence, so this is
   a plain table rather than a single-row settings blob.

   `name` is free text with no list behind it, the same treatment
   `lab_result.provider` (v9) and `hair_removal_session.provider` (v23) get,
   and for the stronger reason here: the set of procedures a trans person may
   have is not something this app gets to enumerate.

   `surgery_epoch_day` is nullable because a procedure record usually starts
   life at the consult, with a date not yet set - and the day counter over it
   is derived, never stored (recoveryDay.ts, ADR-0010), so there is no
   companion column for how far along recovery is. `notes` is the recovery
   log's own free text, one field rather than a dated series: the ticket dates
   the photo log and nothing else.

   Consult dates are their own table rather than a repeated column because
   the ticket says dates, plural, and a person may have several before a date
   is set. `procedure_photo` is its own table rather than a third owner arm on
   `photo` (SCHEMA_V1, ADR-0008) for the reason v13 and v23 give: `photo`'s
   exactly-one-owner CHECK cannot be widened in place. It carries both a
   `procedure_id` foreign key and an `epoch_day`, unlike either existing
   photo table - a recovery photo belongs to one procedure the way a session
   photo belongs to one session (v23), and is dated the way a hair photo is
   (v13), because when in recovery it was taken is the whole point of it. The
   shared pipeline is untouched: normalizePhoto and photos.ts's stagePhoto
   write the same normalized, metadata-stripped bytes through the same
   file-before-row order, removeFilesOf reclaims them the same way on delete
   (journal/procedures.ts), and the boot orphan sweep (sweepOrphanPhotos,
   photos.ts) reads this table too.

   A procedure's recovery checklist is not here: it is an ordinary
   `checklist` (v20) owned by the (kind, uuid) pair v20 was given for exactly
   this, which is why no checklist column appears below. */
const SCHEMA_V25 = `
CREATE TABLE procedure (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  surgery_epoch_day INTEGER,
  notes             TEXT NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_procedure_surgery_epoch_day ON procedure(surgery_epoch_day);

CREATE TABLE procedure_consult (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT NOT NULL UNIQUE,
  procedure_id INTEGER NOT NULL REFERENCES procedure(id) ON DELETE CASCADE,
  epoch_day    INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_procedure_consult_procedure ON procedure_consult(procedure_id);

CREATE TABLE procedure_photo (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT NOT NULL UNIQUE,
  procedure_id INTEGER NOT NULL REFERENCES procedure(id) ON DELETE CASCADE,
  epoch_day    INTEGER NOT NULL,
  file_path    TEXT NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_procedure_photo_procedure ON procedure_photo(procedure_id, epoch_day);
`;

/* v26: `starred` on entry and photo (phase 5 ticket 14). Curation metadata,
   the same category the uuid/identity fields already are - not one of
   Entry's seven content fields (CONTEXT: "Entry"), so it never enters
   entryContent.ts's closure check and starring an entry can never be what
   keeps an otherwise-empty one from counting as deleted. Joins
   'g-euphoria'-tagged entries in the doubt journal's counterevidence pool
   (entries.ts's counterevidencePool). */
const SCHEMA_V26 = `
ALTER TABLE entry ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photo ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
`;

/* v27: custom affirmations (phase 5 ticket 15, CONTEXT: "Affirmation"). The
   check-in's affirming line has been a pool of fourteen hardcoded message
   keys with no database row at all (reminders/affirmations.ts); this gives
   it the same built-in/custom split tags already have (ADR-0002) so a
   person can add their own lines and hide an individual built-in one.

   `key`/`uuid` is the same dual identity `tag` uses: a built-in row is
   seeded by reconcileBuiltIns with `text = ''` (its wording lives in the
   message catalogue, looked up by key) and a custom row carries a minted
   uuid and the line the person actually wrote. No order_index: the check-in
   picks a line by `epochDay % pool.length()` (ReminderAlarmReceiver.java),
   never by a position a person chose, so there is nothing here for a drag
   to reorder.

   `language` is null for a built-in - its wording is looked up fresh in
   whatever language is active, the same as any other built-in row - and
   'en' or 'pl' for a custom, which is authored once and never translated
   (CONTEXT: "Custom"). The CHECK is the same closed-set treatment
   `tally_event.kind` gets; nothing here enforces language and key/uuid
   moving together; the write path (journal/affirmations.ts) is what keeps
   a built-in's language null and a custom's key null, the same way `tag`
   leaves that pairing to tags.ts rather than a table-level CHECK. */
const SCHEMA_V27 = `
CREATE TABLE affirmation (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT UNIQUE,
  key        TEXT UNIQUE,
  language   TEXT CHECK (language IN ('en', 'pl')),
  text       TEXT NOT NULL DEFAULT '',
  hidden     INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_affirmation_language ON affirmation(language);
`;

/* v28: a "not my path" tri-state on any roadmap goal, and a custom goal to
   put it on (phase 5 ticket 20, CONTEXT: "Roadmap goal", "Custom").

   roadmap_check's row already existed only because a goal was ticked
   (v18); `status` widens what that existence can mean without touching
   the pair it is keyed on, so a row still exists exactly when a bundled
   goal has anything at all recorded against it, checked or not-my-path,
   and deleting it is still what unchecking means. The default backfills
   every row a device already has to 'checked', which is what its bare
   existence meant before this column existed.

   A custom goal cannot reuse that row shape: ADR-0002's amendment argues
   a tick is safe with no uuid only because it carries no data of its own,
   and a custom goal is nothing but the user's own free text and a track.
   It gets the ordinary uuid treatment instead, like a custom tag, and its
   own `status` on the same row rather than a second table to join against
   - unlike a tick, its row exists whether or not it is checked, so
   'unchecked' is an ordinary value here rather than a row's absence.
   Ordered by `id` alone: appended to the end of its track on creation and
   never reordered (the ticket's own out-of-scope line), so the rowid
   already is the order. */
const SCHEMA_V28 = `
ALTER TABLE roadmap_check ADD COLUMN status TEXT NOT NULL DEFAULT 'checked';

CREATE TABLE roadmap_goal (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  track      TEXT NOT NULL,
  text       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'unchecked',
  updated_at INTEGER NOT NULL
);
`;

/* v29: a declared, dated break from journaling (phase 5 ticket 21, CONTEXT:
   "Streak" - amended). Modeled on `dose_pause` (v8): a dated range, open
   while `end_epoch_day` is null. No `episode_id` here, unlike dose_pause -
   this has nothing to do with a regimen, and has to work whether or not one
   exists, the same reasoning `side_effect` (v11) gives. No `reason` column
   either: ticket 21's scope is a start day and an optional end day only, not
   a planned/accidental distinction - `Streak`'s computation treats every
   pause the same regardless of why it was declared. */
const SCHEMA_V29 = `
CREATE TABLE journaling_pause (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  start_epoch_day INTEGER NOT NULL,
  end_epoch_day   INTEGER,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_journaling_pause_start ON journaling_pause(start_epoch_day);
`;

/* v30: video notes (phase 5 ticket 22, CONTEXT: "Video note"). The third
   file-carrying entry citizen alongside photo and voice_recording, and
   structurally voice_recording's twin (v17) rather than photo's: ticket 22
   excludes milestone ownership the same way ticket 24 did, so `entry_id` is
   plain NOT NULL with no CHECK across two nullable columns.

   Its own table for v17's reason - SQLite cannot ALTER a table-level CHECK
   in place, so widening `photo` was never available - and because a video
   note and a voice recording are not the same thing to read: an area that
   wants one does not want the other.

   One file, no thumbnail pair. A poster frame would be derived state and
   ADR-0010 keeps that out of the schema; playback reads the video itself
   (VideoNotePlayer.svelte). It shares photo's file store, so the boot
   orphan sweep has to read this table too (sweepOrphanPhotos,
   journal/photos.ts) or every saved video note looks orphaned the moment
   it runs. */
const SCHEMA_V30 = `
CREATE TABLE video_note (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  entry_id    INTEGER NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_video_note_entry ON video_note(entry_id);
`;

/* v31: a tryout's `kind` widens past name/pronoun to style, garment, makeup
   and presentation step (phase 5 ticket 13, CONTEXT: "Tryout"), and a
   tryout can carry photos of its own. The same reasoning ticket 16's own
   scope draws: a tryout is one record type covering whatever someone is
   trying, not a name/pronoun-specific one with a second type forked
   alongside it for everything else.

   SQLite cannot ALTER a column CHECK in place, the same limitation v19's
   comment describes for `personal_effect` - so `kind`'s rebuild follows
   that same shape: copy the table under the widened constraint, drop the
   old one, rename. Every existing row's `id` travels unchanged, which is
   what lets `tryout_felt_sense.tryout_id` - already pointing at those rows
   - resolve exactly as it did before the rebuild.

   `description` is a free-text field alongside `label`, for a kind
   label's own placeholder does not fit - a style or garment tryout needs
   more than the short field a name or pronoun set already gets. Nullable,
   since a name/pronoun tryout has no use for it.

   `tryout_photo` is its own table rather than a third owner arm on `photo`
   (the reason v13, v19's neighbours and v25 all give: that CHECK cannot
   be widened in place either). It carries both a `tryout_id` foreign key
   and its own `epoch_day`, the same shape `procedure_photo` (v25) takes
   for the same reason: a tryout photo belongs to one tryout and is dated
   in its own right, because when during the tryout it was taken is the
   whole point of it. The shared pipeline is untouched: stagePhoto and
   removeFilesOf (photos.ts) write and reclaim these files exactly as they
   do procedure_photo's. */
const SCHEMA_V31 = `
CREATE TABLE tryout_v31 (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL
                  CHECK (kind IN ('name', 'pronouns', 'style', 'garment', 'makeup', 'presentation_step')),
  label           TEXT NOT NULL,
  description     TEXT,
  start_epoch_day INTEGER NOT NULL,
  end_epoch_day   INTEGER,
  updated_at      INTEGER NOT NULL
);
INSERT INTO tryout_v31 (id, uuid, kind, label, description, start_epoch_day, end_epoch_day, updated_at)
  SELECT id, uuid, kind, label, NULL, start_epoch_day, end_epoch_day, updated_at FROM tryout;
DROP TABLE tryout;
ALTER TABLE tryout_v31 RENAME TO tryout;
CREATE INDEX idx_tryout_start ON tryout(start_epoch_day);

CREATE TABLE tryout_photo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  tryout_id  INTEGER NOT NULL REFERENCES tryout(id) ON DELETE CASCADE,
  epoch_day  INTEGER NOT NULL,
  file_path  TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_tryout_photo_tryout ON tryout_photo(tryout_id, epoch_day);
`;

/* v32: body regions become a reference-data area (phase 5 ticket 30,
   CONTEXT: "Reference data" - amended). `entry_body_region.region` (v4)
   stays plain TEXT with no CHECK, exactly as the ticket asks - this table
   is what a region key is validated against now, in place of the
   BODY_REGION_KEYS constant entries.ts used to hold in code. Same shape as
   `affirmation` (v27), the flat area closest to this one: `key` seeds the
   eight existing regions plus shoulders and whole body as built-ins,
   `uuid` mints a custom region's own travelling identity, and a row is
   built-in exactly when its key is not null. No `language` column -
   nothing here is per-locale the way an affirmation line is - and no
   `order_index`: the ticket asks for hide and add, never a reorder. */
const SCHEMA_V32 = `
CREATE TABLE body_region (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT UNIQUE,
  key        TEXT UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  hidden     INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
`;

/* v33: felt-sense on milestones too (phase 5 ticket 24, CONTEXT:
   "Felt-sense entry"), the same critique ticket 24 is grounded in -
   Chuanromanee & Metoyer (CHI 2023) found a transition app that tracked
   which milestones were reached but not how they felt.

   `tryout_felt_sense.tryout_id` was `NOT NULL`, so widening it to a second
   owner needs the same rebuild v31's own header gives for `photo`'s CHECK:
   SQLite cannot ALTER a table-level CHECK in place. Rather than a third
   per-owner table the way `tryout_photo`/`procedure_photo` answer that
   same limitation, this follows `photo` itself - one table, two nullable
   owner columns, a CHECK that exactly one is set - because a felt-sense row
   needs only a second arm, the same count `photo` widened from at v1, not a
   third one. The table is renamed `felt_sense` in the process: a name that
   said "tryout" stopped being true the moment a milestone could own one. */
const SCHEMA_V33 = `
CREATE TABLE felt_sense (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT NOT NULL UNIQUE,
  tryout_id    INTEGER REFERENCES tryout(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestone(id) ON DELETE CASCADE,
  epoch_day    INTEGER NOT NULL,
  mood         INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  note         TEXT,
  updated_at   INTEGER NOT NULL,
  CHECK ((tryout_id IS NOT NULL) + (milestone_id IS NOT NULL) = 1)
);
INSERT INTO felt_sense (id, uuid, tryout_id, milestone_id, epoch_day, mood, note, updated_at)
  SELECT id, uuid, tryout_id, NULL, epoch_day, mood, note, updated_at FROM tryout_felt_sense;
DROP TABLE tryout_felt_sense;
CREATE INDEX idx_felt_sense_tryout ON felt_sense(tryout_id);
CREATE INDEX idx_felt_sense_milestone ON felt_sense(milestone_id);
`;

/* v34: custom measurement types, and hide/unhide for a built-in one (phase
   5 ticket 29). Waist, hips, chest and underbust were the only four
   `measurement.type` could ever be; a person tracking anything else - a
   shoulder, a neck, an arm - had no row for it. `measurement_type` gives
   the type its own vocabulary row, the same `key` NOT NULL / `uuid`
   nullable shape `gender_dimension` uses (ADR-0002): a built-in has a
   `uuid` of NULL and a stable `key`, a custom mints a uuid that doubles as
   both columns. There is no `name`/`min`/`max` split like a dimension's -
   a measurement type has one number, not a scale between two ends - so
   this is closer to `tag`'s shape than `gender_dimension`'s, minus the
   group it would otherwise belong to.

   `measurement.type` cannot keep its CHECK once the set is open to a
   uuid it was never written to allow (same limitation v19 and v31's
   comments describe) - copy, drop, rename, the same shape those two use.
   The index is dropped with the table and has to be recreated after the
   rename; existing rows carry across with their `type` value unchanged,
   which is what lets them go on meaning what they meant, whether that
   value turns out to name a built-in key or, after this ticket, a custom
   type's uuid. */
const SCHEMA_V34 = `
CREATE TABLE measurement_type (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT UNIQUE,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  hidden      INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE measurement_v34 (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  type       TEXT NOT NULL,
  value      REAL NOT NULL,
  unit       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO measurement_v34 (id, uuid, epoch_day, type, value, unit, updated_at)
  SELECT id, uuid, epoch_day, type, value, unit, updated_at FROM measurement;
DROP TABLE measurement;
ALTER TABLE measurement_v34 RENAME TO measurement;
CREATE INDEX idx_measurement_type ON measurement(type, epoch_day);
`;

/* v35: the sizes-and-fit log (phase 5 ticket 23, CONTEXT: "Size record").
   No episode reference, the same reason measurement (v6) has none: it has
   to work whether or not a regimen episode exists. `category` is a closed,
   built-in vocabulary the same way hair_removal_session.area is (v25) -
   garmentCategories.ts holds the list this CHECK enforces. `size` is
   required (there is nothing to log without one); `brand` and `fit_note`
   default to '' the same way hair_removal_session.cost/provider do, since
   neither is ever normalized (ADR-0012's rule for a stored unit applies to
   free text just the same). */
const SCHEMA_V35 = `
CREATE TABLE size_record (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('shirts','pants','dresses','skirts','bras','underwear','shoes','outerwear')),
  size       TEXT NOT NULL,
  brand      TEXT NOT NULL DEFAULT '',
  fit_note   TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_size_record_epoch_day ON size_record(epoch_day);
CREATE INDEX idx_size_record_category ON size_record(category);
`;

/* v36: a body region carries two independent intensities (phase 5 ticket
   31, CONTEXT: "Entry" - amended). Until now a region had one unsigned
   `intensity` that only ever meant distress, so the strongest thing a
   person could say about a part of their body they are at peace with was
   0, which reads the same as never having logged it. The region now holds
   a dysphoria intensity and a euphoria intensity, both nullable and
   independent, so "this hurt", "this felt good" and "both at once" are
   each sayable and none of them is the absence of another.

   A rebuild rather than an added column, because v4 declared `intensity
   NOT NULL` and SQLite cannot relax that in place: a euphoria-only region
   has no dysphoria number to store, and NOT NULL would force one. The
   copy renames the old column to `dysphoria` and leaves every stored value
   exactly as it was - what a person logged as distress is still distress,
   at the same number. Nothing is reinterpreted and nothing is signed.

   The CHECK keeps a row meaningful: a region present with neither
   intensity says nothing that its absence does not already say, so the
   editor drops it on save rather than writing a blank row. */
const SCHEMA_V36 = `
CREATE TABLE entry_body_region_v36 (
  entry_id  INTEGER NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  region    TEXT NOT NULL,
  dysphoria INTEGER,
  euphoria  INTEGER,
  PRIMARY KEY (entry_id, region),
  CHECK (dysphoria IS NOT NULL OR euphoria IS NOT NULL)
);
INSERT INTO entry_body_region_v36 (entry_id, region, dysphoria, euphoria)
  SELECT entry_id, region, intensity, NULL FROM entry_body_region;
DROP TABLE entry_body_region;
ALTER TABLE entry_body_region_v36 RENAME TO entry_body_region;
CREATE INDEX idx_ebr_region ON entry_body_region(region);
`;

/* v37: a second published scale beside Norwood-Hamilton, and a way to
   record a pattern neither of them describes (phase 5 ticket 33).

   `hair_stage` (v13) could only ever hold a Norwood-Hamilton stage, a scale
   defined on men. Someone with the other common pattern had no vocabulary
   at all, and someone with diffuse thinning, which is what many people on
   estrogen and many AFAB people actually have, had nothing to write down.
   `scale` says which published classification a row's `stage` is a grade of
   (hairStageScales.ts carries the citations and the cross-check), so two
   scales' stages are never read as one series and nothing converts between
   them.

   The CHECK pairs the two columns rather than checking each alone, because
   '1' through '5' are grade codes on both scales and mean different things
   on each - a bare `stage IN (...)` would let a Norwood-Hamilton '3v'
   through as a Sinclair grade. `description` is the escape hatch's free
   text and the same CHECK keeps it to `scale = 'other'`: a graded staging
   has nothing to write prose about, and allowing it on one would invite a
   note that reinterprets a published grade.

   A table-level CHECK cannot be altered in place, so this is the copy,
   drop, rename shape v31 and v34 use, and the index goes with the old table
   and is recreated after the rename. Every row that predates this migration
   is a Norwood-Hamilton staging, since that was the only vocabulary there
   was - carried across with its `stage` unchanged so it goes on meaning
   what it meant. */
const SCHEMA_V37 = `
CREATE TABLE hair_stage_v37 (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  epoch_day   INTEGER NOT NULL,
  scale       TEXT NOT NULL,
  stage       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_at  INTEGER NOT NULL,
  CHECK (
    (scale = 'norwood_hamilton' AND description = ''
      AND stage IN ('1','2','2a','3','3v','3a','4','4a','5','5a','6','7'))
    OR (scale = 'sinclair' AND description = '' AND stage IN ('1','2','3','4','5'))
    OR (scale = 'other' AND stage = '')
  )
);
INSERT INTO hair_stage_v37 (id, uuid, epoch_day, scale, stage, description, updated_at)
  SELECT id, uuid, epoch_day, 'norwood_hamilton', stage, '', updated_at FROM hair_stage;
DROP TABLE hair_stage;
ALTER TABLE hair_stage_v37 RENAME TO hair_stage;
CREATE INDEX idx_hair_stage_epoch_day ON hair_stage(epoch_day);
CREATE INDEX idx_hair_stage_scale ON hair_stage(scale, epoch_day);
`;

/* v38: a dose schedule can express a weekday recurrence and per-slot dose
   amounts (phase 5 ticket 40, CONTEXT: "Dose schedule"). Until now a
   schedule was only "every N days, M doses per day", which cannot say
   "Monday and Thursday" without drifting, and carried no dose amount at
   all, so an alternating 2mg/1mg regimen was unrepresentable.

   A rebuild rather than an added column, same reason v36 needed one: v8
   declared `every_n_days NOT NULL`, and a weekday schedule has no every-N
   step to put there. `recurrence_kind` names which shape a row is, and the
   CHECK keeps `every_n_days` present for exactly the arm that uses it - the
   same discriminated-union guarantee `DoseScheduleRecurrence` gives in code,
   enforced again here so a row cannot claim one shape while carrying the
   other's data. Existing rows all become `everyNDays` with their
   `every_n_days` copied across unchanged - nothing is reinterpreted.

   Weekdays and dose amounts are child tables, not columns, the same
   relational shape `dose_pause` and `checklist_item` already use for a
   one-to-many: a schedule has zero or more of each. `weekday` is
   Monday-first (0-6, epochDay.ts's `weekdayOfEpochDay`), and
   `dose_schedule_dose_amount.position` is the cycle order `expectedSlots`
   reads them back in - both empty for a schedule that does not use the
   shape they belong to. */
const SCHEMA_V38 = `
CREATE TABLE dose_schedule_v38 (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  episode_id      INTEGER NOT NULL UNIQUE REFERENCES regimen_episode(id) ON DELETE CASCADE,
  recurrence_kind TEXT NOT NULL DEFAULT 'everyNDays' CHECK (recurrence_kind IN ('everyNDays', 'weekdays')),
  every_n_days    INTEGER,
  doses_per_day   INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  CHECK ((recurrence_kind = 'everyNDays') = (every_n_days IS NOT NULL))
);
INSERT INTO dose_schedule_v38 (id, uuid, episode_id, recurrence_kind, every_n_days, doses_per_day, updated_at)
  SELECT id, uuid, episode_id, 'everyNDays', every_n_days, doses_per_day, updated_at FROM dose_schedule;
DROP TABLE dose_schedule;
ALTER TABLE dose_schedule_v38 RENAME TO dose_schedule;

CREATE TABLE dose_schedule_weekday (
  schedule_id INTEGER NOT NULL REFERENCES dose_schedule(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  PRIMARY KEY (schedule_id, weekday)
);

CREATE TABLE dose_schedule_dose_amount (
  schedule_id INTEGER NOT NULL REFERENCES dose_schedule(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  dose        REAL NOT NULL,
  dose_unit   TEXT NOT NULL,
  PRIMARY KEY (schedule_id, position)
);
`;

/* v39: personal effects widen from a fixed eight to an open catalogue
   (phase 5 ticket 41, the third revisit of this list's closure - it stops
   closing it). Two new reference-data tables and a rebuild:

   `effect_category` is a named, toggleable collection over the effect
   catalogue - "body shape and composition", "skin and hair", "genital and
   sexual", "cognitive and emotional", "sensory" - built-in only, no
   custom-category creation asked for, so it carries just `key`/`name`/
   `enabled` rather than tag_group's fuller shape.

   `personal_effect_type` gives an effect its own vocabulary row, the
   `key` NOT NULL / `uuid` nullable / is_built_in-when-uuid-is-null shape
   `measurement_type` uses (v34): a built-in's `name` stays '' and is
   looked up by key at display time, a custom's minted uuid doubles as
   both columns, exactly this ticket's own scope text. `category_key` is
   nullable - a custom effect may be added uncategorised - and `direction`
   is nullable for the same reason: only a built-in's direction is a claim
   from the source material, and a custom effect gets no direction pushed
   onto it that nobody asked it to have.

   `personal_effect.effect` cannot keep v19's CHECK once the catalogue is
   open past its eight named keys to whatever `personal_effect_type` grows
   - the same limitation v19, v31 and v34's own rebuilds describe. Copy,
   drop, rename, unchanged rows carrying across exactly as v19's and v34's
   did. Validation moves up a layer, to whatever `personal_effect_type`
   rows exist and are not hidden, the same as measurement.type's after
   v34. */
const SCHEMA_V39 = `
CREATE TABLE effect_category (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE personal_effect_type (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT UNIQUE,
  key          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  is_built_in  INTEGER NOT NULL DEFAULT 0,
  category_key TEXT REFERENCES effect_category(key),
  direction    TEXT CHECK (direction IN ('feminizing', 'masculinizing') OR direction IS NULL),
  hidden       INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE personal_effect_v39 (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                    TEXT NOT NULL UNIQUE,
  effect                  TEXT NOT NULL UNIQUE,
  first_noticed_epoch_day INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
INSERT INTO personal_effect_v39 (id, uuid, effect, first_noticed_epoch_day, updated_at)
  SELECT id, uuid, effect, first_noticed_epoch_day, updated_at FROM personal_effect;
DROP TABLE personal_effect;
ALTER TABLE personal_effect_v39 RENAME TO personal_effect;
`;

/* v40: overlapping regimen episodes and dose-level drug attribution (phase
   5 ticket 38, CONTEXT: "Regimen episode", "Dose event"). Two plain
   nullable columns, no rebuild - neither changes an existing CHECK or NOT
   NULL shape.

   `regimen_episode.end_epoch_day` reverses part of v7's own comment: an
   episode's end is now a value the person sets by ending it explicitly,
   not a day derived from whichever episode happens to sort next. That
   derivation stops being able to answer the question at all once two
   episodes for different drugs are allowed to overlap on purpose - there
   is no longer one "next" episode to read an end off. The backfill below
   computes every *existing* episode's end from that old derivation
   (the next episode overall, ordered start_epoch_day then id - the same
   order regimenEpisode.ts's functions have always required - one epoch
   day before it starts, or NULL for the last one) so every journal that
   predates this migration displays and resolves exactly as it did before:
   this is filling in a fact that was already true and implicit, not
   reinterpreting what a stored episode means. A journal's episodes never
   overlapped under the old model (only one episode could ever be active
   at a time), so this backfill cannot manufacture overlap out of history
   that never had any.

   `dose_event.drug` is additive and always starts NULL: no existing dose
   needs one, since attribution only needs a dose's own drug once more
   than one episode can be active on the day it was logged, which no
   pre-v40 journal could ever produce. */
const SCHEMA_V40 = `
ALTER TABLE regimen_episode ADD COLUMN end_epoch_day INTEGER;
ALTER TABLE dose_event ADD COLUMN drug TEXT;

UPDATE regimen_episode AS e
   SET end_epoch_day = (
     SELECT n.start_epoch_day - 1
       FROM regimen_episode n
      WHERE n.start_epoch_day > e.start_epoch_day
         OR (n.start_epoch_day = e.start_epoch_day AND n.id > e.id)
      ORDER BY n.start_epoch_day, n.id
      LIMIT 1
   );
`;

/* v41: the doubt journal's free-write composer is removed (phase 5 ticket
   16, ADR-0037, CONTEXT: "Counterevidence check" replaces "Doubt entry").
   `/doubt` becomes a pure read over the counterevidence pool; there is
   nothing left to write a `doubt_entry` row for.

   The table is dropped outright, taking every existing row with it - the
   app's one deliberate exception to giving deletion an undo window
   (ADR-0037), with no export prompt and no grace period. `doubt_snapshot`
   and `doubt_snapshot_entry` carry no foreign key to `doubt_entry` and are
   untouched: a snapshot is its own frozen copy of what it showed, not a
   reference to a doubt entry. SQLite drops a table's indexes with the
   table, so `idx_doubt_entry_epoch_day` needs no statement of its own. */
const SCHEMA_V41 = `
DROP TABLE doubt_entry;
`;

/* Phase 5 ticket 35: the active preset becomes the list of scales it stood
   for. `prefs.activePreset` named one of eight presets and the app resolved
   it to a dimension list at read time; `prefs.activeScales` is that list,
   ticked directly.

   The translation belongs here rather than in TypeScript because the answer
   is already in the database: the preset's rows say which dimensions it
   offered, and that is exactly what the new preference holds.
   `COALESCE(key, uuid)` is how a preset is identified everywhere else
   (archiveApply.ts, dimensions.ts), so a custom preset translates on the
   same line as a built-in one. The stored value is JSON, hence the substr
   stripping its quotes.

   The order the keys land in is not defined and nothing reads it:
   `reference.activeDimensions` draws the scales in catalogue order, so which
   box was ticked first cannot move a slider.

   No row when there was no preference, and none when the preset it named has
   no dimensions (HAVING, since an aggregate with nothing to aggregate still
   returns one NULL row) - an absent preference falls back to the default
   three, which is what an install that never chose is entitled to. An empty
   list would instead claim somebody had unticked everything.

   Then the old row goes. openPreferences deliberately leaves a key it does
   not recognise in the table, so that a downgrade and a second upgrade do
   not lose it; that rule is about keys from a *newer* build, and this value
   has been read and translated. A database this migration has touched is
   also numbered past what an older build will open at all (ADR-0006), which
   is what makes a new key safe here rather than a widened one. */
const SCHEMA_V42 = `
INSERT INTO pref (key, value)
SELECT 'activeScales', '["' || group_concat(gd.key, '","') || '"]'
FROM pref p
JOIN gender_preset gp ON COALESCE(gp.key, gp.uuid) = substr(p.value, 2, length(p.value) - 2)
JOIN preset_dimension pd ON pd.preset_id = gp.id
JOIN gender_dimension gd ON gd.id = pd.dimension_id
WHERE p.key = 'activePreset'
HAVING count(gd.key) > 0;

DELETE FROM pref WHERE key = 'activePreset';
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
  { version: 17, sql: SCHEMA_V17 },
  { version: 18, sql: SCHEMA_V18 },
  { version: 19, sql: SCHEMA_V19 },
  { version: 20, sql: SCHEMA_V20 },
  { version: 21, sql: SCHEMA_V21 },
  { version: 22, sql: SCHEMA_V22 },
  { version: 23, sql: SCHEMA_V23 },
  { version: 24, sql: SCHEMA_V24 },
  { version: 25, sql: SCHEMA_V25 },
  { version: 26, sql: SCHEMA_V26 },
  { version: 27, sql: SCHEMA_V27 },
  { version: 28, sql: SCHEMA_V28 },
  { version: 29, sql: SCHEMA_V29 },
  { version: 30, sql: SCHEMA_V30 },
  { version: 31, sql: SCHEMA_V31 },
  { version: 32, sql: SCHEMA_V32 },
  { version: 33, sql: SCHEMA_V33 },
  { version: 34, sql: SCHEMA_V34 },
  { version: 35, sql: SCHEMA_V35 },
  { version: 36, sql: SCHEMA_V36 },
  { version: 37, sql: SCHEMA_V37 },
  { version: 38, sql: SCHEMA_V38 },
  { version: 39, sql: SCHEMA_V39 },
  { version: 40, sql: SCHEMA_V40 },
  { version: 41, sql: SCHEMA_V41 },
  { version: 42, sql: SCHEMA_V42 }
];

/** The newest schema this build can produce. Two things refuse a database
    numbered higher than this rather than guessing at it (ADR-0006): the
    migration runner, which computes it from whatever array it was handed,
    and ticket 10's conversion, which has no array to hand and asks here. */
export const LATEST_SCHEMA_VERSION = Math.max(...migrations.map((migration) => migration.version));
