/* The licence of everything the lockfile installs, checked on every pull
   request (phase 2 ticket 06).

   Gender Diary is GPL-3.0-only, and one channel decides for itself whether it
   agrees: F-Droid rebuilds from source and rejects a dependency graph it
   cannot build freely (ticket 18). A dependency that arrives under a licence
   nobody looked at is how that turns into a rejected build months later, when
   the dependency has become load-bearing.

   The allowed list is what this tree actually uses rather than every licence
   that would be acceptable. A new one is then a decision someone makes, with
   the dependency in front of them, instead of passing because the list was
   written wide enough.

   Run `node scripts/check-licences.mjs` to see the tree's licences. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Licences in the tree today, all of them GPL-3.0 compatible. */
const ALLOWED = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'MPL-2.0', '0BSD']);

/** Packages that ship a licence file and no `license` field. Read by hand from
    the file in the published tarball, which is the only place it exists.
    @type {Record<string, string>} */
const READ_BY_HAND = {
  // node_modules/runed/LICENSE: "MIT License", Hunter Johnston and Thomas G. Lopes.
  runed: 'MIT',
  // node_modules/sqlite-wasm-kysely/LICENSE: "MIT License", Opral US Inc.
  'sqlite-wasm-kysely': 'MIT'
};

/**
 * @typedef {object} Installed
 * @property {string} name
 * @property {string} path     where in node_modules it landed
 * @property {string | null} licence
 */

/**
 * @param {Installed[]} packages
 * @returns {string[]}
 */
export function licenceProblems(packages) {
  const problems = [];
  for (const { name, path, licence } of packages) {
    if (licence === null) {
      if (name in READ_BY_HAND) continue;
      problems.push(`${path} declares no licence. Read its LICENSE file and record it in this script.`);
    } else if (!ALLOWED.has(licence)) {
      problems.push(`${path} is ${licence}, which nothing in this project has decided about yet.`);
    }
  }
  return problems;
}

/** Every package the lockfile installs, with the licence it declares. */
function installedPackages() {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  /** @type {Installed[]} */
  const packages = [];

  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue; // The project itself.
    /* npm records the licence in the lockfile for most packages, and for the
       rest it is in the installed package.json - which is also where a
       tarball published without the field can be seen to lack it. */
    let licence = entry.license;
    if (!licence) {
      try {
        licence = JSON.parse(readFileSync(`${path}/package.json`, 'utf8')).license;
      } catch {
        licence = undefined;
      }
    }
    if (licence && typeof licence === 'object') licence = licence.type;

    // The last segment, so a nested copy is named the same as a top-level one.
    packages.push({ name: path.split('node_modules/').pop() ?? path, path, licence: licence ?? null });
  }
  return packages;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packages = installedPackages();
  const problems = licenceProblems(packages);

  for (const problem of problems) console.log('FAIL', problem);
  if (problems.length) {
    console.log(`\n${problems.length} FAILURE(S)`);
    process.exit(1);
  }

  const counted = new Map();
  for (const { name, licence } of packages) {
    const known = licence ?? READ_BY_HAND[name];
    counted.set(known, (counted.get(known) ?? 0) + 1);
  }
  const summary = [...counted].sort((a, b) => b[1] - a[1]).map(([licence, count]) => `${licence} ${count}`);
  console.log(`PASS ${packages.length} package(s), all under a decided licence: ${summary.join(', ')}`);
}
