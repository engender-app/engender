/* The newest schema this build can produce, written down by hand.

   Derived from the migration array until phase 5 audit ticket 02, which is
   also why it moved out of migrations.ts: reading the number cost every boot
   the SQL text the array carries, and the version is the only part of it a
   journal already on the current schema needs. Nothing in this module may
   import migrations.ts, or the saving is gone - and the squashes (features
   ticket 34, after-release ticket 42) made that saving bigger rather than
   smaller, since the baseline is one 67KB statement.

   Two things refuse a database numbered higher than this rather than guessing
   at it (ADR-0006): the migration runner, and ticket 10's conversion, which
   has no array to hand and asks here.

   The chain is the v88 baseline (what rc.1 shipped) and one step to 119
   (pre-publish ticket 01, which folded 89 to 119 into it). A journal at 89
   to 118 came from a development build and is refused, as one below 88 is.
   Nothing is squashed after 1.0.0: a release's migrations are appended here
   and stay. Version 120 (progress photos) is the first appended step, 121 (the effect
   category split) the second, 122 (progress photo poses) the third.

   A merge hazard, and the second one in this area: the next migration's number
   already collides between parallel branches, and now the number is written
   down in two places. Whoever adds a migration bumps this too, and
   schema.test.ts fails if the two disagree - check it the way the migration
   assertions in that file get checked, by running the schema suite after a
   merge rather than by trusting that both sides of it were touched. */

export const LATEST_SCHEMA_VERSION = 122;
