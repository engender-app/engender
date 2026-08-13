/* Android version mapping for ticket 18.

   The public version name must match the same value the web bundle and release
   notes carry (scripts/app-version.mjs), while versionCode must be an integer
   Play can compare monotonically across uploads. */
import { fileURLToPath } from 'node:url';

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

const PRERELEASE_LADDER = new Map([
  ['alpha', 100],
  ['a', 100],
  ['beta', 300],
  ['b', 300],
  ['rc', 500]
]);

/**
 * @param {string} version
 */
export function parseVersion(version) {
  const match = VERSION.exec(version);
  if (!match) throw new Error(`Not a semantic version: ${version}`);
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ?? null
  };
}

/**
 * Release builds sort after any prerelease of the same x.y.z.
 * @param {string | null} prerelease
 */
export function prereleaseRank(prerelease) {
  if (!prerelease) return 999;

  const [labelRaw = 'other', numberRaw = '0'] = prerelease.split('.');
  const label = labelRaw.toLowerCase();
  const base = PRERELEASE_LADDER.get(label) ?? 700;
  const ordinal = Math.max(0, Math.min(99, Number.parseInt(numberRaw, 10) || 0));
  return base + ordinal;
}

/**
 * One integer Play can compare, derived from semver.
 *
 * major/minor/patch each get three digits, then a three-digit prerelease rank.
 * Example: 1.2.3        -> 1002003999
 *          1.2.3-beta.2 -> 1002003302
 *
 * @param {string} version
 */
export function androidVersionCode(version) {
  const { major, minor, patch, prerelease } = parseVersion(version);
  if (minor > 999 || patch > 999) {
    throw new Error(`Minor and patch must be <= 999 for Android versionCode: ${version}`);
  }
  const code = (major * 1_000_000 + minor * 1_000 + patch) * 1_000 + prereleaseRank(prerelease);
  if (code > 2_100_000_000) {
    throw new Error(`Android versionCode exceeds Play limit: ${code}`);
  }
  return code;
}

/**
 * @param {string} version
 */
export function androidVersion(version) {
  return {
    versionName: version,
    versionCode: androidVersionCode(version)
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/android-version.mjs <semver> [--json]');
    process.exit(1);
  }
  const out = androidVersion(version);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(out));
  } else {
    console.log(`ANDROID_VERSION_NAME=${out.versionName}`);
    console.log(`ANDROID_VERSION_CODE=${out.versionCode}`);
  }
}
