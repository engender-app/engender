/* The public version name, and the only place it is worked out (phase 2
   ticket 01). A signed version tag is the source: the build reads it, the
   About screen shows what the build read, and the release pipeline hands the
   same string to the release notes and the Android artifacts through
   ENGENDER_VERSION rather than each of them asking git a slightly
   different question.

   Anything that is not a signed version tag on an unedited tree is a
   development build and says so, because a build that quietly claims a
   release version is the failure that outlives the mistake: it reaches a
   support request, a release note and a store listing.

   Run it directly - `node scripts/app-version.mjs` - to print what this
   checkout would build as. tests/app-version.test.ts has the rules. */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {object} GitFacts
 * @property {string | null} tag   the tag pointing exactly at HEAD, if there is one
 * @property {boolean} signed      whether that tag verifies against the allowed signers
 * @property {TagSignature} [signature]  what verification said, when there is a tag
 * @property {boolean} dirty       whether the working tree differs from HEAD
 * @property {string | null} sha   the short commit id, or null outside a checkout
 */

/** @typedef {'good' | 'unsigned' | 'malformed' | 'unknown-signer'} TagSignature */

/** Who may cut a release: the one list that answers it. SSH allowed-signers
    format, kept in the repository so a change to it is a reviewed commit. */
export const ALLOWED_SIGNERS = fileURLToPath(new URL('../.github/release-signers', import.meta.url));

/** `v` and a semantic version, which is what a release tag looks like. */
export const RELEASE_TAG = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

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
 * Whether a tag carries a signature made by a key in the allowed-signers
 * file. Four answers, because the fix for each differs: no signature at all, a
 * signature that cannot be read or checked, a good signature from a key nobody
 * listed, and a good one from a listed key. Only the last lets a release go on.
 *
 * @param {string} tag
 * @param {{signers?: string, cwd?: string}} [options]
 * @returns {TagSignature}
 */
export function verifyTagSigner(tag, { signers = ALLOWED_SIGNERS, cwd = '.' } = {}) {
  const ref = `refs/tags/${tag}`;
  const signature = git(['-C', cwd, 'for-each-ref', '--format=%(contents:signature)', ref]);
  if (!signature) return 'unsigned';
  const result = spawnSync(
    'git',
    ['-C', cwd, '-c', 'gpg.format=ssh', '-c', `gpg.ssh.allowedSignersFile=${signers}`, 'verify-tag', ref],
    { encoding: 'utf8' }
  );
  const said = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 && /Good "git" signature for /.test(said)) return 'good';
  /* A well-formed signature whose key is not listed: git names the key it
     checked, then says "No principal matched". A signature git cannot parse
     also ends in "No principal matched", but never gets the Good line first. */
  if (/Good "git" signature with /.test(said) && /No principal matched/.test(said)) return 'unknown-signer';
  return 'malformed';
}

/** What `--release` tells someone whose tag was refused, per answer.
    @type {Record<Exclude<TagSignature, 'good'>, string>} */
export const SIGNATURE_PROBLEMS = {
  unsigned: 'The tag carries no signature. Cut it with `git tag --sign` (npm run release:tag does).',
  malformed: 'The tag carries a signature that git cannot read or verify as an SSH signature.',
  'unknown-signer': 'The tag is signed by a key that is not in .github/release-signers.'
};

/**
 * What the checkout says about itself. Every call is allowed to fail: there
 * may be no tag, no signature, or no repository at all.
 *
 * @param {(args: string[]) => string | null} [run]
 * @param {(tag: string) => TagSignature} [verify]
 * @returns {GitFacts}
 */
export function readGitFacts(run = git, verify = verifyTagSigner) {
  const sha = run(['rev-parse', '--short=8', 'HEAD']);
  if (!sha) return { tag: null, signed: false, dirty: false, sha: null };

  const tag = run(['describe', '--tags', '--exact-match', 'HEAD']) || null;
  /* A signature block alone proves nothing: anyone can sign with their own
     key. The tag counts as signed only when verification against the
     repository's allowed signers says so (GD-021). */
  const signature = tag ? verify(tag) : undefined;
  // Untracked files included: anything in static/ is copied into the release.
  const status = run(['status', '--porcelain']);

  return { tag, signed: signature === 'good', ...(signature ? { signature } : {}), dirty: Boolean(status), sha };
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {GitFacts} facts
 * @returns {string}
 */
export function resolveAppVersion(env, facts) {
  const given = env.ENGENDER_VERSION?.trim();
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = appVersion();
  /* `--release` is the release pipeline asking, and it wants to be told no
     (ticket 06). Without it a tag that was never signed, or a tag on an edited
     tree, would be answered with a development version and only fail several
     steps later, inside the protected release environment, with a message
     about something else. */
  if (process.argv.includes('--release') && !isReleaseVersion(version)) {
    console.error(
      `${version} is not a release. That needs a signed v<semver> tag on a tree ` +
        'with no edits and no untracked files, or ENGENDER_VERSION set deliberately (ADR-0022).'
    );
    const signature = readGitFacts().signature;
    if (signature && signature !== 'good') console.error(SIGNATURE_PROBLEMS[signature]);
    process.exit(1);
  }
  console.log(version);
}
