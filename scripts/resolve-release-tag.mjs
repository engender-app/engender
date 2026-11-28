/* May this tag be released, and what does it name? The release workflow's first
   job asks, and every later job takes the answer (version and commit) from
   its outputs rather than asking again.

   It runs from the default branch's checkout, so the tag is data: nothing in
   the tagged commit executes here. The tag has to be a v<semver> annotated tag
   whose signature verifies against .github/release-signers, on a commit that is
   part of main. Each way of failing says which, because the fix differs.

   Usage: node scripts/resolve-release-tag.mjs <tag>
   Prints `version=` and `sha=` lines, which is the GITHUB_OUTPUT format. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ALLOWED_SIGNERS, RELEASE_TAG, SIGNATURE_PROBLEMS, verifyTagSigner } from './app-version.mjs';

/**
 * @param {string} tag
 * @param {{cwd?: string, signers?: string, mainRef?: string}} [options]
 * @returns {{version: string, sha: string}}
 */
export function resolveReleaseTag(tag, { cwd = '.', signers = ALLOWED_SIGNERS, mainRef = 'origin/main' } = {}) {
  const match = RELEASE_TAG.exec(tag);
  if (!match) throw new Error(`${JSON.stringify(tag)} is not a release tag (v<major>.<minor>.<patch>[-prerelease]).`);

  const git = (/** @type {string[]} */ ...args) =>
    execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

  try {
    git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`);
  } catch {
    throw new Error(`No such tag: ${tag}.`);
  }

  const signature = verifyTagSigner(tag, { cwd, signers });
  if (signature !== 'good') {
    throw new Error(`${tag} is not releasable. ${SIGNATURE_PROBLEMS[signature]}`);
  }

  const sha = git('rev-parse', `refs/tags/${tag}^{commit}`);
  try {
    git('merge-base', '--is-ancestor', sha, mainRef);
  } catch {
    throw new Error(`${tag} names ${sha}, which is not on main.`);
  }
  return { version: match[1], sha };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { version, sha } = resolveReleaseTag(process.argv[2] ?? '');
    console.log(`version=${version}\nsha=${sha}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
