import { readFileSync } from 'node:fs';

export function latestSchemaVersion() {
  /* schema-version.ts owns the number, and schema.test.ts holds it to the
     migration list. Matching `version: N` literals in migrations.ts missed
     every migration whose version is a named constant (121 and 122). */
  const source = readFileSync('src/lib/data/sqlite/schema-version.ts', 'utf8');
  const match = source.match(/export const LATEST_SCHEMA_VERSION = (\d+);/);
  if (!match) {
    throw new Error('Could not find LATEST_SCHEMA_VERSION in src/lib/data/sqlite/schema-version.ts');
  }
  return Number.parseInt(match[1], 10);
}
