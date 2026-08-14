/* One safe path to a GitHub release tag.

   The release workflow publishes signed Android artifacts only when a signed
   `v<semver>` tag is pushed. Manual GitHub releases can bypass that and leave
   Obtainium with no suitable APK, so this script cuts and pushes only tags
   that trigger the workflow contract.

   Usage:
     node scripts/cut-release-tag.mjs <version>
     node scripts/cut-release-tag.mjs <version> --dry-run
     node scripts/cut-release-tag.mjs <version> --no-push */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractReleaseNotes } from './release-notes.mjs';

export const RELEASE_VERSION_RE = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

/** @param {string} message */
function die(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  node scripts/cut-release-tag.mjs <version> [--dry-run] [--no-push]

Examples:
  node scripts/cut-release-tag.mjs 1.3.0
  node scripts/cut-release-tag.mjs 1.4.0-alpha.1 --dry-run`);
}

/**
 * @param {string} raw
 */
export function normalizeVersionArg(raw) {
  const value = raw.trim();
  const match = RELEASE_VERSION_RE.exec(value);
  if (!match) {
    throw new Error(
      `Invalid version "${raw}". Use semver with optional prerelease, e.g. 1.2.3 or 1.2.3-alpha.1.`
    );
  }
  return match[1];
}

/**
 * @param {string} version
 */
export function releaseTagForVersion(version) {
  return `v${version}`;
}

/**
 * @typedef {{dryRun: boolean, push: boolean, versionArg: string | null, help?: boolean}} ReleaseTagArgs
 */

/**
 * @param {string[]} argv
 * @returns {ReleaseTagArgs}
 */
export function parseReleaseTagArgs(argv) {
  /** @type {ReleaseTagArgs} */
  const options = {
    dryRun: false,
    push: true,
    versionArg: null
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-push') {
      options.push = false;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (options.versionArg !== null) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    options.versionArg = arg;
  }

  return options;
}

/**
 * @param {string[]} args
 * @param {'pipe'|'inherit'} [output]
 */
function git(args, output = 'pipe') {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: output === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe']
  }).trim();
}

/**
 * @param {string[]} args
 */
function gitOk(args) {
  try {
    execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function assertCleanTree() {
  const status = git(['status', '--porcelain']);
  if (status) {
    throw new Error('Working tree is not clean. Commit or stash changes before cutting a release tag.');
  }
}

function assertMainTip() {
  const branch = git(['branch', '--show-current']);
  if (branch !== 'main') {
    throw new Error(`Current branch is ${branch || '(detached)'}. Cut releases from main.`);
  }

  git(['fetch', 'origin', 'main', '--tags'], 'inherit');
  const head = git(['rev-parse', 'HEAD']);
  const upstream = git(['rev-parse', 'origin/main']);
  if (head !== upstream) {
    throw new Error('HEAD is not origin/main. Pull/merge main before cutting a release tag.');
  }
}

/**
 * @param {string} version
 */
function assertChangelogSection(version) {
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  extractReleaseNotes(changelog, version);
}

/**
 * @param {string} tag
 */
function assertTagMissing(tag) {
  if (gitOk(['rev-parse', '-q', '--verify', `refs/tags/${tag}`])) {
    throw new Error(`Tag ${tag} already exists locally.`);
  }
  if (gitOk(['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`])) {
    throw new Error(`Tag ${tag} already exists on origin.`);
  }
}

/**
 * @param {string} tag
 * @param {string} version
 */
function createSignedTag(tag, version) {
  try {
    git(['tag', '--sign', '--annotate', tag, '--message', `Release ${version}`], 'inherit');
  } catch {
    throw new Error(
      `Failed to create signed tag ${tag}. Ensure your signing key is configured and unlocked in git.`
    );
  }

  const signature = git(['for-each-ref', '--format=%(contents:signature)', `refs/tags/${tag}`]);
  if (!signature.trim()) {
    throw new Error(`Tag ${tag} has no signature.`);
  }
}

/**
 * @param {string} tag
 */
function pushTag(tag) {
  git(['push', 'origin', `refs/tags/${tag}`], 'inherit');
}

function run(argv = process.argv.slice(2)) {
  const parsed = parseReleaseTagArgs(argv);
  if (parsed.help) {
    usage();
    return;
  }
  if (!parsed.versionArg) {
    usage();
    throw new Error('Missing version argument.');
  }

  const version = normalizeVersionArg(parsed.versionArg);
  const tag = releaseTagForVersion(version);

  assertCleanTree();
  assertMainTip();
  assertChangelogSection(version);
  assertTagMissing(tag);

  if (parsed.dryRun) {
    console.log(`PASS checks for ${tag}`);
    console.log(`Would create signed tag ${tag}`);
    if (parsed.push) console.log(`Would push ${tag} to origin (triggers release workflow)`);
    return;
  }

  createSignedTag(tag, version);
  console.log(`Created signed tag ${tag}`);

  if (parsed.push) {
    pushTag(tag);
    console.log(`Pushed ${tag} to origin`);
    console.log('Release workflow should start from this tag push.');
  } else {
    console.log(`Tag ${tag} is local only (--no-push).`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    die(error instanceof Error ? error.message : String(error));
  }
}
