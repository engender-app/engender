/* Writes `build/release.json` (phase 2 ticket 05): what the release directory
   sitting on the server is, in a form the server and a person can both read
   without unpacking anything.

   Two things need it. The rollback guard needs `schemaMax`, because rolling
   back to code that cannot open the database the release before it migrated is
   the one rollback that loses a journal rather than fixing one. And production
   verification needs a version the origin will admit to, so that "the deploy
   landed" is an assertion rather than a hope.

   There is no matching `schemaMin`. Migrations are forward-only (ADR-0006), so
   every build opens every journal at or below its own number and migrates it
   up; the range is bounded at one end only, and a second field always reading
   zero would suggest otherwise.

   Runs from `npm run build`, after Vite, because it reads what the build wrote. */
import { readFileSync, writeFileSync } from 'node:fs';
import { appVersion } from './app-version.mjs';

function latestSchemaVersion() {
   const source = readFileSync('src/lib/data/sqlite/migrations.ts', 'utf8');
   const versions = [...source.matchAll(/\bversion:\s*(\d+)\b/g)].map((match) => Number.parseInt(match[1], 10));
   if (versions.length === 0) {
      throw new Error('Could not find migration versions in src/lib/data/sqlite/migrations.ts');
   }
   return Math.max(...versions);
}

/* SvelteKit's build id, which is not the public version name (ADR-0022): a
   development build has a timestamp here and `0.0.0-dev+<commit>` above. Read
   from what the build emitted rather than re-derived, so the two can never
   disagree about the same directory. */
const buildId = JSON.parse(readFileSync('build/_app/version.json', 'utf8')).version;

const metadata = {
  version: appVersion(),
  buildId,
   schemaMax: latestSchemaVersion()
};

writeFileSync('build/release.json', `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`release.json: ${metadata.version} (build ${buildId}, schema up to ${metadata.schemaMax})`);
