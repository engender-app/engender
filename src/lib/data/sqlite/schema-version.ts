/* Latest schema version. Keep it separate from migrations.ts so boot and
   conversion can reject newer databases without loading all migration SQL
   (ADR-0006). Version 88 is the rc.1 baseline. The next released step is
   119. Versions below 88 and between 88 and 119 are development schemas.

   Bump this value when adding a migration. Run schema.test.ts after merging
   to catch number conflicts or disagreement with the migration list. */

export const LATEST_SCHEMA_VERSION = 125;
