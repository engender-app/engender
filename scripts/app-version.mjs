/* The public version name, and the only place it is worked out (phase 2
   ticket 01). A signed version tag is the source: the build reads it, the
   About screen shows what the build read, and the release pipeline hands the
   same string to the release notes and the Android artifacts through
   GENDER_DIARY_VERSION rather than each of them asking git a slightly
   different question.

   Anything that is not a signed version tag on an unedited tree is a
   development build and says so, because a build that quietly claims a
   release version is the failure that outlives the mistake: it reaches a
   support request, a release note and a store listing.

   Run it directly - `node scripts/app-version.mjs` - to print what this
   checkout would build as. tests/app-version.test.ts has the rules. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {object} GitFacts
 * @property {string | null} tag   the tag pointing exactly at HEAD, if there is one
 * @property {boolean} signed      whether that tag object carries a signature
 * @property {boolean} dirty       whether the working tree differs from HEAD
 * @property {string | null} sha   the short commit id, or null outside a checkout
 */

/** `v` and a semantic version, which is what a release tag looks like. */
const RELEASE_TAG = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

/** What every version that is not a release starts with. */
const DEVELOPMENT = '0.0.0-dev+';

/** @type {(args: string[]) => string | null} */
function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * What the checkout says about itself. Every call is allowed to fail: there
 * may be no tag, no signature, or no repository at all.
 *
 * @param {(args: string[]) => string | null} [run]
 * @returns {GitFacts}
 */
export function readGitFacts(run = git) {
  const sha = run(['rev-parse', '--short=8', 'HEAD']);
  if (!sha) return { tag: null, signed: false, dirty: false, sha: null };

  const tag = run(['describe', '--tags', '--exact-match', 'HEAD']) || null;
  /* Empty for a lightweight tag, which has no object to sign, and for an
     annotated one that was never signed. Whether the signature verifies is a
     question for whoever holds the public key; ticket 18 owns that. */
  const signature = tag ? run(['for-each-ref', '--format=%(contents:signature)', `refs/tags/${tag}`]) : null;
  // Untracked files included: anything in static/ is copied into the release.
  const status = run(['status', '--porcelain']);

  return { tag, signed: Boolean(signature), dirty: Boolean(status), sha };
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {GitFacts} facts
 * @returns {string}
 */
export function resolveAppVersion(env, facts) {
  const given = env.GENDER_DIARY_VERSION?.trim();
  if (given) return given;

  const release = facts.tag && facts.signed && !facts.dirty ? RELEASE_TAG.exec(facts.tag) : null;
  if (release) return release[1];

  return `${DEVELOPMENT}${facts.sha ? `g${facts.sha}${facts.dirty ? '.dirty' : ''}` : 'unknown'}`;
}

/**
 * Whether a resolved version names a release. Two callers need the question
 * answered the same way (phase 2 ticket 06): the release pipeline refuses to
 * publish a development version, and the build only pins its build id - and
 * with it every chunk hash - when what it was given is reproducible.
 *
 * @param {string} version
 * @returns {boolean}
 */
export function isReleaseVersion(version) {
  return !version.startsWith(DEVELOPMENT);
}

/** What this checkout, right now, would build as. */
export function appVersion() {
  return resolveAppVersion(process.env, readGitFacts());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(appVersion());
